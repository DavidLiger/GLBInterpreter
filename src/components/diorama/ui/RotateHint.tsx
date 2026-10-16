"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "@/contexts/TranslationContext";

interface RotateHintProps {
  show: boolean;
  onDismiss: () => void;
}

// Indice « tourner le téléphone » (Î12, U-23) : texte traduit et annoncé (`role="status"`), image décorative, fermé au
// toucher. Toujours monté sous `AnimatePresence` : la sortie en fondu joue (avant Î12, le composant était démonté par
// son parent et la sortie ne jouait jamais, U-01).
export default function RotateHint({ show, onDismiss }: RotateHintProps) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite" className="absolute inset-x-0 z-50 flex justify-center pointer-events-none" style={{ top: "calc(var(--safe-top) + 3.5rem)" }}>
      <AnimatePresence>
        {show && (
          <motion.button
            type="button"
            onClick={onDismiss}
            className="pointer-events-auto flex flex-col items-center gap-2 rounded-2xl bg-black/70 px-4 py-3 text-white shadow-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            data-testid="rotate-hint"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- export statique (D-7.5) */}
            <img src="icons/dioramas/UI/rotate-phone.png" alt="" className="w-24 h-16 object-contain opacity-80" draggable={false} />
            <span className="text-sm font-semibold">{t.rotate.hint}</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
