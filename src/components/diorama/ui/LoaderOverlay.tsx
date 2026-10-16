// src/components/diorama/ui/LoaderOverlay.tsx

"use client";

// Écran de chargement et « Toucher pour commencer » (Î12).
// - Hauteur (U-21) : celle du lecteur (`100 %`), qui occupe déjà `100dvh` (ou le conteneur de l'atelier) ; plus de
//   mesure de `visualViewport` à chaque redimensionnement, qui laissait une bande quand la barre du navigateur bougeait.
// - Image : `loaderImage` de la scène, sinon l'icône du livre (`icon.png`, présente dans tout livre) ; une image
//   introuvable est masquée au lieu d'afficher une image cassée (`scene-preview.png` n'a jamais existé).
// - Sortie en fondu : le composant est la racine animée sous l'`AnimatePresence` du lecteur (avant Î12, une seconde
//   `AnimatePresence` interne, toujours ouverte, empêchait la sortie de jouer, U-01).
// - Zones sûres : contenu hors encoche ; sélecteur de langue en haut à droite.
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
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
  onStart?: () => void;
  /** Atelier (A2) : rendu dans le conteneur du lecteur (hauteur `100 %` dans les deux cas) ; pas de focus automatique. */
  embedded?: boolean;
}

/** Icône du livre, à la racine de tout dossier de livre (Î9) : image de repli du chargement. */
const FALLBACK_IMAGE = "icon.png";

export default function LoaderOverlay({
  isPortrait,
  isMobile,
  loadingProgress,
  isLoaded,
  sceneName,
  loaderImage,
  fontClassName,
  onStart,
  embedded = false,
}: LoaderOverlayProps) {
  const [isReady, setIsReady] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(loaderImage ?? FALLBACK_IMAGE);
  const { t } = useTranslation();

  // Image changée (atelier : saisie de l'image de chargement)
  useEffect(() => {
    setImageSrc(loaderImage ?? FALLBACK_IMAGE);
  }, [loaderImage]);

  useEffect(() => {
    if (isLoaded) {
      const timeout = setTimeout(() => setIsReady(true), 200);
      return () => clearTimeout(timeout);
    }
  }, [isLoaded]);

  const progress = Math.max(0, Math.min(100, Math.round(loadingProgress)));
  const compact = !isPortrait && isMobile;

  return (
    <motion.div
      className="absolute inset-0 flex flex-col bg-black z-[100]"
      style={{ height: "100%" }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
      data-testid="loader-overlay"
    >
      <div className="glbi-corner-top-right z-10">
        <LanguageSelector />
      </div>

      <div
        className="flex-1 flex flex-col justify-between items-center min-h-0"
        style={{
          // Sélecteur de langue en haut à droite : place réservée au-dessus du titre, ou à côté sur un téléphone couché.
          paddingTop: `calc(var(--safe-top) + ${compact ? "8px" : "3.75rem"})`,
          paddingBottom: `calc(var(--safe-bottom) + ${isPortrait && isMobile ? "32px" : "8px"})`,
          paddingLeft: "calc(var(--safe-left) + 0.5rem)",
          paddingRight: "calc(var(--safe-right) + 0.5rem)",
        }}
      >
        {/* Titre */}
        <div className="w-full text-center" style={compact ? { paddingLeft: "9rem", paddingRight: "9rem" } : undefined}>
          {sceneName && (
            <h1
              className={`${fontClassName ?? ""} text-white font-bold`}
              style={{
                fontSize: isPortrait ? "clamp(24px, 6vw, 42px)" : isMobile ? "clamp(16px, 3.5vw, 24px)" : "clamp(18px, 4vw, 32px)",
              }}
            >
              {sceneName}
            </h1>
          )}
        </div>

        {/* Image */}
        <div className="flex-1 min-h-0 flex items-center justify-center w-full max-w-2xl py-2">
          {imageSrc && (
            <motion.img
              src={imageSrc}
              alt=""
              className="object-contain max-h-full"
              onError={() => setImageSrc((cur) => (cur !== FALLBACK_IMAGE ? FALLBACK_IMAGE : null))}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4 }}
              style={{
                maxWidth: isPortrait ? "85%" : "70%",
                maxHeight: compact ? "45vh" : isPortrait ? "50vh" : "60vh",
              }}
            />
          )}
        </div>

        {/* Progression ou bouton */}
        <div className="w-full flex flex-col items-center gap-3">
          {isReady ? (
            <motion.button
              type="button"
              autoFocus={!embedded}
              onClick={() => onStart?.()}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              className="glbi-btn px-8 bg-green-500 text-black shadow-lg uppercase tracking-wider"
              style={{ fontSize: compact ? "12px" : isPortrait ? "14px" : "13px" }}
            >
              {isMobile ? t.loader.startMobile : t.loader.start}
            </motion.button>
          ) : (
            <div className="w-full max-w-sm flex flex-col items-center gap-2">
              <div className="relative w-full">
                <motion.p
                  className="absolute -top-7 text-sm font-bold text-gray-300 whitespace-nowrap"
                  initial={{ left: 0 }}
                  animate={{ left: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                  style={{ transform: "translateX(-50%)" }}
                  aria-hidden="true"
                >
                  {progress}%
                </motion.p>
                <div
                  className="w-full h-3 bg-gray-700 rounded-full overflow-hidden"
                  role="progressbar"
                  aria-label={t.loader.loading}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                >
                  <motion.div
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
