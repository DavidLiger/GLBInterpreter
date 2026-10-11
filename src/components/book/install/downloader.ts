// Téléchargement complet du livre (Î8 ; reprend L10B.1, L10B.2, L10C.1, L10C.4, L10C.11 et la sémantique d'O-04,
// O-05, O-06, O-08). Source : `book.json.files` (liste générée au build, tailles et empreintes réelles).
//
// - Par lots : quelques fichiers en parallèle ; un seul gros fichier à la fois (mémoire sur iPhone).
// - Vérifié : taille et SHA-256 calculés pendant la réception ; un fichier n'entre dans le cache qu'une fois vérifié,
//   donc une coupure ou une annulation ne laisse jamais un fichier tronqué marqué « complet » (O-04).
// - Reprenable : un fichier déjà en cache avec la bonne empreinte n'est pas retéléchargé ; un fichier découpé (D-8.7)
//   reprend partie par partie.
// - Annulable : l'annulation interrompt les requêtes en cours et ne touche à rien de ce qui est déjà vérifié (O-05) ;
//   elle remonte comme `InstallError` de type `aborted` (O-06).
// - D-8.7 : les parties sont téléchargées et vérifiées une à une, puis recomposées en un fichier logique dont
//   l'empreinte complète est vérifiée avant d'être rangé sous son URL d'origine ; les parties sont ensuite retirées.
import { bookBaseUrl, bookUrl, INDEX_PATH, totalBytes, type BookFile, type BookFilesIndex } from './bookIndex';
import { cacheNameFor, cachedSha, cleanupAfterInstall, missingFiles, SHA_HEADER, verifiedBytes } from './bookCache';
import { Sha256, sha256OfBlob } from './sha256';
import { writeTrace } from './trace';

/** En-tête qui demande au service worker de laisser passer la requête vers le réseau (voir src/sw.ts). */
export const DOWNLOAD_HEADER = 'x-glbi-download';

const CONCURRENCY = 4;
/** Au-delà, un fichier est téléchargé seul (pas deux tampons de cette taille en même temps). */
const BIG_FILE = 8 * 1024 * 1024;
const RETRIES = 3;

export type InstallErrorKind = 'aborted' | 'network' | 'integrity' | 'quota' | 'other';

export class InstallError extends Error {
  constructor(
    readonly kind: InstallErrorKind,
    message: string,
    readonly file?: string,
  ) {
    super(message);
    this.name = 'InstallError';
  }
}

export interface InstallProgress {
  doneBytes: number;
  totalBytes: number;
  doneFiles: number;
  totalFiles: number;
  /** Étape en cours (chemin du fichier, partie, recomposition). */
  current: string;
}

export interface InstallOptions {
  base?: string;
  signal?: AbortSignal;
  onProgress?: (p: InstallProgress) => void;
}

const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError' || (e instanceof InstallError && e.kind === 'aborted');

function classify(e: unknown, file: string): InstallError {
  if (e instanceof InstallError) return e;
  const name = (e as Error)?.name;
  if (name === 'AbortError') return new InstallError('aborted', 'Téléchargement interrompu', file);
  if (name === 'QuotaExceededError') return new InstallError('quota', 'Espace de stockage insuffisant', file);
  if (e instanceof TypeError) return new InstallError('network', `Réseau indisponible (${e.message})`, file);
  return new InstallError('other', (e as Error)?.message ?? String(e), file);
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new InstallError('aborted', 'Téléchargement interrompu'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new InstallError('aborted', 'Téléchargement interrompu'));
    }, { once: true });
  });

