"use client";

import React from "react";
import { motion } from "framer-motion";

interface BackButtonProps {
  onClick: () => void;
  className?: string;
}

/**
 * Bouton retour stylisé pour Diorama
 */
export default function BackButton({ onClick, className = "" }: BackButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      title="Retour"
      className={`bg-white text-white rounded-full w-12 h-12 flex items-center justify-center ${className}`}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <img
        src="/icons/dioramas/UI/back.png"
        alt="Retour"
        className="w-8 h-8 object-contain"
      />
    </motion.button>
  );
}
