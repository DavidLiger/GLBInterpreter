"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, X } from "lucide-react";
import type { DioramaCredits } from "@/types/diorama";
import { useTranslation } from "@/contexts/TranslationContext";
import LanguageSelector from "./LanguageSelector";

interface InfoModalProps {
  show: boolean;
  onClose: () => void;
  credits?: DioramaCredits;
  isMobile: boolean;
  poiIcon?: string;
}

export default function InfoModal({ show, onClose, credits, isMobile, poiIcon }: InfoModalProps) {
  // Images selon device
  const rotateIcon = isMobile ? "icons/dioramas/UI/one-finger.png" : "icons/dioramas/UI/mouse-left-click.png";
  const zoomIcon = isMobile ? "icons/dioramas/UI/two-fingers.png" : "icons/dioramas/UI/mouse-scroll.png";
  const soundIcon = "icons/dioramas/UI/sound.png"
  const subtitlesIcon = "icons/dioramas/UI/chat_on.png"
  const { t, lang } = useTranslation();

  return (
    <AnimatePresence>
        {show && (
        <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <motion.div
            className="relative bg-zinc-900 text-white rounded-2xl shadow-xl w-[90%] max-w-md p-6 max-h-[80vh] flex flex-col"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            >
            <div className="absolute top-3 right-10">
                <LanguageSelector />
            </div>
            
            <button
                onClick={onClose}
                className="absolute top-3 right-3 z-[101] text-white/70 hover:text-white"
                aria-label="Fermer"
            >
                <X size={20} />
            </button>

            <div className="overflow-y-auto pr-1">
                <h2 className="text-xl font-semibold mb-4 flex flex-row gap-2">
                <Info size={24} /> {t.info.title}
                </h2>

                <p className="text-xs text-gray-500 mt-4">
                    {t.info.recommendedBrowsers}
                </p>

                {credits?.description && (
                <p className="text-sm text-white/90 mb-4">{credits.description[lang]}</p>
                )}

                <div className="space-y-2 text-sm leading-relaxed">
                <div className="flex items-center gap-2">
                    <img src={rotateIcon} alt="Rotation" className="w-7 h-7" />
                    <span>{t.info.rotate} {isMobile ? t.info.rotateMobile : t.info.rotateDesktop}</span>
                </div>
                
                <div className="flex items-center gap-1">
                    <img src={zoomIcon} alt="Zoom" className="w-8 h-8" />
                    <span>{t.info.zoom} {isMobile ? t.info.zoomMobile : t.info.zoomDesktop}</span>
                </div>
                
                <div className="flex items-center gap-3">
                    {poiIcon ? (
                    <motion.img
                        src={poiIcon}
                        alt="POI"
                        className="w-6 h-6 object-contain"
                        animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                        transition={{ duration: 2, repeat: Infinity }}
                    />
                    ) : (
                    <span>📍</span>
                    )}
                    <span>{t.info.poi}</span>
                </div>

                <div className="flex items-center gap-4">
                    <img src={soundIcon} alt="Sound" className="w-5 h-4" />
                    <span>{t.info.sound}</span>
                </div>
                
                <div className="flex items-center gap-3">
                    <img src={subtitlesIcon} alt="Subtitles" className="w-6 h-6" />
                    <span>{t.info.subtitles}</span>
                </div>
                </div>

                {credits && (
                <>
                    <hr className="border-white/20 my-4" />
                    <div className="text-sm space-y-2">
                    {credits.music && credits.music.length > 0 && (
                        <div>
                        <p className="font-semibold">{t.info.music}</p>
                        <ul className="ml-3 list-disc">
                            {credits.music.map((m, i) => (
                            <li key={i}>
                                {m.title}
                                {m.author && ` — ${m.author}`}
                                {m.source && <span className="text-white/60"> ({m.source})</span>}
                            </li>
                            ))}
                        </ul>
                        </div>
                    )}

                    {credits.sounds && credits.sounds.length > 0 && (
                        <div>
                        <p className="font-semibold mt-3">{t.info.sounds}</p>
                        <ul className="ml-3 list-disc">
                            {credits.sounds.map((s, i) => (
                            <li key={i}>
                                {s.title}
                                {s.source && <span className="text-white/60"> ({s.source})</span>}
                            </li>
                            ))}
                        </ul>
                        </div>
                    )}
                    <div className="flex flex-col gap-1 text-center mt-3">
                        {credits.licenses && (
                        <p className="text-xs text-white/60">
                            {t.info.licenses} {credits.licenses.join(", ")}
                        </p>
                        )}
                        <p className="text-xs text-white/50">
                        {credits.project ?? "Projet Diorama"} – © {credits.year ?? "2025"}
                        </p>
                    </div>
                    </div>
                </>
                )}
            </div>
            </motion.div>
        </motion.div>
        )}
    </AnimatePresence>
    );
}
