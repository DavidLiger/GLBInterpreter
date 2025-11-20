// src/components/game/GameLoader.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import type { GameConfig } from "@/types/game";
import Image from "next/image";

interface GameLoaderProps {
  config: GameConfig;
  bookId: string;
  gameId: string;
}

export default function GameLoader({ config, bookId, gameId }: GameLoaderProps) {
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const correctAudioRef = useRef<HTMLAudioElement | null>(null);
  const wrongAudioRef = useRef<HTMLAudioElement | null>(null);

  // Précharger les assets
  useEffect(() => {
    const loadAssets = async () => {
      try {
        setLoadingProgress(10);
        
        // 1. Précharger l'image
        if (config.backgroundImage) {
          await new Promise((resolve, reject) => {
            const img = new window.Image();
            img.onload = resolve;
            img.onerror = reject;
            img.src = config.backgroundImage!;
          });
          setLoadingProgress(40);
        }

        // 2. Précharger les sons
        if (config.correctSound) {
          correctAudioRef.current = new Audio(config.correctSound);
          await correctAudioRef.current.load();
          setLoadingProgress(70);
        }

        if (config.wrongSound) {
          wrongAudioRef.current = new Audio(config.wrongSound);
          await wrongAudioRef.current.load();
          setLoadingProgress(100);
        }

        setAssetsLoaded(true);
      } catch (err) {
        console.error("Erreur chargement assets:", err);
        setError("Erreur lors du chargement des assets");
      }
    };

    loadAssets();
  }, [config]);

  const playCorrectSound = () => {
    if (correctAudioRef.current) {
      correctAudioRef.current.currentTime = 0;
      correctAudioRef.current.play();
    }
  };

  const playWrongSound = () => {
    if (wrongAudioRef.current) {
      wrongAudioRef.current.currentTime = 0;
      wrongAudioRef.current.play();
    }
  };

  // Loading screen
  if (!assetsLoaded && !error) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">🎮</div>
          <h2 className="text-white text-2xl mb-4">Chargement du jeu...</h2>
          <div className="w-64 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <p className="text-gray-400 text-sm mt-2">{loadingProgress}%</p>
        </div>
      </div>
    );
  }

  // Error screen
  if (error) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="bg-red-900/30 border border-red-500 rounded-2xl p-8 max-w-md mx-4">
          <div className="text-6xl mb-4 text-center">❌</div>
          <h2 className="text-white text-xl font-bold mb-2 text-center">Erreur</h2>
          <p className="text-red-200 text-center">{error}</p>
        </div>
      </div>
    );
  }

  // Game screen
  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Background Image */}
      {config.backgroundImage && (
        <div className="absolute inset-0 z-0">
          <Image
            src={config.backgroundImage}
            alt="Background"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-black/40" /> {/* Overlay sombre */}
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 h-full flex items-center justify-center p-4">
        <div className="bg-black/60 backdrop-blur-xl rounded-3xl p-8 max-w-2xl w-full border border-white/20 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🎮</div>
            <h1 className="text-4xl font-bold text-white mb-2">{config.title}</h1>
            <p className="text-gray-300">{config.description}</p>
          </div>

          {/* Info */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-white/10 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-1">Livre</p>
              <p className="text-white font-bold">{bookId}</p>
            </div>
            <div className="bg-white/10 rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-1">Jeu</p>
              <p className="text-white font-bold">{gameId}</p>
            </div>
          </div>

          {/* Test des sons */}
          <div className="bg-gradient-to-br from-blue-900/50 to-purple-900/50 rounded-2xl p-6 border border-blue-500/30">
            <h3 className="text-white text-xl font-bold mb-4 text-center">
              🔊 Test des sons
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={playCorrectSound}
                className="px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold rounded-xl transition-all transform hover:scale-105 shadow-lg"
              >
                <div className="text-3xl mb-2">✅</div>
                <div>Bonne réponse</div>
              </button>
              
              <button
                onClick={playWrongSound}
                className="px-6 py-4 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-bold rounded-xl transition-all transform hover:scale-105 shadow-lg"
              >
                <div className="text-3xl mb-2">❌</div>
                <div>Mauvaise réponse</div>
              </button>
            </div>
          </div>

          {/* Assets Status */}
          <div className="mt-6 p-4 bg-green-900/30 border border-green-500/50 rounded-lg">
            <p className="text-green-300 text-sm text-center">
              ✅ Assets chargés avec succès depuis R2
            </p>
            <div className="mt-2 text-xs text-green-200/70 space-y-1">
              {config.backgroundImage && (
                <p>• Image de fond : {config.backgroundImage.split('/').pop()}</p>
              )}
              {config.correctSound && (
                <p>• Son correct : {config.correctSound.split('/').pop()}</p>
              )}
              {config.wrongSound && (
                <p>• Son erreur : {config.wrongSound.split('/').pop()}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}