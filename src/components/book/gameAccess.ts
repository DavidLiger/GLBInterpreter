// Déblocage du mini-jeu (MJ1, DP-13, spec-mini-jeu.md §2) : fonctions pures, testées par `npm run test:engine`.
// Débloqué = nombre de scènes du livre dont `collected` est vrai (carte gagnée, DP-10) ≥ `unlockThreshold` (toutes les
// scènes s'il est absent ou invalide). La progression n'est que lue : sa clé et sa valeur ne changent pas. Une scène
// inconnue du livre (`collected` d'une scène retirée) ne compte pas.
import type { Progress } from "./progress";

export interface GameAccess {
  unlocked: boolean;
  /** Scènes manipulées encore à gagner (0 si débloqué). */
  remaining: number;
  /** Seuil appliqué. */
  threshold: number;
}

/** Seuil appliqué : `unlockThreshold` s'il est un entier de 1 au nombre de scènes, sinon toutes les scènes du livre. */
export function gameThreshold(scenes: readonly string[], unlockThreshold: number | undefined): number {
  return Number.isInteger(unlockThreshold) && unlockThreshold! >= 1 && unlockThreshold! <= scenes.length ? unlockThreshold! : scenes.length;
}

/** Nombre de scènes du livre dont la carte est gagnée (`collected`). */
export const collectedCount = (p: Pick<Progress, "collected">, scenes: readonly string[]) => scenes.filter((id) => p.collected[id] === true).length;

export function gameAccess(p: Pick<Progress, "collected">, scenes: readonly string[], unlockThreshold: number | undefined): GameAccess {
  const threshold = gameThreshold(scenes, unlockThreshold);
  const remaining = Math.max(0, threshold - collectedCount(p, scenes));
  return { unlocked: remaining === 0, remaining, threshold };
}
