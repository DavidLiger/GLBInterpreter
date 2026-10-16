"use client";

import React from "react";
import { Info } from "lucide-react";
import { useTranslation } from "@/contexts/TranslationContext";

// Bouton « Informations » (Î12) : nommé dans la langue du lecteur, cible de 44 px (U-03), `aria-haspopup` (ouvre un
// dialogue, qui rend le focus à ce bouton à sa fermeture).
export default function InfoButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={onClick} className="glbi-icon-btn" aria-label={t.info.title} aria-haspopup="dialog" data-testid="info-button">
      <Info size={24} aria-hidden="true" />
    </button>
  );
}
