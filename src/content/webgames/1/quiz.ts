// src/content/webgames/1/quiz.ts
import type { GameConfig } from "@/types/game";

const BASE_URL = process.env.NEXT_PUBLIC_ASSET_BASE_URL || "";

export const quiz: GameConfig = {
  title: "Quiz Final - Livre 1",
  description: "Testez vos connaissances sur l'histoire",
  type: "quiz",
  backgroundImage: `${BASE_URL}/webgames/images/quiz-bg.jpg`,
  correctSound: `${BASE_URL}/webgames/sounds/correct.mp3`,
  wrongSound: `${BASE_URL}/webgames/sounds/wrong.mp3`,
};