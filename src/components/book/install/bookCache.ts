// Cache Storage du livre (Î8, stockage option B). Un livre = un cache `book-<bookId>@<chemin du dossier>` (le Cache
// Storage est partagé par l'origine : deux livres, ou le même livre sous `/` et `/<dépôt>/`, ne doivent pas se nettoyer
// l'un l'autre sur un même hôte, ex. GitHub Pages) ; chaque fichier y est rangé
// sous son URL absolue avec l'en-tête `x-glbi-sha256` (empreinte vérifiée au téléchargement). Le service worker
// (src/sw.ts) sert ces entrées hors ligne ; la page peut aussi les lire directement (GLB, sons) sans dépendre du SW.
//
// L'index installé (`book.json`) est rangé en dernier, une fois tous les fichiers vérifiés : sa présence signifie
// « livre complet ». Après une reconstruction du livre, un fichier dont l'empreinte a changé n'est plus reconnu comme
// installé et se retélécharge (O-14, O-28 ; un GLB en cache masquait une régression en Î7).
import { bookBaseUrl, bookUrl, INDEX_PATH, parseIndex, type BookFile, type BookFilesIndex } from './bookIndex';

export const CACHE_PREFIX = 'book-';
export const SHA_HEADER = 'x-glbi-sha256';

/** Nom du cache d'un livre servi depuis `base` (même règle dans src/sw.ts). */
export const cacheNameFor = (bookId: string, base = bookBaseUrl()) => `${CACHE_PREFIX}${bookId}@${new URL(base).pathname}`;

/** Caches de livres servis depuis `base`. */
const isOwnBookCache = (name: string, base: string) => name.startsWith(CACHE_PREFIX) && name.endsWith(`@${new URL(base).pathname}`);

/** Cache Storage utilisable ? (absent hors contexte sécurisé ; refusé dans certaines navigations privées) */
export async function cacheStorageAvailable(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    await caches.keys();
    return true;
  } catch {
    return false;
  }
}

/** Empreinte enregistrée pour une URL du cache, ou `null`. */
export async function cachedSha(cache: Cache, url: string): Promise<string | null> {
  const res = await cache.match(url);
  return res?.headers.get(SHA_HEADER) ?? null;
}

/** Index installé (livre complet) : cherché dans les caches `book-*` de ce dossier. */
export async function readInstalledIndex(base = bookBaseUrl()): Promise<{ index: BookFilesIndex; cacheName: string } | null> {
  const url = bookUrl(INDEX_PATH, base);
  for (const name of await caches.keys()) {
    if (!isOwnBookCache(name, base)) continue;
    const res = await (await caches.open(name)).match(url);
    if (!res) continue;
    try {
      const index = parseIndex(await res.json());
      if (cacheNameFor(index.bookId, base) === name) return { index, cacheName: name };
    } catch (e) {
      console.warn(`Index installé illisible dans ${name} :`, e);
    }
  }
  return null;
}

/** Fichiers de l'index absents du cache ou dont l'empreinte enregistrée diffère. */
export async function missingFiles(index: BookFilesIndex, base = bookBaseUrl()): Promise<BookFile[]> {
  const cache = await caches.open(cacheNameFor(index.bookId, base));
  const missing: BookFile[] = [];
  for (const f of index.files) {
    if ((await cachedSha(cache, bookUrl(f.path, base))) !== f.sha256) missing.push(f);
  }
  return missing;
}

/**
 * Octets de `f` déjà vérifiés dans le cache : le fichier entier, ou la somme des parties vérifiées d'un fichier découpé
 * dont la recomposition n'est pas encore faite (D-8.7, reprise partie par partie).
 */
export async function verifiedBytes(cache: Cache, f: BookFile, base = bookBaseUrl()): Promise<number> {
  if ((await cachedSha(cache, bookUrl(f.path, base))) === f.sha256) return f.size;
  let n = 0;
  for (const p of f.parts ?? []) if ((await cachedSha(cache, bookUrl(p.path, base))) === p.sha256) n += p.size;
  return n;
}

/** Octets restant à télécharger pour `index` (parties déjà vérifiées déduites). */
export async function remainingBytes(index: BookFilesIndex, base = bookBaseUrl()): Promise<number> {
  const cache = await caches.open(cacheNameFor(index.bookId, base));
  let n = 0;
  for (const f of index.files) n += f.size - (await verifiedBytes(cache, f, base));
  return n;
}

/**
 * Nettoyage après une installation complète : entrées du cache du livre absentes de l'index (anciens fichiers,
 * parties déjà recomposées), autre cache `book-*` de ce dossier (bookId changé), caches des versions d'avant Î8
 * (Serwist : `pages-v2`, `assets-v2`, `images-v2`, `serwist-precache-*`…), base IndexedDB de l'ancien téléchargeur
 * (`webdiorama-downloads`). Les caches `book-*` d'autres dossiers de la même origine ne sont pas touchés.
 */
export async function cleanupAfterInstall(index: BookFilesIndex, base = bookBaseUrl()): Promise<string[]> {
  const removed: string[] = [];
  const name = cacheNameFor(index.bookId, base);
  const keep = new Set([...index.files.map((f) => bookUrl(f.path, base)), bookUrl(INDEX_PATH, base)]);
  const cache = await caches.open(name);
  for (const req of await cache.keys()) {
    if (!keep.has(req.url)) {
      await cache.delete(req);
      removed.push(req.url);
    }
  }
  for (const other of await caches.keys()) {
    if (other !== name && (!other.startsWith(CACHE_PREFIX) || isOwnBookCache(other, base))) {
      await caches.delete(other);
      removed.push(`cache ${other}`);
    }
  }
  try {
    indexedDB.deleteDatabase('webdiorama-downloads');
  } catch {
    /* IndexedDB indisponible : rien à nettoyer */
  }
  return removed;
}

/**
 * Asset du livre lu directement dans le Cache Storage (sans passer par le service worker), ou `null` si absent.
 * Remplace l'ancien `getAssetFromCache` d'IndexedDB ; `path` est le chemin de la config, relatif à la racine du livre.
 */
export async function getAssetFromCache(bookId: string, path: string): Promise<Blob | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const res = await (await caches.open(cacheNameFor(bookId))).match(bookUrl(path));
    return res ? await res.blob() : null;
  } catch {
    return null;
  }
}
