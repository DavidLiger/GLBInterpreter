// src/components/diorama/audio/VolumeControl.tsx
//
// Volume et sourdine (Î11) : `volume` est le dernier volume non nul, `muted` la sourdine (lib/audioEngine.ts) ; le curseur
// montre le volume effectif (0 en sourdine). Accessibilité (A-32, U-03) : boutons nommés dans la langue du lecteur, état
// ouvert (`aria-expanded`) et sourdine (`aria-pressed`) annoncés, curseur au clavier (flèches, pas de 5 %, Origine/Fin),
// valeur lue en pourcentage, Échap ferme le panneau et rend le focus au bouton, cibles d'au moins 44 px.

"use client";

import { useState, useRef, useEffect, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "@/contexts/TranslationContext";

interface VolumeControlProps {
  /** Dernier volume non nul, dans ]0, 1]. */
  volume: number;
  muted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
}

export default function VolumeControl({ volume, muted, onVolumeChange, onToggleMute }: VolumeControlProps) {
  const { t } = useTranslation();
  const [showPanel, setShowPanel] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const shown = muted ? 0 : volume;
  const percent = Math.round(shown * 100);

  // Fermeture : pointeur hors du contrôle (souris et toucher), Échap (focus rendu au bouton)
  useEffect(() => {
    if (!showPanel) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowPanel(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowPanel(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showPanel]);

  // Molette sur le panneau : ±5 % par cran
  useEffect(() => {
    if (!showPanel || !panelRef.current) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      onVolumeChange(Math.max(0, Math.min(1, shown + (e.deltaY < 0 ? 0.05 : -0.05))));
    };
    const panel = panelRef.current;
    panel.addEventListener("wheel", handleWheel, { passive: false });
    return () => panel.removeEventListener("wheel", handleWheel);
  }, [showPanel, shown, onVolumeChange]);

  const iconSrc = muted ? "icons/dioramas/UI/muted.png" : "icons/dioramas/UI/sound.png";

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setShowPanel(!showPanel)}
        aria-label={muted ? `${t.volume.button} (${t.volume.muted})` : `${t.volume.button} ${percent} %`}
        aria-expanded={showPanel}
        aria-controls={panelId}
        className="rounded-full w-11 h-11 flex items-center justify-center shadow-lg transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        data-testid="volume-button"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- export statique (D-7.5) */}
        <img src={iconSrc} alt="" className="w-8 h-8 object-contain" draggable={false} />
      </button>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            ref={panelRef}
            id={panelId}
            role="group"
            aria-label={t.volume.panel}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md rounded-2xl p-2 shadow-2xl border border-white/10 flex flex-col items-center"
            style={{ width: "60px" }}
          >
            {/* Curseur vertical : piste dessinée en dessous, champ natif tourné par-dessus (clavier et lecteurs d'écran) */}
            <div className="relative flex flex-col items-center mb-2" style={{ height: "128px", width: "44px" }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-24 bg-white/20 rounded-full overflow-hidden" aria-hidden="true">
                <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-blue-500 to-purple-600" style={{ height: `${percent}%` }} />
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={percent}
                aria-label={t.volume.slider}
                aria-valuetext={muted ? `0 % (${t.volume.muted})` : `${percent} %`}
                aria-orientation="vertical"
                onChange={(e) => onVolumeChange(parseInt(e.target.value, 10) / 100)}
                className="volume-slider absolute z-10"
                data-testid="volume-slider"
                style={{
                  top: "48px",
                  left: "50%",
                  width: "96px",
                  height: "44px",
                  transform: "translate(-50%, -50%) rotate(-90deg)",
                }}
              />
              <span className="absolute bottom-0 text-white text-xs" aria-hidden="true">
                {percent}%
              </span>
            </div>

            <button
              type="button"
              onClick={onToggleMute}
              aria-pressed={muted}
              aria-label={muted ? t.volume.unmute : t.volume.mute}
              className="w-11 h-11 rounded-lg hover:bg-white/10 transition flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              data-testid="volume-mute"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- export statique (D-7.5) */}
              <img src={iconSrc} alt="" className="w-6 h-6 object-contain" draggable={false} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        .volume-slider {
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
          cursor: pointer;
        }
        .volume-slider:focus-visible {
          outline: 2px solid white;
          outline-offset: 2px;
          border-radius: 9999px;
        }
        .volume-slider::-webkit-slider-runnable-track {
          background: transparent;
          height: 4px;
          border: none;
        }
        .volume-slider::-moz-range-track {
          background: transparent;
          height: 4px;
          border: none;
        }
        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          margin-top: -8px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          transition: transform 0.15s;
        }
        .volume-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          transition: transform 0.15s;
        }
        .volume-slider::-webkit-slider-thumb:hover {
          background: #e0e0e0;
          transform: scale(1.1);
        }
        .volume-slider::-moz-range-thumb:hover {
          background: #e0e0e0;
          transform: scale(1.1);
        }
      `}</style>
    </div>
  );
}
