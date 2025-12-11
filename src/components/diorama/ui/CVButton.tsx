"use client";

import React from "react";
import { FileText } from "lucide-react";

interface CVButtonProps {
  onClick: () => void;
}

export default function CVButton({ onClick }: CVButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed right-4 bottom-70 z-[90] w-16 h-16 bg-gradient-to-br from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-full shadow-lg transition-all duration-200 hover:scale-110 active:scale-95 flex flex-col items-center justify-center gap-0.5 p-2"
      aria-label="Voir mon CV"
      title="Voir mon CV"
    >
      <div className="relative">
        {/* Icône document */}
        <FileText size={28} strokeWidth={2.5} />
        
        {/* Badge PDF en petit */}
        <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[7px] font-bold px-1 rounded">
          PDF
        </div>
      </div>
      
      {/* Texte CV */}
      <span className="text-[10px] font-bold tracking-wide -mt-0.5">CV</span>
    </button>
  );
}