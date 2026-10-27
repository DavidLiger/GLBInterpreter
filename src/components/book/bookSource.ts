// Source du livre lu par le lecteur (Î10). Le lecteur n'a plus de configuration compilée : il lit à l'exécution
// `book.json` et `scenes/<id>.json` du dossier du livre, par chemins relatifs (D-8.1, D-8.4), servis hors ligne par le
// service worker depuis le Cache Storage (Î8). Un même build de l'application sert donc n'importe quel dossier de livre.
//
// En `npm run dev` (pas d'export, pas de service worker), le livre est lu dans `public/dev-book/`, préparé par
// `npm run dev:book -- --source <dossier>` (scènes, GLB optimisés, assets ; non versionné). La fixture de développement
// est ouverte par `#/dev/<scène>`.
import { fixtureScenes, FIXTURE_BOOK_ID } from "@/content/fixtures";
import { parseBuiltScene, parseReaderBook, sceneCard, sceneToEngineConfig, type ReaderBook, type ReaderScene } from "./readerScene";

/** Dossier du livre préparé par `npm run dev:book`, servi par `next dev` depuis `public/`. */
export const DEV_BOOK_DIR = "dev-book/";

/** Préfixe des chemins du livre : racine du dossier construit, ou `dev-book/` en développement. */
export function bookDataBase(): string {
  return process.env.NODE_ENV === "development" ? DEV_BOOK_DIR : "";
}

/** JSON du livre ; `null` si le fichier est absent (404). */
async function fetchBookJson(path: string): Promise<unknown | null> {
  const res = await fetch(path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path} : HTTP ${res.status}`);
  return res.json();
}

/** `book.json` du livre ; `null` s'il n'y en a pas (développement sans `npm run dev:book`). */
export async function loadReaderBook(): Promise<ReaderBook | null> {
  const raw = await fetchBookJson(`${bookDataBase()}book.json`);
  return raw === null ? null : parseReaderBook(raw);
}

/** Scène du livre (`#/s/<scène>`) ; `null` si elle n'en fait pas partie. */
export async function loadReaderScene(book: ReaderBook, sceneId: string): Promise<ReaderScene | null> {
  if (!book.scenes.includes(sceneId)) return null;
  if (book.fixture) return loadFixtureScene(sceneId, book.bookId);
  const base = bookDataBase();
  const raw = await fetchBookJson(`${base}scenes/${encodeURIComponent(sceneId)}.json`);
  if (raw === null) return null;
  const built = parseBuiltScene(raw, sceneId);
  const card = sceneCard(built, base);
  return { kind: "v1", bookId: book.bookId, built, config: sceneToEngineConfig(built, book, base), ...(card ? { card } : {}) };
}

/** Scène de la fixture de développement (import dynamique, hors schéma v1). */
export async function loadFixtureScene(sceneId: string, bookId = FIXTURE_BOOK_ID): Promise<ReaderScene | null> {
  const load = Object.prototype.hasOwnProperty.call(fixtureScenes, sceneId) ? fixtureScenes[sceneId] : undefined;
  return load ? { kind: "fixture", bookId, config: await load() } : null;
}

/** Scènes de la fixture (liens de développement de l'accueil). */
export const fixtureSceneIds = Object.keys(fixtureScenes);
