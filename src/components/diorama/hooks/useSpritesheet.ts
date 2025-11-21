// src/components/diorama/hooks/useSpritesheet.ts
import { useEffect, useRef } from "react";
import * as THREE from "three";

export interface SpritesheetConfig {
  /** Nombre de colonnes dans la spritesheet */
  columns: number;
  /** Nombre de lignes dans la spritesheet */
  rows: number;
  /** Nombre total de frames */
  totalFrames: number;
  /** FPS de l'animation (si mode auto) */
  fps?: number;
  /** Mode: 'loop' (boucle auto) ou 'controlled' (contrôlé par temps externe) */
  mode?: 'loop' | 'controlled';
}

export interface SpritesheetControls {
  /** Mettre à jour à une frame spécifique (0-based) */
  setFrame: (frame: number) => void;
  /** Mettre à jour selon un temps en secondes (pour sync animation) */
  setTime: (timeInSeconds: number) => void;
  /** Start/stop (mode loop uniquement) */
  play: () => void;
  pause: () => void;
  /** Frame actuelle */
  currentFrame: number;
}

export function useSpritesheet(
  texture: THREE.Texture | null,
  config: SpritesheetConfig,
  autoStart: boolean = true
): SpritesheetControls {
  const frameRef = useRef(0);
  const timeRef = useRef(0);
  const isPlayingRef = useRef(autoStart);
  const animationFrameRef = useRef<number | undefined>(undefined);

  const { columns, rows, totalFrames, fps = 30, mode = 'loop' } = config;

  const updateUV = (frame: number) => {
    if (!texture) return;

    // Limiter la frame
    const clampedFrame = Math.min(Math.max(0, Math.floor(frame)), totalFrames - 1);
    frameRef.current = clampedFrame;

    // Calculer la position dans la grille
    const col = clampedFrame % columns;
    const row = Math.floor(clampedFrame / columns);

    // Calculer les offsets UV
    const offsetX = col / columns;
    const offsetY = 1 - (row + 1) / rows; // Three.js UV inversé en Y

    // Mettre à jour la texture
    texture.offset.set(offsetX, offsetY);
    texture.repeat.set(1 / columns, 1 / rows);
    texture.needsUpdate = true;
  };

  // Mode loop automatique
  useEffect(() => {
    if (mode !== 'loop' || !texture) return;

    const animate = () => {
      if (!isPlayingRef.current) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const deltaTime = 1 / 60; // 60 FPS de la boucle
      timeRef.current += deltaTime;

      const frame = Math.floor((timeRef.current * fps) % totalFrames);
      updateUV(frame);

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [texture, mode, fps, totalFrames, columns, rows]);

  // Initialiser la texture
  useEffect(() => {
    if (texture) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      updateUV(0);
    }
  }, [texture]);

  const controls: SpritesheetControls = {
    setFrame: (frame: number) => {
      updateUV(frame);
    },
    setTime: (timeInSeconds: number) => {
      // Convertir le temps en frame
      const frame = Math.floor(timeInSeconds * fps) % totalFrames;
      updateUV(frame);
    },
    play: () => {
      isPlayingRef.current = true;
    },
    pause: () => {
      isPlayingRef.current = false;
    },
    currentFrame: frameRef.current,
  };

  return controls;
}