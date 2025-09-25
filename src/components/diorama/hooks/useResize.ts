"use client";

import { useEffect } from "react";

export function useResize(callback: () => void) {
  useEffect(() => {
    const handleResize = () => {
      setTimeout(() => callback(), 100);
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    callback(); // init

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [callback]);
}
