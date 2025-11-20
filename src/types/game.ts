// src/types/game.ts
export interface GameConfig {
  title: string;
  description: string;
  type: 'quiz' | 'memory' | 'puzzle' | 'custom';
  // Ajoutez d'autres propriétés selon vos besoins
}

export type GameConfigEntry = {
  token: string;
  config: GameConfig;
};