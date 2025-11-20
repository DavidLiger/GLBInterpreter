// src/components/game/GameLoader.tsx
"use client";

import type { GameConfig } from "@/types/game";

interface GameLoaderProps {
  config: GameConfig;
  bookId: string;
  gameId: string;
}

export default function GameLoader({ config, bookId, gameId }: GameLoaderProps) {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center">
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-2xl mx-4 border border-white/20 shadow-2xl">
        <h1 className="text-4xl font-bold text-white mb-4">🎮 Page du jeu</h1>
        <div className="space-y-2 text-white/80">
          <p><strong>Livre:</strong> {bookId}</p>
          <p><strong>Jeu:</strong> {gameId}</p>
          <p><strong>Titre:</strong> {config.title}</p>
          <p><strong>Description:</strong> {config.description}</p>
          <p><strong>Type:</strong> {config.type}</p>
        </div>
        
        <div className="mt-8 p-4 bg-green-500/20 border border-green-500/50 rounded-lg">
          <p className="text-green-300 text-sm">
            ✅ La redirection fonctionne ! Vous pouvez maintenant développer votre jeu ici.
          </p>
        </div>
      </div>
    </div>
  );
}