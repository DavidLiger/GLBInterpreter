"use client";

import { useEffect, useRef } from "react";

export function useResize(callback: () => void) {
  // Le callback vit dans une ref : l'abonnement est posé une seule fois, quelle que soit
  // l'identité du callback au fil des rendus.
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const handleResize = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        callbackRef.current();
      }, 100);
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    callbackRef.current(); // init

    return () => {
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);
}
