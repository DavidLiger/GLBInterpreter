"use client";
import React, { useState } from "react";
import { useHomeTranslation } from "@/contexts/HomeTranslationContext";

const flags = {
  fr: "🇫🇷",
  en: "🇬🇧",
  es: "🇪🇸"
};

export default function HomeLanguageSelector() {
  const { lang, setLang } = useHomeTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed top-24 right-4 z-[60]">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm rounded-full shadow-lg hover:bg-white transition-all"
      >
        <span className="text-xl">{flags[lang]}</span>
        <span className="uppercase font-semibold text-gray-800">{lang}</span>
      </button>

      {open && (
        <>
          {/* Backdrop pour fermer au clic */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          
          {/* Menu dropdown */}
          <div className="absolute top-14 right-0 bg-white rounded-lg shadow-xl p-2 space-y-1 min-w-[120px] z-50">
            {(["fr", "en", "es"] as const).map(l => (
              <button
                key={l}
                onClick={() => {
                  setLang(l);
                  setOpen(false);
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded text-sm w-full transition-colors ${
                  lang === l
                    ? "bg-indigo-600 text-white"
                    : "text-gray-800 hover:bg-gray-100"
                }`}
              >
                <span className="text-lg">{flags[l]}</span>
                <span className="uppercase font-medium">{l}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
