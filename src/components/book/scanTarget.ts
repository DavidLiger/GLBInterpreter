// Scanner QR interne (Î14) : du texte lu dans un QR à une scène du livre. Fonction pure, testée par `npm run test:engine`.
//
// Décision de David du 17/10 (option c) : un QR est accepté s'il commence par l'adresse imprimée du livre
// (`book.json.origin`, constante du livre, comparée hors ligne) ou par la racine de la page courante (miroir, copie du
// dossier), suivie de `/s/<scène>`, et que la scène figure dans `book.json.scenes`. L'hôte qui sert l'app n'a pas besoin
// d'être celui du QR : un livre servi depuis le miroir GitHub Pages, domaine mort, lit toujours ses QR imprimés. Un QR
// d'un autre livre de la maison (autre `origin`, même forme `/s/<id>`) est refusé, même si l'`id` existe ici.
// MJ1 : le QR du mini-jeu (`<adresse>/jeu`, `dist/qr/<bookId>/jeu.svg`) suit la même règle d'adresse, seulement si le livre
// a un jeu (`book.json.game`) ; ailleurs il est refusé comme un QR étranger.
import { sceneIdFromPath } from "./sceneRoute";

export type ScanResult = { kind: "scene"; sceneId: string } | { kind: "game" } | { kind: "foreign" };

export interface ScanBook {
  /** Adresse imprimée (`book.json.origin`, `https://hôte[/chemin]`) ; absente : seule la racine de la page compte. */
  origin?: string;
  /** Racine du dossier du livre telle que la page la voit (`new URL("./", location.href)`). */
  pageRoot: string;
  scenes: readonly string[];
  /** Le livre a un mini-jeu (`book.json.game`, MJ1) : le QR `/jeu` est accepté, même règle d'adresse que les scènes. */
  game?: boolean;
}

const FOREIGN: ScanResult = { kind: "foreign" };

function prefixOf(base: string | undefined): { origin: string; path: string } | null {
  if (!base) return null;
  try {
    const u = new URL(base);
    return { origin: u.origin, path: u.pathname.replace(/\/+$/, "") };
  } catch {
    return null;
  }
}

/**
 * `https://dino.editions-liger.com/s/trex` → `{ kind: "scene", sceneId: "trex" }` si l'adresse est celle du livre et
 * que `trex` est une de ses scènes ; tout autre texte (autre livre, autre site, texte libre, scène inconnue) → `foreign`.
 * Requête et fragment du QR sont ignorés ; l'hôte est comparé sans distinction de casse (`URL.origin`), port compris.
 */
export function sceneFromScan(text: string, book: ScanBook): ScanResult {
  let u: URL;
  try {
    u = new URL(text.trim());
  } catch {
    return FOREIGN;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return FOREIGN;
  for (const p of [prefixOf(book.origin), prefixOf(book.pageRoot)]) {
    if (!p || u.origin !== p.origin || !u.pathname.startsWith(p.path)) continue;
    const rest = u.pathname.slice(p.path.length);
    // Chemin du QR du jeu après le préfixe : `/jeu`, `/jeu/` ou `/jeu/index.html` (stub du build).
    if (book.game && /^\/jeu\/?(?:index\.html)?$/.test(rest)) return { kind: "game" };
    if (!rest.startsWith("/s/")) continue;
    const id = sceneIdFromPath(rest);
    if (id && book.scenes.includes(id)) return { kind: "scene", sceneId: id };
  }
  return FOREIGN;
}
