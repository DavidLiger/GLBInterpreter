// Stockage propre au mini-jeu (MJ1, spec-mini-jeu.md §2, DP-13, DP-25) : fonctions pures et stockage isolé, testés par
// `npm run test:engine`. Deux clés à part, hors de la valeur de progression (figée : `glbinterpreter:progress:<bookId>`) :
//
//   glbinterpreter:game:<bookId>       { best: number }                                 meilleur score
//   glbinterpreter:controls:<bookId>   { side: "right" | "left", size: "normal" | "large" }   réglages des commandes (DP-23 à DP-25)
//
// Lecture tolérante (valeur illisible : pas de meilleur score ; champ illisible d'un réglage : sa valeur par défaut) ;
// stockage absent, refusé ou plein : valeurs gardées en mémoire pour la session, annoncé une fois en console. « Effacer ma
// collection » n'efface ni l'une ni l'autre (comme le volume, `glbinterpreter:audio:<bookId>`). Le moteur (MJ2) les lit ;
// en MJ1, seul l'écran d'attente de `#/jeu` affiche le meilleur score s'il existe.
import type { StorageLike } from "@/components/book/progress";

export const gameKey = (bookId: string) => `glbinterpreter:game:${bookId}`;
export const controlsKey = (bookId: string) => `glbinterpreter:controls:${bookId}`;

/** Réglages des commandes du joueur (DP-24) : côté (droitier = joystick à gauche) et taille des commandes. */
export interface ControlSettings {
  side: "right" | "left";
  size: "normal" | "large";
}
export const DEFAULT_CONTROLS: ControlSettings = { side: "right", size: "normal" };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const json = (raw: string | null): unknown => {
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** Meilleur score lu (`{ best }`, nombre fini ≥ 0) ; `null` si absent ou illisible. */
export function parseBest(raw: string | null): number | null {
  const v = json(raw);
  return isObj(v) && typeof v.best === "number" && Number.isFinite(v.best) && v.best >= 0 ? v.best : null;
}

/** Réglages lus champ par champ ; `ok` faux si une valeur présente était en partie illisible. */
export function parseControls(raw: string | null): { settings: ControlSettings; ok: boolean } {
  const v = json(raw);
  if (v === undefined) return { settings: { ...DEFAULT_CONTROLS }, ok: true };
  const o = isObj(v) ? v : {};
  const side = o.side === "left" || o.side === "right" ? o.side : DEFAULT_CONTROLS.side;
  const size = o.size === "large" || o.size === "normal" ? o.size : DEFAULT_CONTROLS.size;
  return { settings: { side, size }, ok: isObj(v) && side === o.side && size === o.size };
}

type Log = { warn: (...args: unknown[]) => void };

/** Meilleur score et réglages des commandes d'un livre, avec repli en mémoire si le stockage est indisponible. */
export class GameStore {
  private readonly memory = new Map<string, string>();
  private warned = false;

  constructor(
    private readonly bookId: string,
    private readonly storage: StorageLike | null,
    private readonly log: Log = console,
  ) {}

  private read(key: string): string | null {
    if (this.memory.has(key)) return this.memory.get(key)!;
    if (!this.storage) return null;
    try {
      return this.storage.getItem(key);
    } catch (e) {
      this.fallBack(`lecture refusée (${(e as Error).message})`);
      return null;
    }
  }

  private write(key: string, value: string): void {
    if (this.storage && !this.memory.has(key)) {
      try {
        this.storage.setItem(key, value);
        return;
      } catch (e) {
        this.fallBack(`écriture refusée (${(e as Error).message})`);
      }
    } else if (!this.storage) this.fallBack("localStorage indisponible");
    this.memory.set(key, value);
  }

  private fallBack(why: string): void {
    if (this.warned) return;
    this.warned = true;
    this.log.warn(`[JEU] ${why} : meilleur score et réglages gardés en mémoire pour la session`);
  }

  /** Meilleur score, `null` s'il n'y en a pas. */
  best(): number | null {
    return parseBest(this.read(gameKey(this.bookId)));
  }

  /** Fin de partie : enregistre `score` s'il bat le meilleur score ; `record` vrai dans ce cas. */
  recordScore(score: number): { best: number; record: boolean } {
    const before = this.best();
    if (before !== null && score <= before) return { best: before, record: false };
    this.write(gameKey(this.bookId), JSON.stringify({ best: score }));
    return { best: score, record: true };
  }

  controls(): ControlSettings {
    return parseControls(this.read(controlsKey(this.bookId))).settings;
  }

  setControls(c: ControlSettings): void {
    this.write(controlsKey(this.bookId), JSON.stringify({ side: c.side, size: c.size }));
  }
}
