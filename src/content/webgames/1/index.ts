// src/content/webgames/1/index.ts
import { quiz } from "./quiz";
import type { GameConfigEntry } from "@/types/game"; 

const webgames: Record<string, GameConfigEntry> = {
  quiz: { token: "quiz1234", config: quiz },
};

export default webgames;