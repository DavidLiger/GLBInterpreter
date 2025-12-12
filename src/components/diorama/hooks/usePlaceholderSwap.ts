import { useRef, useCallback } from 'react';
import * as THREE from 'three';

interface PlaceholderSwapConfig {
  emptyRefs: React.RefObject<Record<string, THREE.Object3D>>;
  transitionFrames?: number; // Défaut: 5 frames
}

interface SwapState {
  placeholder: THREE.Object3D;
  animated: THREE.Object3D;
  isAnimating: boolean;
  swapTimeoutId?: NodeJS.Timeout;
  reverseTimeoutId?: NodeJS.Timeout;
}

export function usePlaceholderSwap({ 
  emptyRefs, 
  transitionFrames = 5 
}: PlaceholderSwapConfig) {
  const activeSwapsRef = useRef<Map<string, SwapState>>(new Map());

  // ✅ Initialiser un placeholder (caché par défaut, placeholder visible)
  const initPlaceholder = useCallback((
    animatedMeshName: string, 
    placeholderMeshName: string
  ) => {
    if (!emptyRefs.current) return;

    const animated = emptyRefs.current[animatedMeshName];
    const placeholder = emptyRefs.current[placeholderMeshName];

    if (!animated || !placeholder) {
      console.warn(
        `⚠️ Placeholder setup failed: animated="${animatedMeshName}" placeholder="${placeholderMeshName}"`,
        `animated=${!!animated}, placeholder=${!!placeholder}`
      );
      return;
    }

    // État initial : placeholder visible, animé caché
    animated.visible = false;
    placeholder.visible = true;

    activeSwapsRef.current.set(animatedMeshName, {
      placeholder,
      animated,
      isAnimating: false,
    });

    console.log(`✅ Placeholder initialisé: ${animatedMeshName} -> ${placeholderMeshName}`);
  }, [emptyRefs]);

  // ✅ Démarrer l'animation (swap après X frames)
  const startAnimation = useCallback((
    animatedMeshName: string,
    customTransitionFrames?: number
  ) => {
    const swap = activeSwapsRef.current.get(animatedMeshName);
    if (!swap) {
      console.warn(`⚠️ Pas de placeholder configuré pour: ${animatedMeshName}`);
      return;
    }

    // Nettoyer les timeouts existants
    if (swap.swapTimeoutId) clearTimeout(swap.swapTimeoutId);
    if (swap.reverseTimeoutId) clearTimeout(swap.reverseTimeoutId);

    swap.isAnimating = true;

    // ✅ Calculer le délai en millisecondes (60 FPS)
    const frames = customTransitionFrames ?? transitionFrames;
    const delayMs = (frames / 60) * 1000;

    console.log(`🎬 Animation start: swap dans ${frames} frames (${delayMs}ms)`);

    const timeoutId = setTimeout(() => {
      if (swap.isAnimating) {
        swap.animated.visible = true;
        swap.placeholder.visible = false;
        console.log(`🔄 Swap: placeholder OFF, animated ON (${animatedMeshName})`);
      }
    }, delayMs);

    swap.swapTimeoutId = timeoutId;
  }, [transitionFrames]);

  // ✅ Préparer le swap inverse (appelé avant la fin de l'animation)
  const prepareStopAnimation = useCallback((
    animatedMeshName: string,
    animationDuration: number,
    customTransitionFrames?: number
  ) => {
    const swap = activeSwapsRef.current.get(animatedMeshName);
    if (!swap) return;

    // Nettoyer timeout existant
    if (swap.reverseTimeoutId) clearTimeout(swap.reverseTimeoutId);

    // ✅ Calculer quand faire le swap inverse (X frames avant la fin)
    const frames = customTransitionFrames ?? transitionFrames;
    const delayMs = ((frames / 60) * 1000);
    const swapTimeMs = Math.max(0, (animationDuration * 1000) - delayMs);

    console.log(
      `🛑 Animation stopping: swap inverse dans ${swapTimeMs}ms ` +
      `(${frames} frames avant la fin de ${animationDuration}s)`
    );

    const timeoutId = setTimeout(() => {
      swap.animated.visible = false;
      swap.placeholder.visible = true;
      swap.isAnimating = false;
      console.log(`🔄 Swap inverse: animated OFF, placeholder ON (${animatedMeshName})`);
    }, swapTimeMs);

    swap.reverseTimeoutId = timeoutId;
  }, [transitionFrames]);

  // ✅ Reset immédiat (pour changement de POI)
  const resetPlaceholder = useCallback((animatedMeshName: string) => {
    const swap = activeSwapsRef.current.get(animatedMeshName);
    if (!swap) return;

    // Nettoyer les timeouts
    if (swap.swapTimeoutId) clearTimeout(swap.swapTimeoutId);
    if (swap.reverseTimeoutId) clearTimeout(swap.reverseTimeoutId);

    // Reset visibilité
    swap.animated.visible = false;
    swap.placeholder.visible = true;
    swap.isAnimating = false;
    
    console.log(`🔄 Reset placeholder: ${animatedMeshName}`);
  }, []);

  // ✅ Reset tous les placeholders
  const resetAll = useCallback(() => {
    console.log(`🔄 Reset ALL placeholders (${activeSwapsRef.current.size})`);
    activeSwapsRef.current.forEach((swap, name) => {
      if (swap.swapTimeoutId) clearTimeout(swap.swapTimeoutId);
      if (swap.reverseTimeoutId) clearTimeout(swap.reverseTimeoutId);
      swap.animated.visible = false;
      swap.placeholder.visible = true;
      swap.isAnimating = false;
    });
  }, []);

  // ✅ Cleanup complet
  const cleanup = useCallback(() => {
    console.log('🧹 Cleanup placeholders:', activeSwapsRef.current.size);
    activeSwapsRef.current.forEach((swap) => {
      if (swap.swapTimeoutId) clearTimeout(swap.swapTimeoutId);
      if (swap.reverseTimeoutId) clearTimeout(swap.reverseTimeoutId);
    });
    activeSwapsRef.current.clear();
  }, []);

  return {
    initPlaceholder,
    startAnimation,
    prepareStopAnimation,
    resetPlaceholder,
    resetAll,
    cleanup,
  };
}