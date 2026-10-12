"use client";

import { useEffect, useRef, useState } from "react";
import { isDisplayFullscreen } from "@/components/book/install/platform";

/**
 * U-26 (Î9) : l'API Fullscreen n'existe pas sur iPhone (le « plein écran » iOS est l'app installée, D-8.8) et elle est
 * inutile quand le livre est ouvert depuis son icône en `display-mode: fullscreen` (manifest du livre).
 */
function fullscreenSupported(): boolean {
  if (typeof document === "undefined" || isDisplayFullscreen()) return false;
  const d = document as Document & { webkitFullscreenEnabled?: boolean; mozFullScreenEnabled?: boolean; msFullscreenEnabled?: boolean };
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
      const fs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(fs);
      onChangeRef.current?.(fs);
    };

    document.addEventListener("fullscreenchange", handleChange);
    document.addEventListener("webkitfullscreenchange", handleChange as any);
    document.addEventListener("mozfullscreenchange", handleChange as any);
    document.addEventListener("MSFullscreenChange", handleChange as any);

    handleChange(); // init
    setIsSupported(fullscreenSupported());

    return () => {
      document.removeEventListener("fullscreenchange", handleChange);
      document.removeEventListener("webkitfullscreenchange", handleChange as any);
      document.removeEventListener("mozfullscreenchange", handleChange as any);
      document.removeEventListener("MSFullscreenChange", handleChange as any);
    };
  }, []);

  const toggle = async () => {
    const el = targetRef.current;
    if (!el) return;
    // Sortie toujours permise ; seule l'entrée dépend du support (U-26).
    if (!isFullscreen && !fullscreenSupported()) return;
    try {
      if (!isFullscreen) {
        const req = (el.requestFullscreen ??
          (el as any).webkitRequestFullscreen ??
          (el as any).mozRequestFullScreen ??
          (el as any).msRequestFullscreen) as any;
        if (req) await req.call(el);
      } else {
        const exit = (document.exitFullscreen ??
          (document as any).webkitExitFullscreen ??
          (document as any).mozCancelFullScreen ??
          (document as any).msExitFullscreen) as any;
        if (exit) await exit.call(document);
      }
    } catch (err) {
      console.warn("Fullscreen API error:", err);
    }
  };

  return { isFullscreen, isSupported, toggle };
}
