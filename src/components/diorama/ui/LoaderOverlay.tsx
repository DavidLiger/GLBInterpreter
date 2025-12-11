// src/components/diorama/ui/LoaderOverlay.tsx

"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "@/contexts/TranslationContext";
import LanguageSelector from "./LanguageSelector";

interface LoaderOverlayProps {
  isPortrait: boolean;
  isMobile: boolean;
  loadingProgress: number;
  isLoaded: boolean;
  sceneName?: string;
  loaderImage?: string;
  fontClassName?: string;
  autoplay?: boolean;
  bookId?: string;
  onStart?: () => void;
  assetLoadingStatus?: string;
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
  bookId,
  onStart,
  assetLoadingStatus,
}: LoaderOverlayProps & { bookId: string }) {
  const [showOverlay, setShowOverlay] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const { t, lang } = useTranslation();

  const [isRecommendedBrowser, setIsRecommendedBrowser] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent;
      const isRecommended = 
        (/Chrome|CriOS|Brave/i.test(ua) && !/Edg/i.test(ua)) ||
        (/Safari/i.test(ua) && /Apple/i.test(ua) && !/Chrome/i.test(ua));
      
      setIsRecommendedBrowser(isRecommended);
    }
  }, []);

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

  useEffect(() => {
    if (isLoaded) {
      const timeout = setTimeout(() => setIsReady(true), 200);
      return () => clearTimeout(timeout);
    }
  }, [isLoaded]);

  const handleStart = () => {
    if (onStart) onStart();
  };

  return (
    <AnimatePresence>
      {showOverlay && (
        <motion.div
          className="absolute inset-0 flex flex-col bg-black z-[100]"
          style={{ height: viewportHeight ?? '100vh' }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
        >
          {/* ✅ Header avec LanguageSelector */}
          <div className="absolute top-4 right-4 z-10">
            <LanguageSelector />
          </div>

          {/* ✅ Warning navigateur */}
          {isRecommendedBrowser === false && (
            <motion.div 
              className="absolute top-16 left-1/2 -translate-x-1/2 bg-yellow-500/90 text-black px-4 py-2 rounded-full text-xs font-semibold text-center max-w-[90vw] z-10"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {t.loader.browserWarning}
            </motion.div>
          )}

          {/* ✅ Contenu principal - Layout flex optimisé */}
          {/* ✅ Contenu principal - Layout flex optimisé */}
          <div className="flex-1 flex flex-col justify-between items-center px-4" 
            style={{
              paddingTop: isPortrait && isMobile ? '68px' : '32px', // ✅ Plus d'espace = titre descend
              paddingBottom: isPortrait && isMobile ? '44px' : '16px' // ✅ Moins d'espace = bouton monte
            }}
          >
            {/* ✅ Section haute : Titre */}
            <div className="w-full text-center">
              <h1 
                className={`${fontClassName} text-white font-bold`}
                style={{
                  fontSize: isPortrait 
                    ? 'clamp(24px, 6vw, 42px)'
                    : isMobile 
                      ? 'clamp(16px, 3.5vw, 24px)'
                      : 'clamp(18px, 4vw, 32px)'
                }}
              >
                {sceneName ?? 'Scene Diorama'}
              </h1>
            </div>

            {/* ✅ Section centrale : Image */}
            <div className="flex-1 flex items-center justify-center w-full max-w-2xl">
              <motion.img
                src={loaderImage ?? '/icons/dioramas/UI/scene-preview.png'}
                alt="Scene Preview"
                className="object-contain"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4 }}
                style={{
                  maxWidth: isPortrait ? '85%' : '70%',
                  maxHeight: !isPortrait && isMobile
                    ? '45vh'
                    : isPortrait 
                      ? '50vh' 
                      : '60vh',
                }}
              />
            </div>

            {/* ✅ Section basse : Progress bar ou bouton */}
            <div className="w-full flex flex-col items-center gap-3">
              {isReady ? (
                <motion.button
                  onClick={handleStart}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-8 py-3 bg-green-500 text-black font-semibold rounded-full shadow-lg uppercase tracking-wider"
                  style={{
                    fontSize: !isPortrait && isMobile ? '11px' : isPortrait ? '14px' : '12px'
                  }}
                >
                  {isMobile ? t.loader.startMobile : t.loader.start}
                </motion.button>
              ) : (
                <div className="w-full max-w-sm flex flex-col items-center gap-2">
                  {/* Barre de progression */}
                  <div className="relative w-full">
                    <motion.p
                      className="absolute -top-7 text-sm font-bold text-gray-400 whitespace-nowrap"
                      initial={{ left: 0 }}
                      animate={{ left: `${loadingProgress}%` }}
                      transition={{ duration: 0.3 }}
                      style={{ transform: 'translateX(-50%)' }}
                    >
                      {loadingProgress}%
                    </motion.p>
                    
                    <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${loadingProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>
                  
                  {/* Statut détaillé */}
                  {assetLoadingStatus && (
                    <p className="text-center text-xs text-gray-300 animate-pulse px-4">
                      {assetLoadingStatus}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}