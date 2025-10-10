import { useEffect, useRef, useState } from "react";
import type { POI } from "@/types/diorama";

type UsePOIAudioProps = {
  pois: POI[];
  currentPOI: string | null;
  onScenePlayingChange?: (playing: boolean) => void;
};

export default function usePOIAudio({ pois, currentPOI, onScenePlayingChange }: UsePOIAudioProps) {
  const ambientAudioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const sceneAudioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [startSoundReady, setStartSoundReady] = useState(false);
  const [scenePlaying, setScenePlaying] = useState(false);

  // Préchargement des sons d’ambiance
  useEffect(() => {
    pois.forEach(poi => {
      if (poi.ambientSound && !ambientAudioRefs.current[poi.id]) {
        const audio = new Audio(poi.ambientSound);
        audio.loop = true;
        audio.muted = true;
        audio.preload = "auto";
        ambientAudioRefs.current[poi.id] = audio;
      }
      if (poi.children?.length) {
        poi.children.forEach(child => {
          if (child.ambientSound && !ambientAudioRefs.current[child.id]) {
            const audio = new Audio(child.ambientSound);
            audio.loop = true;
            audio.muted = true;
            audio.preload = "auto";
            ambientAudioRefs.current[child.id] = audio;
          }
        });
      }
    });
    setStartSoundReady(true);
  }, [pois]);

  // Jouer uniquement l’ambiance du POI courant si pas de scène
  useEffect(() => {
    if (!currentPOI) return;

    Object.entries(ambientAudioRefs.current).forEach(([id, audio]) => {
      if (id !== currentPOI) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    const ambient = ambientAudioRefs.current[currentPOI];
    if (ambient && !scenePlaying) {
      ambient.muted = muted;
      ambient.play().catch(() => {});
    }
  }, [currentPOI, muted, scenePlaying]);

  // Toggle mute uniquement sur l’ambiance
  const toggleMute = () => {
    setMuted(prev => {
      const next = !prev;
      Object.values(ambientAudioRefs.current).forEach(a => a.muted = next);
      return next;
    });
  };

  // Lancer une scène
  const handleSceneStart = (poiId: string, sceneSound?: string) => {
    setScenePlaying(true);
    onScenePlayingChange?.(true);

    // Couper toutes les ambiances
    Object.entries(ambientAudioRefs.current).forEach(([id, audio]) => {
      audio.pause();
      if (id === poiId) audio.muted = true;
    });

    // Lancer le son de scène
    if (sceneSound) {
      const audio = new Audio(sceneSound);
      audio.loop = false;
      audio.muted = muted;
      audio.play().catch(() => {});
      sceneAudioRef.current = audio;

      audio.onended = () => {
        setScenePlaying(false);
        onScenePlayingChange?.(false);

        // relancer ambiance
        const amb = ambientAudioRefs.current[poiId];
        if (amb) {
          amb.muted = muted;
          amb.play().catch(() => {});
        }
      };
    }
  };

  const handleSceneEnd = (poiId: string) => {
    if (sceneAudioRef.current) {
      sceneAudioRef.current.pause();
      sceneAudioRef.current = null;
    }
    setScenePlaying(false);
    onScenePlayingChange?.(false);

    const ambient = ambientAudioRefs.current[poiId];
    if (ambient) {
      ambient.muted = muted;
      ambient.play().catch(() => {});
    }
  };

  return {
    startSoundReady,
    muted,
    toggleMute,
    scenePlaying,
    ambientAudioRefs,
    handleSceneStart,
    handleSceneEnd,
  };
}