/** Télécharge `url`, compte les octets reçus, vérifie taille et empreinte ; renvoie le contenu et son type. */
async function fetchVerified(
  url: string,
  expect: { size: number; sha256: string; label: string },
  signal: AbortSignal | undefined,
  onBytes: (delta: number) => void,
): Promise<{ blob: Blob; type: string }> {
  let counted = 0;
  try {
    const res = await fetch(url, { cache: 'no-store', signal, headers: { [DOWNLOAD_HEADER]: '1' } });
    if (!res.ok) {
      throw new InstallError(res.status === 404 ? 'integrity' : 'network', `HTTP ${res.status} pour ${expect.label}`, expect.label);
    }
    const type = res.headers.get('content-type') ?? '';
    const hash = new Sha256();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
        chunks.push(value as Uint8Array<ArrayBuffer>);
        counted += value.length;
        onBytes(value.length);
      }
    } else {
      const buf = new Uint8Array(await res.arrayBuffer());
      hash.update(buf);
      chunks.push(buf);
      counted = buf.length;
      onBytes(buf.length);
    }
    if (counted !== expect.size) {
      throw new InstallError('integrity', `${expect.label} : ${counted} octets reçus, ${expect.size} attendus`, expect.label);
    }
    const sha = hash.hex();
    if (sha !== expect.sha256) throw new InstallError('integrity', `${expect.label} : empreinte différente de book.json`, expect.label);
    return { blob: new Blob(chunks, { type }), type };
  } catch (e) {
    onBytes(-counted); // les octets d'une tentative échouée ne comptent pas dans la progression
    throw classify(e, expect.label);
  }
}

/** `fetchVerified` avec nouvelles tentatives (réseau et contenu), sans réessayer une annulation ni un manque d'espace. */
async function fetchWithRetry(...args: Parameters<typeof fetchVerified>): Promise<{ blob: Blob; type: string }> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchVerified(...args);
    } catch (e) {
      const err = classify(e, args[1].label);
      if (err.kind === 'aborted' || err.kind === 'quota' || attempt >= RETRIES) throw err;
      console.warn(`Tentative ${attempt}/${RETRIES} échouée pour ${args[1].label} :`, err.message);
      await wait(1000 * 2 ** (attempt - 1), args[2]);
    }
  }
}

function responseFor(blob: Blob, sha256: string, type: string): Response {
  const headers = new Headers({ 'content-length': String(blob.size), [SHA_HEADER]: sha256 });
  if (type) headers.set('content-type', type);
  return new Response(blob, { status: 200, headers });
}

/** Type MIME d'un fichier recomposé (les parties sont servies en `application/octet-stream`). */
function mimeOf(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const types: Record<string, string> = {
    glb: 'model/gltf-binary', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', ogg: 'audio/ogg', opus: 'audio/ogg',
    m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    webp: 'image/webp', avif: 'image/avif', ktx2: 'image/ktx2', json: 'application/json', js: 'text/javascript', wasm: 'application/wasm',
  };
  return types[ext] ?? 'application/octet-stream';
}

