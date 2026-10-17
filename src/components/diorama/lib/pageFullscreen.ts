// Plein écran de la page entière (Î13bis, décision de David du 17/10) : l'API Fullscreen exige un geste (activation
// transitoire), et le lecteur n'existe pas encore au clic d'une carte du menu ou de « Passer » du quiz. On met donc en
// plein écran `document.documentElement` : menu, quiz et lecteur partagent le même plein écran, sans nouvelle demande.
// Avant Î13bis, l'élément était le conteneur du lecteur (`useFullscreen(containerRef)`).
//
// Règles inchangées (U-26, Î9 ; F11, Î12) : pas d'entrée en plein écran sans l'API (iPhone) ni quand le livre est ouvert
// depuis son icône en `display-mode: fullscreen` (`isDisplayFullscreen`, qui exclut déjà tout plein écran demandé par l'API).
import { isDisplayFullscreen } from "@/components/book/install/platform";

/** API Fullscreen préfixée (anciens WebKit, Firefox, Edge) : typée ici plutôt qu'en `any` (C-04, Î10). */
type VendorDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  mozFullScreenEnabled?: boolean;
  msFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  mozCancelFullScreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
};
type VendorElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  mozRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};
export const FULLSCREEN_CHANGE_EVENTS = ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"] as const;

/** Un élément est en plein écran par l'API. */
export function isPageFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const d = document as VendorDocument;
  return !!(d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement || d.msFullscreenElement);
}

/** Entrée en plein écran possible (API présente, livre pas déjà ouvert en plein écran depuis son icône). */
export function pageFullscreenSupported(): boolean {
  if (typeof document === "undefined" || isDisplayFullscreen()) return false;
  const d = document as VendorDocument;
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled || d.mozFullScreenEnabled || d.msFullscreenEnabled);
}

/**
 * Met la page en plein écran. À appeler **dans** le gestionnaire d'un geste (clic, toucher) : hors d'un geste, le
 * navigateur refuse (refus silencieux, annoncé en console). Sans effet si la page est déjà en plein écran ou si
 * l'entrée n'est pas possible.
 */
export function requestPageFullscreen(): void {
  if (isPageFullscreen() || !pageFullscreenSupported()) return;
  const e = document.documentElement as VendorElement;
  const req = e.requestFullscreen ?? e.webkitRequestFullscreen ?? e.mozRequestFullScreen ?? e.msRequestFullscreen;
  if (!req) return;
  try {
    const r = req.call(e);
    if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch((err) => console.warn("Plein écran refusé :", err));
  } catch (err) {
    console.warn("Plein écran refusé :", err);
  }
}

/** Sortie du plein écran (toujours permise). */
export function exitPageFullscreen(): void {
  if (!isPageFullscreen()) return;
  const d = document as VendorDocument;
  const exit = d.exitFullscreen ?? d.webkitExitFullscreen ?? d.mozCancelFullScreen ?? d.msExitFullscreen;
  if (!exit) return;
  try {
    const r = exit.call(d);
    if (r && typeof (r as Promise<void>).catch === "function") (r as Promise<void>).catch((err) => console.warn("Fullscreen API error:", err));
  } catch (err) {
    console.warn("Fullscreen API error:", err);
  }
}

// Sortie du plein écran au passage en arrière-plan (Chrome Android quitte le plein écran quand on change d'application) :
// le lecteur la reconnaît à l'heure de la dernière sortie, notée ici, pour redemander le plein écran au premier toucher
// de la scène remontée (Î13bis).
let lastExitAt = -Infinity;
if (typeof document !== "undefined") {
  for (const type of FULLSCREEN_CHANGE_EVENTS) {
    document.addEventListener(type, () => {
      if (!isPageFullscreen()) lastExitAt = performance.now();
    });
  }
}

/** La page est en plein écran, ou en est sortie il y a moins de `withinMs` (sortie provoquée par la mise en arrière-plan). */
export function wasPageFullscreen(withinMs = 1500): boolean {
  return isPageFullscreen() || performance.now() - lastExitAt < withinMs;
}
