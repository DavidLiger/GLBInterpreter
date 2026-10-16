"use client";

import React from "react";
import { useTranslation } from "@/contexts/TranslationContext";

interface FullscreenButtonProps {
  isFullscreen: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * Bouton plein écran (Î12) : nommé dans la langue du lecteur, état annoncé (`aria-pressed`), cible de 44 px (U-03).
 * Animation d'entrée et de sortie retirées : la sortie ne jouait jamais (bouton démonté sans `AnimatePresence`, U-01).
 */
export default function FullscreenButton({ isFullscreen, onToggle, className = "" }: FullscreenButtonProps) {
  const { t } = useTranslation();
  const label = isFullscreen ? t.fullscreen.exit : t.fullscreen.enter;
  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-pressed={isFullscreen}
      className={`glbi-icon-btn bg-transparent shadow-none hover:bg-white/10 ${className}`}
      data-testid="fullscreen-button"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- export statique (D-7.5) */}
      <img
        src={isFullscreen ? "icons/dioramas/UI/fullscreen-exit.png" : "icons/dioramas/UI/fullscreen.png"}
        alt=""
        className="w-8 h-8 object-contain"
        draggable={false}
      />
    </button>
  );
}
