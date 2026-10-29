// Routage par hash (D-8.4) : la scène courante est dans `#/s/<scène>`. Réutilisé par le scanner interne (Î14),
// qui extrait `<scène>` du chemin `/s/<scène>` d'un QR et appelle `goToScene`.
import { useSyncExternalStore } from 'react';

const SCENE_ID = /^[a-z0-9][a-z0-9_-]*$/i;

/** `#/s/street` → `street` ; `null` si le hash ne désigne pas une scène. */
export function parseSceneHash(hash: string): string | null {
  const m = /^#\/s\/([^/?#]+)\/?$/.exec(hash);
  if (!m) return null;
  const id = decodeURIComponent(m[1]);
  return SCENE_ID.test(id) ? id : null;
}

/** `#/dev/street` → `street` : fixture de développement (Î10), ouverte seulement en `npm run dev`. */
export function parseDevSceneHash(hash: string): string | null {
  const m = /^#\/dev\/([^/?#]+)\/?$/.exec(hash);
  if (!m) return null;
  const id = decodeURIComponent(m[1]);
  return SCENE_ID.test(id) ? id : null;
}

/** `/s/street`, `/depot/s/street/`, `https://hôte/s/street` → `street` (l'hôte et le préfixe sont ignorés). */
export function sceneIdFromPath(pathOrUrl: string): string | null {
  const m = /\/s\/([^/?#]+)\/?(?:index\.html)?(?:[?#].*)?$/.exec(pathOrUrl);
  if (!m) return null;
  const id = decodeURIComponent(m[1]);
  return SCENE_ID.test(id) ? id : null;
}

/**
 * Mini-jeu (MJ1, spec-mini-jeu.md §2) : `#/jeu` (case du menu, QR `/jeu` par le stub `jeu/index.html`, scanner) et
 * `#/dev/jeu` (développement, hors progression). Un `/` final est admis, comme pour les scènes.
 */
export const GAME_HASH = "#/jeu";
export const isGameHash = (hash: string) => /^#\/jeu\/?$/.test(hash);
export const isDevGameHash = (hash: string) => /^#\/dev\/jeu\/?$/.test(hash);

/** Ouverture du jeu sans rechargement (scanner interne). */
export function goToGame(): void {
  window.location.hash = GAME_HASH.slice(1);
}

export function sceneHref(sceneId: string): string {
  return `#/s/${encodeURIComponent(sceneId)}`;
}

/** Changement de scène sans rechargement. */
export function goToScene(sceneId: string | null): void {
  window.location.hash = sceneId ? `/s/${encodeURIComponent(sceneId)}` : '';
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/**
 * Hash courant : `undefined` au rendu statique (pas de hash au build), puis la valeur du navigateur.
 */
export function useLocationHash(): string | undefined {
  return useSyncExternalStore(subscribe, () => window.location.hash, () => undefined);
}
