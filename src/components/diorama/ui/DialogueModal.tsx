"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type DialogueCharacter = {
  id: string;
  name?: string;
  image: string;
};

type DialogueLine = {
  time: number;
  text: string | string[];
  characterId: string;
};

type DialogueModalProps = {
  dialogue?: {
    characters: DialogueCharacter[];
    lines: DialogueLine[];
  };
  progress: number; // secondes
  isPlaying: boolean;
};

export default function DialogueModal({ dialogue, progress, isPlaying }: DialogueModalProps) {
  const [currentLine, setCurrentLine] = useState<DialogueLine | null>(null);
  const [currentCharacter, setCurrentCharacter] = useState<DialogueCharacter | null>(null);
  const [subIndex, setSubIndex] = useState(0);

  // 🔹 Trouve la ligne actuelle selon le temps
  useEffect(() => {
    if (!dialogue?.lines?.length) return;

    const active = dialogue.lines
      .filter(line => progress >= line.time)
      .sort((a, b) => b.time - a.time)[0];

    if (!active) return;

    setCurrentLine(active);

    const speaker = dialogue.characters.find(c => c.id === active.characterId);
    setCurrentCharacter(speaker || null);
  }, [progress, dialogue]);

  // 🔹 Gère la sous-partie (si le texte est un tableau)
  const currentText = useMemo(() => {
    if (!currentLine) return null;

    if (typeof currentLine.text === "string") return currentLine.text;
    if (Array.isArray(currentLine.text)) {
      const nextLine = dialogue?.lines.find(l => l.time > currentLine.time);
      const nextTime = nextLine ? nextLine.time : currentLine.time + 5; // durée par défaut
      const totalDuration = nextTime - currentLine.time;
      const subDuration = totalDuration / currentLine.text.length;
      const idx = Math.floor((progress - currentLine.time) / subDuration);
      const boundedIdx = Math.max(0, Math.min(currentLine.text.length - 1, idx));
      return currentLine.text[boundedIdx];
    }

    return null;
  }, [progress, currentLine, dialogue]);

  if (!currentLine || !isPlaying || !currentText) return null;

return (
  <AnimatePresence>
    <motion.div
      key={`${currentLine.time}-${currentText}`}
      className="absolute bottom-14 left-1/2 -translate-x-1/2 z-40 bg-black/60 text-white rounded-4xl px-2 py-2 flex items-center gap-4 shadow-xl backdrop-blur-md w-auto max-w-[900px]"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.3 }}
    >
      {currentCharacter && (
        <div className="flex flex-col items-center justify-center flex-shrink-0  text-center">
          <div className="w-8 h-8 rounded-full overflow-hidden border border-white/40">
            <Image
              src={currentCharacter.image}
              alt={currentCharacter.name || "speaker"}
              width={40}
              height={40}
              className="object-cover"
            />
          </div>
        </div>
      )}

      <p className="flex-1 text-sm leading-snug break-words">
        {currentCharacter?.name && (
          <span className="font-semibold text-gray-200">{currentCharacter.name} :</span>
        )}{" "}
        {currentText}
      </p>
    </motion.div>
  </AnimatePresence>
);


}
