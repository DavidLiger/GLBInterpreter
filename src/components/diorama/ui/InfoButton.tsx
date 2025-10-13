"use client";

import React from "react";
import { Info } from "lucide-react";

export default function InfoButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="p-2 bg-black/50 text-white rounded-2xl hover:bg-white/10 transition-colors"
      aria-label="Informations"
    >
      <Info size={24} />
    </button>
  );
}
