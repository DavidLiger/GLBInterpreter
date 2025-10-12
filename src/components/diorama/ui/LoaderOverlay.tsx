// LoaderOverlay.tsx
"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface LoaderOverlayProps {
  isPortrait: boolean;
  isMobile: boolean;
  loadingProgress: number;
  isLoaded: boolean; // <-- nouveau
  sceneName?: string;
  loaderImage?: string;
  fontClassName?: string;
  /** callback appelé quand l'utilisateur appuie sur le bouton pour activer le son */
  onStart?: () => void;
}

export default function LoaderOverlay({
  isPortrait,
  isMobile,
  loadingProgress,
  isLoaded,
  sceneName,
  loaderImage,
  fontClassName,
  onStart,
}: LoaderOverlayProps) {
  const [showOverlay, setShowOverlay] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  
  // ⚡ Ne pas utiliser window ici directement
  useEffect(() => {
    const updateVH = () => {
      const vh = window.visualViewport?.height || window.innerHeight;
      setViewportHeight(vh);
    };

    updateVH(); // initial call

    window.addEventListener("resize", updateVH);
    window.addEventListener("orientationchange", updateVH);
    window.visualViewport?.addEventListener("resize", updateVH);

    return () => {
      window.removeEventListener("resize", updateVH);
      window.removeEventListener("orientationchange", updateVH);
      window.visualViewport?.removeEventListener("resize", updateVH);
    };
  }, []);

  // Quand le loader dit que la scène est chargée, on passe en mode "tap to start"
  useEffect(() => {
    if (isLoaded) {
      // léger délai visuel
      const timeout = setTimeout(() => setIsReady(true), 200);
      return () => clearTimeout(timeout);
    }
  }, [isLoaded]);

  const handleStart = () => {
    // Appel au parent (ex: toggleMute / déverrouillage audio)
    if (onStart) onStart();

    // On cache l'overlay (si tu veux que le parent fasse ça, supprime cette ligne)
    setShowOverlay(false);
  };

  return (
    <AnimatePresence>
      {showOverlay && (
        <motion.div
          className="absolute inset-0 flex bg-black z-[100] px-4"
          style={{ height: viewportHeight }} //
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
        >
          <div
            className={`w-full flex flex-col items-center ${
              !isPortrait ? "h-screen justify-center gap-4 py-4" : "justify-center gap-8 py-8"
            }`}
            style={{ minHeight: 0 }}
          >
            <h1
              className={`${fontClassName} text-white font-bold`}
              style={{
                fontSize: !isPortrait ? "clamp(20px, 4.5vw, 28px)" : "clamp(28px, 6vw, 48px)",
              }}
            >
              {sceneName ?? "Scene Diorama"}
            </h1>

            <div
              className={`relative flex items-center justify-center w-full max-w-3xl px-4 ${
                !isPortrait ? "h-[60vh]" : "flex-col gap-6"
              }`}
            >
              <img
                src={loaderImage ?? "/icons/dioramas/UI/scene-preview.png"}
                alt="Scene Preview"
                className="object-contain flex-shrink-0"
                style={{
                  width: !isPortrait ? "clamp(140px, 30vw, 240px)" : "clamp(180px, 36vw, 320px)",
                  height: !isPortrait ? "clamp(140px, 30vw, 240px)" : "clamp(180px, 36vw, 320px)",
                }}
              />

              {!isPortrait ? (
                <div className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col gap-4 text-white">
                  <div className="flex flex-col items-center gap-1">
                    <img
                      src={
                        isMobile
                          ? "/icons/dioramas/UI/one-finger.png"
                          : "/icons/dioramas/UI/mouse-left-click.png"
                      }
                      className="w-8 h-8"
                    />
                    <span className="text-sm">{isMobile ? "Tourner" : "Cliquer / Glisser"}</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <img
                      src={
                        isMobile
                          ? "/icons/dioramas/UI/two-fingers.png"
                          : "/icons/dioramas/UI/mouse-scroll.png"
                      }
                      className="w-8 h-8"
                    />
                    <span className="text-sm">Zoomer</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-row gap-12 mt-6 text-white">
                  <div className="flex flex-col items-center gap-1">
                    <img
                      src={
                        isMobile
                          ? "/icons/dioramas/UI/one-finger.png"
                          : "/icons/dioramas/UI/mouse-left-click.png"
                      }
                      className="w-8 h-8"
                    />
                    <span className="text-sm">{isMobile ? "Tourner" : "Cliquer / Glisser"}</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <img
                      src={
                        isMobile
                          ? "/icons/dioramas/UI/two-fingers.png"
                          : "/icons/dioramas/UI/mouse-scroll.png"
                      }
                      className="w-8 h-8"
                    />
                    <span className="text-sm">Zoomer</span>
                  </div>
                </div>
              )}
            </div>

            <div className="w-full max-w-2xl flex flex-col items-center mt-3">
              {!isReady ? (
                <>
                  <div className="w-64 h-3 bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-green-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, loadingProgress)}%` }}
                      transition={{ ease: "easeOut", duration: 0.2 }}
                    />
                  </div>
                  <span className="text-white mt-2 text-sm">
                    {Math.round(Math.min(100, loadingProgress))}%
                  </span>
                </>
              ) : (
                <motion.button
                  onClick={handleStart}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  className="mt-4 px-6 py-3 bg-green-500 text-black font-semibold rounded-full shadow-lg text-sm uppercase tracking-wider"
                >
                  {isMobile ? "Toucher pour commencer" : "Cliquer pour commencer"}
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
