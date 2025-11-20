// src/content/webgames/1/quiz.ts
import type { GameConfig } from "@/types/game"; 

// ✅ Même pattern que les dioramas
const BASE_URL = process.env.NEXT_PUBLIC_ASSET_BASE_URL || "";

export const quiz: GameConfig = {
  title: "Quiz Final",
  description: "Testez vos connaissances",
  type: "quiz",
  backgroundImage: `${BASE_URL}/webgames/images/quiz-bg.jpg`,      // ✅ Assets dans webgames/
  correctSound: `${BASE_URL}/webgames/sounds/correct.mp3`,
  wrongSound: `${BASE_URL}/webgames/sounds/wrong.mp3`,
};