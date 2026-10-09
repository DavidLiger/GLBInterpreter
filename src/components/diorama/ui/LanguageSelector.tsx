"use client";
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "@/contexts/TranslationContext";

const flags = { 
  fr: "icons/flags/fr.png", 
  en: "icons/flags/en.png", 
  es: "icons/flags/es.png" 
};

export default function LanguageSelector() {
  const { lang, setLang } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative z-[10000]"> {/* ✅ Z-index sur le parent */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-3 py-1 bg-white/10 rounded-full text-white text-sm"
      >
        <img src={flags[lang]} alt={lang} className="w-5 h-4 object-cover" />
        {lang}
      </button>
      
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-10 right-0 bg-black/90 rounded-lg p-2 space-y-1 min-w-[100px]" // ✅ min-w pour contraindre
          >
            {(["fr", "en", "es"] as const).map(l => (
              <button
                key={l}
                onClick={() => { setLang(l); setOpen(false); }}
                className={`flex items-center gap-2 px-3 py-2 rounded text-white text-sm w-full ${
                  lang === l ? "bg-green-500" : "hover:bg-white/10"
                }`} // ✅ w-full + text-sm
              >
                <img src={flags[l]} alt={l} className="w-5 h-4 object-cover flex-shrink-0" /> {/* ✅ flex-shrink-0 */}
                <span className="uppercase">{l}</span> {/* ✅ span pour le texte */}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}