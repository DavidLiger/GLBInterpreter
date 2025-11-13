"use client";

import { useEffect, useState } from "react";

export function useOrientation(timeout = 5000) {
  const [isPortrait, setIsPortrait] = useState(false);
  const [showRotateHint, setShowRotateHint] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      const portrait = window.matchMedia("(orientation: portrait)").matches;
      setIsPortrait(portrait);
      
      // ✅ Au premier check, si portrait → montrer le hint
      if (!hasChecked && portrait) {
        setShowRotateHint(true);
        setHasChecked(true);
      }
    };
    
    checkOrientation();

    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);

    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, [hasChecked]);

  useEffect(() => {
    if (isPortrait && hasChecked) {
      setShowRotateHint(true);
      const timer = setTimeout(() => setShowRotateHint(false), timeout);
      return () => clearTimeout(timer);
    } else {
      setShowRotateHint(false);
    }
  }, [isPortrait, timeout, hasChecked]);

  return { isPortrait, showRotateHint };
}