/** Verrou simple : un seul gros fichier en cours à la fois. */
function makeLock() {
  let tail = Promise.resolve();
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    const prev = tail;
    let release!: () => void;
    tail = new Promise<void>((r) => (release = r));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

/**
 * Installe le livre décrit par `index` dans son Cache Storage. Résout quand tous les fichiers sont vérifiés et
 * l'index rangé (livre complet). Lève `InstallError` sinon ; ce qui est déjà vérifié reste en cache pour la reprise.
 */
export async function installBook(index: BookFilesIndex, opts: InstallOptions = {}): Promise<void> {
  const base = opts.base ?? bookBaseUrl();
  const signal = opts.signal;
  const cache = await caches.open(cacheNameFor(index.bookId, base));
  const total = totalBytes(index.files);

  let doneBytes = 0;
  let doneFiles = 0;
  let current = '';
  let lastEmit = 0;
  const emit = (force = false) => {
    const now = Date.now();
    if (!force && now - lastEmit < 100) return;
    lastEmit = now;
    opts.onProgress?.({ doneBytes, totalBytes: total, doneFiles, totalFiles: index.files.length, current });
  };
  const step = (s: string) => {
    current = s;
    writeTrace('running', s);
    emit(true);
  };
  const addBytes = (d: number) => {
    doneBytes += d;
    emit();
  };

  try {
    // Pas d'émission avant le comptage de l'acquis : une reprise ne doit pas afficher 0 %.
    current = 'préparation';
    writeTrace('running', current);
    try {
      // Stockage persistant (O-12) : demandé au téléchargement ; un refus n'empêche pas l'installation.
      const persisted = await navigator.storage?.persist?.();
      console.log(`Stockage persistant : ${persisted ? 'accordé' : 'non accordé'}`);
    } catch {
      /* API absente */
    }

    // Acquis (reprise, mise à jour) compté d'emblée : fichiers vérifiés et parties vérifiées des fichiers découpés.
    const todo: BookFile[] = [];
    for (const f of index.files) {
      const v = await verifiedBytes(cache, f, base);
      doneBytes += v;
      if (v === f.size) doneFiles++;
      else todo.push(f);
    }
    step(`${todo.length} fichier(s) à télécharger sur ${index.files.length}`);

    const big = makeLock();
    const queue = [...todo].sort((a, b) => a.size - b.size); // petits fichiers d'abord : progression visible tôt
    let failure: InstallError | null = null;

    const processFile = async (f: BookFile) => {
      const url = bookUrl(f.path, base);
      if (!f.parts) {
        step(f.path);
        const { blob, type } = await fetchWithRetry(url, { size: f.size, sha256: f.sha256, label: f.path }, signal, addBytes);
        await cache.put(url, responseFor(blob, f.sha256, type));
      } else {
        // D-8.7 : parties une à une (reprise partie par partie), puis recomposition vérifiée.
        for (const [i, p] of f.parts.entries()) {
          const partUrl = bookUrl(p.path, base);
          const label = `${f.path}, partie ${i + 1}/${f.parts.length}`;
          if ((await cachedSha(cache, partUrl)) === p.sha256) continue; // déjà compté au départ
          step(label);
          const { blob, type } = await fetchWithRetry(partUrl, { size: p.size, sha256: p.sha256, label }, signal, addBytes);
          await cache.put(partUrl, responseFor(blob, p.sha256, type));
        }
        step(`recomposition de ${f.path} (${f.parts.length} parties)`);
        const blobs: Blob[] = [];
        for (const p of f.parts) {
          const res = await cache.match(bookUrl(p.path, base));
          if (!res) throw new InstallError('integrity', `${p.path} absent du cache à la recomposition`, f.path);
          blobs.push(await res.blob());
        }
        const logical = new Blob(blobs, { type: mimeOf(f.path) });
        step(`vérification de ${f.path}`);
        const sha = await sha256OfBlob(logical);
        if (logical.size !== f.size || sha !== f.sha256) {
          // Parties incohérentes avec le fichier logique : on les retire pour repartir de zéro à la reprise.
          for (const p of f.parts) await cache.delete(bookUrl(p.path, base));
          throw new InstallError('integrity', `${f.path} : fichier recomposé différent de book.json`, f.path);
        }
        await cache.put(url, responseFor(logical, f.sha256, mimeOf(f.path)));
        for (const p of f.parts) await cache.delete(bookUrl(p.path, base));
      }
      doneFiles++;
      emit(true);
    };

    const worker = async () => {
      while (!failure && queue.length) {
        const f = queue.shift()!;
        try {
          if (signal?.aborted) throw new InstallError('aborted', 'Téléchargement interrompu');
          if (f.size > BIG_FILE) await big(() => processFile(f));
          else await processFile(f);
        } catch (e) {
          failure ??= classify(e, f.path);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, queue.length)) }, worker));
    if (failure) throw failure;

    step('vérification finale');
    const missing = await missingFiles(index, base);
    if (missing.length) {
      throw new InstallError('integrity', `${missing.length} fichier(s) manquant(s) après téléchargement (${missing[0].path}…)`);
    }
    // L'index en dernier : sa présence signifie « livre complet » (voir bookCache.ts).
    await cache.put(bookUrl(INDEX_PATH, base), new Response(JSON.stringify(index), { headers: { 'content-type': 'application/json' } }));
    step('nettoyage');
    const removed = await cleanupAfterInstall(index, base);
    if (removed.length) console.log(`Nettoyage : ${removed.length} entrée(s) obsolète(s) retirée(s)`, removed);
    doneBytes = total;
    doneFiles = index.files.length;
    current = 'terminé';
    emit(true);
    writeTrace('done', `livre « ${index.bookId} » installé (${index.files.length} fichiers)`);
  } catch (e) {
    const err = classify(e, current);
    writeTrace(isAbort(err) ? 'paused' : 'error', `${current} : ${err.message}`);
    throw err;
  }
}
