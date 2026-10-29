// Entrées du mini-jeu (MJ2, spec-mini-jeu.md §3 « Entrées », DP-23 à DP-27) : règles pures, testées par
// `npm run test:engine` (clavier et manette sur des états simulés), sans DOM.
//
// - Joystick tactile **absolu** : il naît là où le doigt se pose dans sa moitié de l'écran ; vecteur = écart au point de
//   départ, borné au rayon ; haut = haut de l'écran.
// - Réglages du joueur (DP-24, clé `glbinterpreter:controls:<bookId>`, `gameStorage.ts`) : **côté** (droitier : joystick à
//   gauche, boutons à droite ; gaucher : zones échangées) et **taille** (normale : boutons de 64 px ; grande : 88 px,
//   joystick agrandi dans la même proportion). Valables pour tout gabarit, quel que soit son nombre de boutons.
// - Clavier (DP-26) : touches fixes, par position physique (`KeyboardEvent.code`) : flèches et KeyW KeyA KeyS KeyD (ZQSD sur
//   un clavier AZERTY) ; Espace = premier bouton du gabarit, KeyJ KeyK KeyL les suivants ; Échap = pause. Le côté ne change
//   rien au clavier.
// - Manette (DP-27) : API Gamepad, disposition standard (`mapping: "standard"`) : stick gauche ou croix = déplacement ;
//   A (0) = premier bouton du gabarit, B, X, Y (1 à 3) les suivants ; Start (9) = pause.
import type { ControlSettings } from "./gameStorage";

/** Déplacement voulu, repère de l'écran : x vers la droite, y vers le haut ; norme ≤ 1. */
export interface MoveVector {
  x: number;
  y: number;
}

/** Taille des boutons (px) et rayon du joystick (px) selon le réglage de taille. */
export const CONTROL_SIZES = {
  normal: { button: 64, joystick: 56 },
  large: { button: 88, joystick: 77 },
} as const;

/** Côtés de l'écran des deux zones : droitier = joystick à gauche. */
export function controlZones(side: ControlSettings["side"]): { joystick: "left" | "right"; buttons: "left" | "right" } {
  return side === "left" ? { joystick: "right", buttons: "left" } : { joystick: "left", buttons: "right" };
}

/** La moitié d'écran du point `x` (px) est-elle celle du joystick ? */
export function inJoystickZone(x: number, width: number, side: ControlSettings["side"]): boolean {
  const left = x < width / 2;
  return controlZones(side).joystick === "left" ? left : !left;
}

const clampUnit = (v: MoveVector): MoveVector => {
  const n = Math.hypot(v.x, v.y);
  return n > 1 ? { x: v.x / n, y: v.y / n } : v;
};

/**
 * Joystick absolu : départ (`ox`, `oy`) et doigt (`px`, `py`) en px du repère de l'écran (y vers le bas) ; résultat en
 * repère du jeu (y vers le haut), norme ≤ 1 (1 au bord du rayon et au-delà).
 */
export function joystickVector(ox: number, oy: number, px: number, py: number, radius: number): MoveVector {
  if (radius <= 0) return { x: 0, y: 0 };
  return clampUnit({ x: (px - ox) / radius, y: (oy - py) / radius });
}

/** Touches de déplacement, par position physique. */
const MOVE_KEYS: Record<string, MoveVector> = {
  ArrowUp: { x: 0, y: 1 },
  KeyW: { x: 0, y: 1 },
  ArrowDown: { x: 0, y: -1 },
  KeyS: { x: 0, y: -1 },
  ArrowLeft: { x: -1, y: 0 },
  KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyD: { x: 1, y: 0 },
};
/** Boutons du gabarit au clavier, dans l'ordre : Espace, puis J, K, L. */
export const KEY_BUTTONS = ["Space", "KeyJ", "KeyK", "KeyL"] as const;
export const PAUSE_KEY = "Escape";

export const isMoveKey = (code: string) => code in MOVE_KEYS;
/** Index du bouton du gabarit d'une touche, `-1` sinon. */
export const keyButtonIndex = (code: string) => (KEY_BUTTONS as readonly string[]).indexOf(code);
/** Touche gérée par le jeu (empêche le défilement de la page par les flèches et Espace). */
export const isGameKey = (code: string) => isMoveKey(code) || keyButtonIndex(code) >= 0 || code === PAUSE_KEY;

