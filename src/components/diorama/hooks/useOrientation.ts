"use client";

import { useEffect, useState } from "react";

export function useOrientation(timeout = 5000) {
  const [isPortrait, setIsPortrait] = useState(false);
  const [showRotateHint, setShowRotateHint] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.matchMedia("(orientation: portrait)").matches);
    };
    checkOrientation();

    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);

    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, []);

  useEffect(() => {
    if (isPortrait) {
      setShowRotateHint(true);
      const timer = setTimeout(() => setShowRotateHint(false), timeout);
      return () => clearTimeout(timer);
    } else {
      setShowRotateHint(false);
    }
  }, [isPortrait, timeout]);

  return { isPortrait, showRotateHint };
}
