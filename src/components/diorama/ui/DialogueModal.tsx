"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";

type DialogueCharacter = {
  id: string;
  name?: string;
  image: string;
};

type DialogueLine = {
  time: number;
  text: string;
  characterId: string;
};

type DialogueModalProps = {
  dialogue?: {
    characters: DialogueCharacter[];
    lines: DialogueLine[];
  };
  progress: number; // temps courant (en secondes)
  isPlaying: boolean;
};

export default function DialogueModal({ dialogue, progress, isPlaying }: DialogueModalProps) {
  const [currentLine, setCurrentLine] = useState<DialogueLine | null>(null);
  const [currentCharacter, setCurrentCharacter] = useState<DialogueCharacter | null>(null);

  // 🔹 Met à jour la ligne active selon le temps
  useEffect(() => {
    if (!dialogue?.lines) return;
    const active = dialogue.lines
      .filter(line => progress >= line.time)
      .sort((a, b) => b.time - a.time)[0];

    setCurrentLine(active || null);

    if (active) {
      const speaker = dialogue.characters.find(c => c.id === active.characterId);
      setCurrentCharacter(speaker || null);
    } else {
      setCurrentCharacter(null);
    }
  }, [progress, dialogue]);

  return (
    <AnimatePresence>
      {currentLine && isPlaying && (
        <motion.div
          key={currentLine.time} // important pour animation de chaque ligne
          className="absolute bottom-14 left-1/2 -translate-x-1/2 z-40 bg-black/50 text-white px-4 py-1 rounded-2xl max-w-[90%] w-[500px] flex gap-3 items-center shadow-lg backdrop-blur-md"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ duration: 0.3 }}
        >
          {currentCharacter && (
            <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden border border-white/40">
              <Image
                src={currentCharacter.image}
                alt={currentCharacter.name || "speaker"}
                width={48}
                height={48}
                className="object-cover"
              />
            </div>
          )}
          <div className="flex flex-row justify-center">
            {currentCharacter?.name && (
              <p className="text-sm font-semibold text-gray-300">
                {currentCharacter.name} :
              </p>
            )}
            <p className="text-sm ml-2 leading-snug">{currentLine.text}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
