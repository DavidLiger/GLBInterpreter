// Index du livre (Î8) : `book.json` à la racine du dossier construit, écrit par scripts/build-book.ts. Il porte la
// liste `files` { path, size, sha256, parts? } de tout le dossier (application comprise, sauf le service worker et
// l'index lui-même). Contrat : `bookFilesIndexSchema` de src/schema/glbi.ts ; le lecteur n'embarque pas Zod (devDependency)
// et refait ici une vérification de forme minimale.
import type { BookFile, BookFilesIndex } from '@/schema/glbi';

export type { BookFile, BookFilesIndex };

export const INDEX_PATH = 'book.json';

/** Racine du livre : la page unique est à la racine de son dossier (D-8.4), sous `/` comme sous `/<dépôt>/`. */
export function bookBaseUrl(): string {
  return new URL('./', window.location.href).href;
}

/** URL absolue d'un chemin du livre (les entrées de cache sont rangées sous cette forme). */
export function bookUrl(path: string, base = bookBaseUrl()): string {
  return new URL(path.replace(/^(\.\/|\/)+/, ''), base).href;
}

const SHA = /^[0-9a-f]{64}$/;

function isFileLike(v: unknown): v is { path: string; size: number; sha256: string } {
  const f = v as Record<string, unknown> | null;
  return !!f && typeof f.path === 'string' && f.path.length > 0 && Number.isInteger(f.size) && (f.size as number) >= 0 && typeof f.sha256 === 'string' && SHA.test(f.sha256);
}

/** Vérification de forme de l'index ; lève une erreur lisible si le dossier n'est pas un livre construit. */
export function parseIndex(raw: unknown): BookFilesIndex {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o.bookId !== 'string' || !Array.isArray(o.scenes) || !Array.isArray(o.files)) {
    throw new Error('book.json : { bookId, scenes, files } attendu');
  }
  for (const f of o.files) {
    if (!isFileLike(f)) throw new Error(`book.json : entrée de fichier invalide ${JSON.stringify(f)}`);
    const parts = (f as { parts?: unknown }).parts;
    if (parts !== undefined) {
      if (!Array.isArray(parts) || parts.length < 2 || !parts.every(isFileLike)) throw new Error(`book.json : parties invalides pour ${f.path}`);
      if (parts.reduce((s: number, p: { size: number }) => s + p.size, 0) !== f.size) throw new Error(`book.json : somme des parties ≠ taille de ${f.path}`);
    }
  }
  return o as unknown as BookFilesIndex;
}

/** Deux index décrivent-ils exactement les mêmes fichiers (même contenu) ? */
export function sameFiles(a: BookFilesIndex, b: BookFilesIndex): boolean {
  if (a.bookId !== b.bookId || a.files.length !== b.files.length) return false;
  const m = new Map(a.files.map((f) => [f.path, f.sha256]));
  return b.files.every((f) => m.get(f.path) === f.sha256);
}

export const totalBytes = (files: readonly BookFile[]) => files.reduce((s, f) => s + f.size, 0);

/**
 * `book.json` du réseau, jamais depuis un cache HTTP ni depuis le Cache Storage (le service worker le laisse passer
 * vers le réseau ; voir src/sw.ts). `null` hors ligne ou si le serveur ne répond pas dans le délai.
 */
export async function fetchRemoteIndex(base = bookBaseUrl(), timeoutMs = 8000): Promise<BookFilesIndex | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(bookUrl(INDEX_PATH, base), { cache: 'no-store', signal: ctrl.signal, headers: { 'x-glbi-index': 'network' } });
    if (!res.ok) return null;
    return parseIndex(await res.json());
  } catch (e) {
    if ((e as Error).name !== 'AbortError') console.warn('book.json indisponible sur le réseau :', e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