/** Vecteur des touches enfoncées (directions opposées annulées, diagonale normée). */
export function keyboardVector(pressed: ReadonlySet<string>): MoveVector {
  let x = 0;
  let y = 0;
  const seen = new Set<string>();
  for (const code of pressed) {
    const v = MOVE_KEYS[code];
    if (!v) continue;
    // Flèche et lettre de même direction : comptées une fois.
    const dir = `${v.x},${v.y}`;
    if (seen.has(dir)) continue;
    seen.add(dir);
    x += v.x;
    y += v.y;
  }
  x = Math.max(-1, Math.min(1, x));
  y = Math.max(-1, Math.min(1, y));
  return clampUnit({ x, y });
}

/** Surface de l'objet `Gamepad` lue ici (simulable dans les tests). */
export interface GamepadLike {
  mapping: string;
  connected?: boolean;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value?: number }[];
}

export interface PadState {
  move: MoveVector;
  /** Boutons du gabarit enfoncés (A, B, X, Y). */
  buttons: [boolean, boolean, boolean, boolean];
  pause: boolean;
}

/** Zone morte du stick (norme), puis remise à l'échelle sur [0, 1]. */
export const STICK_DEAD_ZONE = 0.2;

/**
 * État d'une manette à disposition standard ; `null` pour une manette sans disposition standard ou déconnectée
 * (ignorée : ses boutons n'ont pas de sens connu).
 */
export function readGamepad(gp: GamepadLike | null | undefined, dead = STICK_DEAD_ZONE): PadState | null {
  if (!gp || gp.connected === false || gp.mapping !== "standard") return null;
  const b = (i: number) => !!gp.buttons[i]?.pressed;
  let x = gp.axes[0] ?? 0;
  let y = -(gp.axes[1] ?? 0);
  const n = Math.hypot(x, y);
  if (n < dead) {
    x = 0;
    y = 0;
  } else {
    const k = Math.min(1, (n - dead) / (1 - dead)) / n;
    x *= k;
    y *= k;
  }
  // Croix (12 haut, 13 bas, 14 gauche, 15 droite) : prioritaire sur le stick quand elle est enfoncée.
  const dx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
  const dy = (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
  const move = dx || dy ? clampUnit({ x: dx, y: dy }) : clampUnit({ x, y });
  return { move, buttons: [b(0), b(1), b(2), b(3)], pause: b(9) };
}

/** Déplacement retenu parmi plusieurs sources (doigt, clavier, manette) : le plus fort. */
export function strongestMove(...moves: (MoveVector | null | undefined)[]): MoveVector {
  let best: MoveVector = { x: 0, y: 0 };
  let bestN = 0;
  for (const m of moves) {
    if (!m) continue;
    const n = Math.hypot(m.x, m.y);
    if (n > bestN) {
      best = m;
      bestN = n;
    }
  }
  return best;
}

/**
 * Fronts montants des boutons : un appui maintenu ne compte qu'une fois. `prev` est mis à jour en place ; renvoie les
 * boutons qui viennent d'être enfoncés.
 */
export function risingEdges(now: readonly boolean[], prev: boolean[]): boolean[] {
  const out = now.map((v, i) => v && !prev[i]);
  for (let i = 0; i < now.length; i++) prev[i] = now[i];
  return out;
}

/** Entrées collectées entre deux images (doigt, clavier, manette), lues par la boucle du jeu. */
export class InputCollector {
  /** Vecteur du joystick tactile (0 sans doigt). */
  touch: MoveVector = { x: 0, y: 0 };
  readonly keys = new Set<string>();
  /** Appuis reçus depuis la dernière lecture, par bouton du gabarit (doigt, clavier). */
  private readonly pending: boolean[] = [false, false, false, false];
  private pausePending = false;
  private readonly padPrev: boolean[] = [false, false, false, false, false];

  press(index: number): void {
    if (index >= 0 && index < this.pending.length) this.pending[index] = true;
  }

  requestPause(): void {
    this.pausePending = true;
  }

  /** Tout relâché (page masquée, pause, nouvelle partie). */
  clear(): void {
    this.touch = { x: 0, y: 0 };
    this.keys.clear();
    this.pending.fill(false);
    this.pausePending = false;
  }

  /**
   * Lecture d'une image : déplacement le plus fort, boutons appuyés depuis la dernière lecture, pause demandée. `pad` :
   * état de la manette (Start et boutons comptés sur leur front montant).
   */
  read(pad: PadState | null): { move: MoveVector; buttons: boolean[]; pause: boolean } {
    const padNow = pad ? [...pad.buttons, pad.pause] : [false, false, false, false, false];
    const edges = risingEdges(padNow, this.padPrev);
    const buttons = this.pending.map((p, i) => p || edges[i]);
    const pause = this.pausePending || edges[4];
    this.pending.fill(false);
    this.pausePending = false;
    return { move: strongestMove(this.touch, keyboardVector(this.keys), pad?.move), buttons, pause };
  }
}
