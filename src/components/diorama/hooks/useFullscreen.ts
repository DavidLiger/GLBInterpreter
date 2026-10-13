"use client";

import { useEffect, useRef, useState } from "react";
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
const VENDOR_CHANGE_EVENTS = ["fullscreenchange", "webkitfullscreenchange", "mozfullscreenchange", "MSFullscreenChange"] as const;

/**
 * U-26 (Î9) : l'API Fullscreen n'existe pas sur iPhone (le « plein écran » iOS est l'app installée, D-8.8) et elle est
 * inutile quand le livre est ouvert depuis son icône en `display-mode: fullscreen` (manifest du livre).
 */
function fullscreenSupported(): boolean {
  if (typeof document === "undefined" || isDisplayFullscreen()) return false;
  const d = document as VendorDocument;
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled || d.mozFullScreenEnabled || d.msFullscreenEnabled);
}

export function useFullscreen(
  targetRef: React.RefObject<HTMLElement | null>,
  onChange?: (isFs: boolean) => void
) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  // onChange vit dans une ref : l'abonnement est posé une seule fois (sinon il est refait,
  // et handleChange() rappelé, à chaque rendu dont le callback est une fonction fléchée en ligne).
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const handleChange = () => {
      const d = document as VendorDocument;
      const fs = !!(d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement || d.msFullscreenElement);
      setIsFullscreen(fs);
      onChangeRef.current?.(fs);
    };

    for (const type of VENDOR_CHANGE_EVENTS) document.addEventListener(type, handleChange);

    handleChange(); // init
    setIsSupported(fullscreenSupported());

    return () => {
      for (const type of VENDOR_CHANGE_EVENTS) document.removeEventListener(type, handleChange);
    };
  }, []);

  const toggle = async () => {
    const el = targetRef.current;
    if (!el) return;
    // Sortie toujours permise ; seule l'entrée dépend du support (U-26).
    if (!isFullscreen && !fullscreenSupported()) return;
    try {
      if (!isFullscreen) {
        const e = el as VendorElement;
        const req = e.requestFullscreen ?? e.webkitRequestFullscreen ?? e.mozRequestFullScreen ?? e.msRequestFullscreen;
        if (req) await req.call(e);
      } else {
        const d = document as VendorDocument;
        const exit = d.exitFullscreen ?? d.webkitExitFullscreen ?? d.mozCancelFullScreen ?? d.msExitFullscreen;
        if (exit) await exit.call(d);
      }
    } catch (err) {
      console.warn("Fullscreen API error:", err);
    }
  };

  return { isFullscreen, isSupported, toggle };
}
