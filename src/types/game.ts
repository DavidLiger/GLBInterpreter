// src/types/game.ts
export interface GameConfig {
  title: string;
  description: string;
  type: 'quiz' | 'memory' | 'puzzle' | 'custom';
  backgroundImage?: string;     // ✅ Image de fond du jeu
  correctSound?: string;         // ✅ Son pour bonne réponse
  wrongSound?: string;           // ✅ Son pour mauvaise réponse
  music?: string;                // ✅ Musique d'ambiance (optionnel)
  // Ajoutez d'autres propriétés selon vos besoins futurs
}

export type GameConfigEntry = {
  token: string;
  config: GameConfig;
  redirectUrl?: string;
};