"use client";

import { useState, useCallback } from "react";
import * as THREE from "three";
import type { POIWithElements } from "@/types/diorama";

type UsePOIScenePlayerProps = {
  poi?: POIWithElements | null;
  animations: THREE.AnimationClip[];
  mixerRef: Record<string, THREE.AnimationMixer>;
  ambientAudioRefs: Record<string, HTMLAudioElement>;
  fadeDuration?: number; // en secondes pour couper le son d'ambiance
};

export const usePOIScenePlayer = ({
  poi,
  animations,
  mixerRef,
  ambientAudioRefs,
  fadeDuration = 1,
}: UsePOIScenePlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);

  const fadeOutAudio = useCallback((audio: HTMLAudioElement) => {
    const originalVolume = audio.volume;
    let start = Date.now();
    const fade = () => {
      const elapsed = (Date.now() - start) / 1000;
      if (elapsed < fadeDuration) {
        audio.volume = originalVolume * (1 - elapsed / fadeDuration);
        requestAnimationFrame(fade);
      } else {
        audio.pause();
        audio.volume = originalVolume;
      }
    };
    fade();
  }, [fadeDuration]);

  const playScene = useCallback(() => {
    if (!poi) return;

    // Stop all previous animations
    poi.elements?.forEach(el => mixerRef[el.name]?.stopAllAction());

    // Play animations
    poi.elements?.forEach(el => {
      const mixer = mixerRef[el.name];
      if (!mixer) return;

      const clip = animations.find(
        a => a.name.toLowerCase() === el.clipName.toLowerCase()
      );
      if (!clip) return;

      const action = mixer.clipAction(clip);
      action.reset();
      action.setLoop(el.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.play();
    });

    // Handle ambient sound fade out
    const currentAmbient = ambientAudioRefs[poi.id];
    if (currentAmbient) fadeOutAudio(currentAmbient);

    setIsPlaying(true);
  }, [poi, mixerRef, animations, ambientAudioRefs, fadeOutAudio]);

  const stopScene = useCallback(() => {
    poi?.elements?.forEach(el => mixerRef[el.name]?.stopAllAction());
    setIsPlaying(false);
  }, [poi, mixerRef]);

  const replayScene = useCallback(() => {
    stopScene();
    playScene();
  }, [stopScene, playScene]);

  return { isPlaying, playScene, stopScene, replayScene };
};
