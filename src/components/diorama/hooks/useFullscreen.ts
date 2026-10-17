"use client";

import { useEffect, useRef, useState } from "react";
import {
  FULLSCREEN_CHANGE_EVENTS, exitPageFullscreen, isPageFullscreen, pageFullscreenSupported, requestPageFullscreen,
} from "../lib/pageFullscreen";

/**
 * Plein écran du lecteur. Î13bis : la page entière (`document.documentElement`, `lib/pageFullscreen.ts`), la même que celle
 * que le menu et le quiz demandent au clic ; avant, le conteneur du lecteur.
 *
 * U-26 (Î9) : l'API Fullscreen n'existe pas sur iPhone (le « plein écran » iOS est l'app installée, D-8.8) et elle est
 * inutile quand le livre est ouvert depuis son icône en `display-mode: fullscreen` (manifest du livre) : `isSupported` faux.
 */
export function useFullscreen(onChange?: (isFs: boolean) => void) {
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
      const fs = isPageFullscreen();
      setIsFullscreen(fs);
      onChangeRef.current?.(fs);
    };

    for (const type of FULLSCREEN_CHANGE_EVENTS) document.addEventListener(type, handleChange);

    handleChange(); // init
    setIsSupported(pageFullscreenSupported());

    return () => {
      for (const type of FULLSCREEN_CHANGE_EVENTS) document.removeEventListener(type, handleChange);
    };
  }, []);

  // Sortie toujours permise ; seule l'entrée dépend du support (U-26).
  const toggle = () => {
    if (isPageFullscreen()) exitPageFullscreen();
    else requestPageFullscreen();
  };

  return { isFullscreen, isSupported, toggle };
}
