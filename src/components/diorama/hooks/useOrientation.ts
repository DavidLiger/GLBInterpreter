"use client";

import { useCallback, useEffect, useState } from "react";

const HINT_SHOWN_KEY = "glbi:rotate-hint-shown";

/**
 * Orientation et indice de rotation (Î12, U-23, U-24).
 *
 * - `isPortrait` suit `matchMedia("(orientation: portrait)")` (événement `change`, plus fiable que `resize` au moment
 *   d'une rotation) ;
 * - l'indice « tourner le téléphone » n'apparaît que sur un appareil tactile (`pointer: coarse`) tenu en portrait,
 *   une fois la scène visible (`enabled` : après « Toucher pour commencer », jamais dans l'atelier), une seule fois par
 *   session, pendant `timeout` ms ; il disparaît dès que l'appareil passe en paysage ou au toucher (`dismiss`).
 *   Avant Î12, l'indice partait au montage, sous l'écran de chargement, et son délai expirait avant que la scène soit
 *   visible ; il apparaissait aussi sur une fenêtre d'ordinateur plus haute que large.
 */
export function useOrientation(timeout = 5000, enabled = true) {
  const [isPortrait, setIsPortrait] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const [showRotateHint, setShowRotateHint] = useState(false);

  useEffect(() => {
    const portrait = window.matchMedia("(orientation: portrait)");
    const pointer = window.matchMedia("(pointer: coarse)");
    const update = () => {
      setIsPortrait(portrait.matches);
      setCoarse(pointer.matches);
    };
    update();
    portrait.addEventListener?.("change", update);
    pointer.addEventListener?.("change", update);
    // Repli des navigateurs qui n'émettent pas `change` sur la requête d'orientation.
    window.addEventListener("orientationchange", update);
    return () => {
      portrait.removeEventListener?.("change", update);
      pointer.removeEventListener?.("change", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  const markShown = useCallback(() => {
    try {
      sessionStorage.setItem(HINT_SHOWN_KEY, "1");
    } catch {
      /* stockage indisponible : indice montré à chaque scène */
    }
  }, []);

  useEffect(() => {
    if (!enabled || !coarse || !isPortrait) {
      // Passé en paysage pendant l'indice : consigne comprise, il n'est plus montré.
      setShowRotateHint((shown) => {
        if (shown) markShown();
        return false;
      });
      return;
    }
    let already = false;
    try {
      already = sessionStorage.getItem(HINT_SHOWN_KEY) === "1";
    } catch {
      /* stockage indisponible */
    }
    if (already) return;
    setShowRotateHint(true);
    const timer = setTimeout(() => {
      setShowRotateHint(false);
      markShown();
    }, timeout);
    return () => clearTimeout(timer);
  }, [enabled, coarse, isPortrait, timeout, markShown]);

  const dismiss = useCallback(() => {
    setShowRotateHint(false);
    markShown();
  }, [markShown]);

  return { isPortrait, showRotateHint, dismissRotateHint: dismiss };
}
