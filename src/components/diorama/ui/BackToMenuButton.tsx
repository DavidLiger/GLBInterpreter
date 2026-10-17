"use client";

import React from "react";
import { LayoutGrid } from "lucide-react";
import { useTranslation } from "@/contexts/TranslationContext";

// Bouton « Retour au menu » d'une scène du livre (Î13, Q4) : coin haut gauche, nommé dans la langue du lecteur, cible
// de 44 px. Affiché seulement si le lecteur reçoit `onBack` (livre ; ni atelier ni fixture de développement).
export default function BackToMenuButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={onClick} className="glbi-icon-btn" aria-label={t.collection.backToMenu} title={t.collection.backToMenu} data-testid="back-to-menu">
      <LayoutGrid size={22} aria-hidden="true" />
    </button>
  );
}
