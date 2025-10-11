"use client";

import { useState, useRef } from "react";

type TapToStartProps = {
  onStart: () => void;               // Ce qu’on fait après le clic (lancer scène)
  playSceneSound?: () => void;       // Optionnel : joue ton son de scène
};

export default function TapToStart({ onStart, playSceneSound }: TapToStartProps) {
  const [visible, setVisible] = useState(true);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const handleStart = async () => {
    // 🟢 Débloquer le son
    if (!audioCtxRef.current) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      await ctx.resume();
      audioCtxRef.current = ctx;
      console.log("🔊 Audio context unlocked");
    } else {
      await audioCtxRef.current.resume();
    }

    // 🎵 Jouer le son de scène si dispo
    // if (playSceneSound) {
    //   playSceneSound();
    // }

    // 🚀 Lancer le diorama / la scène
    onStart();

    // 👋 Masquer le bouton
    setVisible(false);
  };

  if (!visible) return null;

return (
  <div className="fixed inset-0 flex items-center justify-center bg-black/80 z-[99999] transition-opacity duration-700 opacity-100">
    <button
      onClick={handleStart}
      className="text-white text-2xl font-semibold px-10 py-5 rounded-full border-2 border-white hover:bg-white hover:text-black transition-all duration-300 shadow-xl"
    >
      🎬 Appuyer pour commencer
    </button>
  </div>
);

}
