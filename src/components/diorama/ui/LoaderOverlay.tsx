// LoaderOverlay.tsx
"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "@/contexts/TranslationContext";
import LanguageSelector from "./LanguageSelector";

interface LoaderOverlayProps {
  isPortrait: boolean;
  isMobile: boolean;
  loadingProgress: number;
  isLoaded: boolean; // <-- nouveau
  sceneName?: string;
  loaderImage?: string;
  fontClassName?: string;
  autoplay?: boolean; // ← NOUVEAU
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
  autoplay = false,
  onStart,
}: LoaderOverlayProps) {
  const [showOverlay, setShowOverlay] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const { t, lang } = useTranslation();

    // ✅ Détection navigateur UNIQUEMENT côté client
  const [isRecommendedBrowser, setIsRecommendedBrowser] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent;
      
      // Détecter Chrome, Brave, Safari (whitelist)
      const isRecommended = 
        (/Chrome|CriOS|Brave/i.test(ua) && !/Edg/i.test(ua)) || // Chrome/Brave
        (/Safari/i.test(ua) && /Apple/i.test(ua) && !/Chrome/i.test(ua)); // Safari
      
      console.log('🔍 User Agent:', ua);
      console.log('✅ Navigateur recommandé:', isRecommended);
      
      setIsRecommendedBrowser(isRecommended);
    }
  }, []);

  // ⚡ Ne pas utiliser window ici directement
  useEffect(() => {
    const updateVH = () => {
      setViewportHeight(window.visualViewport?.height || window.innerHeight);
    };
    updateVH();
    window.addEventListener("resize", updateVH);
    window.addEventListener("orientationchange", updateVH);
    window.visualViewport?.addEventListener("resize", updateVH);
    return () => {
      window.removeEventListener("resize", updateVH);
      window.removeEventListener("orientationchange", updateVH);
      window.visualViewport?.removeEventListener("resize", updateVH);
    };
  }, []);

  // Ne rien rendre côté serveur
  const height = viewportHeight ?? 0;

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
    // setShowOverlay(false);
  };

  return (
    <AnimatePresence>
      {showOverlay && (
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center bg-black z-[100] px-4"
          style={{ height: viewportHeight ?? '100vh', position: 'relative' }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
        >
          <div className="absolute top-4 right-4">
            <LanguageSelector />
          </div>
          {/* ✅ Afficher seulement si détecté ET non recommandé */}
          {isRecommendedBrowser === false && (
            <motion.div 
              className="absolute top-16 left-1/2 -translate-x-1/2 bg-yellow-500/90 text-black px-4 py-2 rounded-full text-xs font-semibold text-center max-w-[90vw]"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {t.loader.browserWarning}
            </motion.div>
          )}
          {/* Image + titre */}
          <div className="flex flex-col items-center gap-4">
            <h1 className={`${fontClassName} text-white font-bold text-center`} style={{ fontSize: !isPortrait ? 'clamp(20px, 4.5vw, 28px)' : 'clamp(28px, 6vw, 48px)' }}>
              {sceneName ?? 'Scene Diorama'}
            </h1>

            <img
              src={loaderImage ?? '/icons/dioramas/UI/scene-preview.png'}
              alt="Scene Preview"
              className="object-contain flex-shrink-0"
              style={{
                width: !isPortrait ? 'clamp(140px, 30vw, 240px)' : 'clamp(180px, 36vw, 320px)',
                height: !isPortrait ? 'clamp(140px, 30vw, 240px)' : 'clamp(180px, 36vw, 320px)',
              }}
            />
          </div>

          {isReady && (
            <motion.button
              onClick={handleStart}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              className="absolute bottom-4 px-6 py-3 bg-green-500 text-black font-semibold rounded-full shadow-lg text-sm uppercase tracking-wider"
            >
              {isMobile ? t.loader.startMobile : t.loader.start}
            </motion.button>
          )}

          {/* Loader progress bar */}
          {!isReady && (
            <div className="absolute bottom-4 flex flex-col items-center gap-2">
              <div className="w-64 h-3 bg-gray-700 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-green-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, loadingProgress)}%` }}
                  transition={{ ease: 'easeOut', duration: 0.2 }}
                />
              </div>
              <span className="text-white mt-2 text-sm">{Math.round(Math.min(100, loadingProgress))}%</span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
