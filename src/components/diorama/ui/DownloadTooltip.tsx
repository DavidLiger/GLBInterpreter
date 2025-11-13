"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "@/contexts/TranslationContext";

interface DownloadTooltipProps {
  bookId: string;
  isPortrait?: boolean;
  variant?: "scene" | "loader"; // ✅ Ajouter
}

export default function DownloadTooltip({ 
  bookId,
  isPortrait = false,
  variant = "scene" // ✅ Ajouter
}: DownloadTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const handleCacheUpdate = () => {
        setIsCached(true);
        setIsVisible(false);
    };

    // ✅ Masquer quand le téléchargement commence
    const handleDownloadStarted = () => {
        setIsVisible(false);
    };

    window.addEventListener('book-cache-updated', handleCacheUpdate);
    window.addEventListener('book-download-started', handleDownloadStarted); // ✅ Nouveau

    return () => {
        window.removeEventListener('book-cache-updated', handleCacheUpdate);
        window.removeEventListener('book-download-started', handleDownloadStarted); // ✅ Nouveau
    };
    }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cached = localStorage.getItem(`book-${bookId}-cached`) === 'true';
    setIsCached(cached);
    
    if (!cached) {
      const showTimeout = setTimeout(() => setIsVisible(true), 2000);
      const hideTimeout = setTimeout(() => setIsVisible(false), 12000);
      
      return () => {
        clearTimeout(showTimeout);
        clearTimeout(hideTimeout);
      };
    }
  }, [bookId]);

  useEffect(() => {
    const handleCacheUpdate = () => {
      setIsCached(true);
      setIsVisible(false);
    };

    window.addEventListener('book-cache-updated', handleCacheUpdate);
    return () => window.removeEventListener('book-cache-updated', handleCacheUpdate);
  }, []);

  if (isCached) return null;

const position = variant === "loader"
  ? "absolute top-[64px] right-8 z-40"
  : isPortrait 
    ? "absolute top-[114px] right-2 z-40" 
    : "absolute top-[66px] right-2 z-40";

const arrowPosition = variant === "loader"
  ? "absolute -top-4 right-14"
  : isPortrait 
    ? "absolute -top-4 right-3" 
    : "absolute -top-4 right-15";

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className={`${position} max-w-[220px]`}
          initial={{ opacity: 0, scale: 0.8, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -10 }}
          transition={{ type: "spring", duration: 0.4 }}
        >
        {/* Bulle de BD - version colorée */}
            <div className="relative bg-gradient-to-br from-blue-50 to-purple-50 text-gray-800 p-3 rounded-2xl shadow-xl border-2 border-blue-300">
            {/* Flèche */}
            <div className={arrowPosition}>
                <svg 
                width="16" 
                height="16" 
                viewBox="0 0 16 16"
                >
                <path 
                    d="M 8,0 L 16,16 L 0,16 Z" 
                    fill="#eff6ff" 
                    stroke="#93c5fd" 
                    strokeWidth="2"
                />
                </svg>
            </div>

            {/* Contenu */}
            <div className="flex flex-col gap-1">
                {/* Première ligne : ampoule + titre + bouton fermer */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                    <span className="text-xl">💡</span>
                    <p className="text-sm font-bold">
                        {t.downloadSuggestion?.title || "Gagnez du temps !"}
                    </p>
                    </div>
                    <button
                    onClick={() => setIsVisible(false)}
                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center hover:bg-gray-200 rounded-full transition text-gray-500"
                    >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    </button>
                </div>
                
                {/* Deuxième ligne : texte sur toute la largeur */}
                <p className="text-xs leading-tight text-gray-600">
                    {t.downloadSuggestion?.message || "Téléchargez tous les dioramas"}
                </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}