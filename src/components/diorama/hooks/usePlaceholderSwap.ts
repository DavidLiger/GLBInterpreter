import { useCallback, useRef } from "react";
import * as THREE from "three";

interface PlaceholderSwapProps {
  emptyRefs: React.RefObject<Record<string, THREE.Object3D>>;
  transitionFrames?: number;
}

interface PlaceholderInfo {
  animated: THREE.Object3D;
  meshRef: THREE.Object3D;
}

export const usePlaceholderSwap = ({
  emptyRefs,
  transitionFrames = 5,
}: PlaceholderSwapProps) => {
  
  // ✅ Map pour stocker les infos de chaque placeholder
  const placeholders = useRef<Map<string, PlaceholderInfo>>(new Map());
  const swapTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Initialiser un placeholder
  const initPlaceholder = useCallback((animatedName: string, placeholderName: string) => {
    const animated = emptyRefs.current?.[animatedName];
    const placeholder = emptyRefs.current?.[placeholderName];

    if (!animated || !placeholder) {
      console.warn(`⚠️ Objets non trouvés: ${animatedName} ou ${placeholderName}`);
      return;
    }

    // Stocker dans la Map
    placeholders.current.set(animatedName, {
      animated,
      meshRef: placeholder
    });

    // État initial
    animated.visible = false;
    placeholder.visible = true;
    
    console.log(`✅ Placeholder initialisé: ${animatedName} -> ${placeholderName}`);
  }, [emptyRefs]);

  // ✅ NOUVELLE FONCTION : Swap avec skip de frames
  const startAnimationWithSkip = useCallback((
    animatedMeshName: string,
    action: THREE.AnimationAction,
    mixer: THREE.AnimationMixer,
    framesToSkip: number = 5
  ) => {
    const placeholder = placeholders.current.get(animatedMeshName);
    if (!placeholder) {
      console.warn(`⚠️ Pas de placeholder configuré pour: ${animatedMeshName}`);
      return;
    }

    const { animated, meshRef } = placeholder;
    
    // ✅ Avancer l'animation AVANT de rendre visible
    const timeToSkip = framesToSkip / 60;
    action.time = timeToSkip;
    mixer.update(0); // Forcer l'application de la pose
    
    console.log(`⏩ Animation avancée de ${framesToSkip} frames (${timeToSkip.toFixed(3)}s) pour ${animatedMeshName}`);
    
    // ✅ Swapper immédiatement (l'animation est déjà dans la bonne pose)
    animated.visible = true;
    meshRef.visible = false;
    
    console.log(`✅ Swap immédiat: ${animatedMeshName} visible, placeholder caché`);
  }, []);

  // Fonction startAnimation classique (gardée pour compatibilité)
  const startAnimation = useCallback((animatedMeshName: string, customFrames?: number) => {
    const placeholder = placeholders.current.get(animatedMeshName);
    if (!placeholder) {
      console.warn(`⚠️ Pas de placeholder configuré pour: ${animatedMeshName}`);
      return;
    }

    const frames = customFrames ?? transitionFrames;
    const delayMs = (frames / 60) * 1000;
    
    const timeout = setTimeout(() => {
      placeholder.animated.visible = true;
      placeholder.meshRef.visible = false;
      swapTimeouts.current.delete(animatedMeshName);
    }, delayMs);
    
    swapTimeouts.current.set(animatedMeshName, timeout);
  }, [transitionFrames]);

  const prepareStopAnimation = useCallback((
    animatedMeshName: string,
    animationDuration: number,
    customTransitionFrames?: number
  ) => {
    const placeholder = placeholders.current.get(animatedMeshName);
    if (!placeholder) return;

    const frames = customTransitionFrames ?? transitionFrames;
    const swapBackTime = animationDuration - (frames / 60);
    const delayMs = Math.max(0, swapBackTime * 1000);

    const timeout = setTimeout(() => {
      placeholder.animated.visible = false;
      placeholder.meshRef.visible = true;
    }, delayMs);

    swapTimeouts.current.set(`${animatedMeshName}_stop`, timeout);
  }, [transitionFrames]);

  const resetPlaceholder = useCallback((animatedMeshName: string) => {
    const placeholder = placeholders.current.get(animatedMeshName);
    if (!placeholder) return;

    placeholder.animated.visible = false;
    placeholder.meshRef.visible = true;
    
    const timeout = swapTimeouts.current.get(animatedMeshName);
    if (timeout) {
      clearTimeout(timeout);
      swapTimeouts.current.delete(animatedMeshName);
    }
  }, []);

  const resetAll = useCallback(() => {
    console.log(`🔄 Reset ALL placeholders (${placeholders.current.size})`);
    
    placeholders.current.forEach((placeholder, name) => {
      placeholder.animated.visible = false;
      placeholder.meshRef.visible = true;
    });

    swapTimeouts.current.forEach(timeout => clearTimeout(timeout));
    swapTimeouts.current.clear();
  }, []);

  const cleanup = useCallback(() => {
    swapTimeouts.current.forEach(timeout => clearTimeout(timeout));
    swapTimeouts.current.clear();
    placeholders.current.clear();
  }, []);

  return {
    initPlaceholder,
    startAnimation,
    startAnimationWithSkip, // ✅ Exporté
    prepareStopAnimation,
    resetPlaceholder,
    resetAll,
    cleanup
  };
};