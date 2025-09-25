"use client";

import React from "react";
import { motion } from "framer-motion";

interface FullscreenButtonProps {
  isFullscreen: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * Bouton plein écran pour Diorama
 */
export default function FullscreenButton({
  isFullscreen,
  onToggle,
  className = "",
}: FullscreenButtonProps) {
  return (
    <motion.button
      onClick={onToggle}
      title={isFullscreen ? "Quitter plein écran" : "Plein écran"}
      className={`bg-white text-white rounded-full w-12 h-12 flex items-center justify-center ${className}`}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <img
        src={
          isFullscreen
            ? "/icons/dioramas/UI/fullscreen-exit.png"
            : "/icons/dioramas/UI/fullscreen.png"
        }
        alt={isFullscreen ? "Quitter plein écran" : "Plein écran"}
        className="w-8 h-8 object-contain"
      />
    </motion.button>
  );
}
