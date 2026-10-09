// src/components/diorama/audio/VolumeControl.tsx

"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface VolumeControlProps {
  volume: number; // 0-1
  muted: boolean;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
}

export default function VolumeControl({
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
}: VolumeControlProps) {
  const [showPanel, setShowPanel] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null); 

  // ✅ Fermer au clic extérieur
  useEffect(() => {
    if (!showPanel) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowPanel(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPanel]);

  // ✅ NOUVEAU : Contrôle par molette de souris
  useEffect(() => {
    if (!showPanel || !panelRef.current) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      // deltaY négatif = scroll vers le haut = augmenter volume
      // deltaY positif = scroll vers le bas = diminuer volume
      const delta = -e.deltaY;
      const volumeChange = delta > 0 ? 0.05 : -0.05; // ±5% par cran
      
      const newVolume = Math.max(0, Math.min(1, volume + volumeChange));
      onVolumeChange(newVolume);
    };

    const panel = panelRef.current;
    panel.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      panel.removeEventListener('wheel', handleWheel);
    };
  }, [showPanel, volume, onVolumeChange]);

  // ✅ Icône selon état
  const displayMuted = muted || volume === 0;
  const iconSrc = displayMuted 
    ? "icons/dioramas/UI/muted.png" 
    : "icons/dioramas/UI/sound.png";

  return (
    <div ref={containerRef} className="relative">
      {/* ✅ Bouton principal */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="rounded-full w-8 h-8 flex items-center justify-center shadow-lg transition-transform hover:scale-110"
        title="Contrôle du volume"
      >
        <img
          src={iconSrc}
          alt={displayMuted ? "Muet" : "Son"}
          className="w-8 h-8 object-contain"
        />
      </button>

      {/* ✅ Panneau vertical */}
      <AnimatePresence>
        {showPanel && (
          <motion.div
            ref={panelRef} 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md rounded-2xl p-3 shadow-2xl border border-white/10"
            style={{ width: "60px" }}
          >
            {/* ✅ Slider vertical AVEC ligne de progression */}
            <div className="relative flex flex-col items-center mb-3" style={{ height: "128px" }}>
                {/* ✅ Track de progression (ligne remplie du bas vers le haut) */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-24 bg-white/20 rounded-full overflow-hidden">
                    <motion.div
                    className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-blue-500 to-purple-600"
                    style={{ height: `${volume * 100}%` }}
                    transition={{ duration: 0.15 }}
                    />
                </div>

                {/* ✅ Slider par-dessus (aligné parfaitement) */}
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume * 100}
                    onChange={(e) => {
                    const newVolume = parseInt(e.target.value) / 100;
                    onVolumeChange(newVolume);
                    }}
                    className="volume-slider absolute z-10"
                    style={{
                    top: "48px", // Centré verticalement (96/2)
                    left: "50%",
                    width: "96px", // Hauteur de la track
                    height: "20px",
                    transform: "translate(-50%, -50%) rotate(-90deg)",
                    }}
                />
                
                {/* ✅ Indicateur pourcentage EN BAS */}
                <span className="absolute bottom-0 text-white text-xs">
                    {Math.round(volume * 100)}%
                </span>
            </div>

            {/* ✅ Bouton mute en bas */}
            <button
              onClick={onToggleMute}
              className="w-full rounded-lg p-2 hover:bg-white/10 transition flex items-center justify-center"
              title={displayMuted ? "Activer le son" : "Couper le son"}
            >
              <img
                src={iconSrc}
                alt={displayMuted ? "Muet" : "Son"}
                className="w-6 h-6 object-contain"
              />
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

    /* ✅ Track invisible (on utilise notre div) */
    .volume-slider::-webkit-slider-track {
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
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: white;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        transition: transform 0.15s;
    }

    .volume-slider::-moz-range-thumb {
        width: 16px;
        height: 16px;
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