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

  // ────────────── Préchargement récursif des ambiances ──────────────
  const preloadAmbientSounds = (pois: POI[]) => {
    pois.forEach(poi => {
      if (poi.ambientSound && !ambientAudioRefs.current[poi.id]) {
        const audio = new Audio(poi.ambientSound);
        audio.loop = true;
        audio.muted = true;
        audio.preload = "auto";
        ambientAudioRefs.current[poi.id] = audio;
      }
      if (poi.children?.length) preloadAmbientSounds(poi.children);
    });
  };

  useEffect(() => {
    preloadAmbientSounds(pois);
    setStartSoundReady(true);
  }, [pois]);

  // ────────────── Lecture de l’ambient du POI courant ──────────────
  useEffect(() => {
    if (!currentPOI) return;

    // stop tout le reste
    Object.entries(ambientAudioRefs.current).forEach(([id, audio]) => {
      if (id !== currentPOI) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    // joue l’ambiance du POI courant
    const ambient = ambientAudioRefs.current[currentPOI];
    if (ambient && !scenePlaying) {
      ambient.muted = muted;
      ambient.play().catch(() => {});
    }
  }, [currentPOI, muted, scenePlaying]);

  // ────────────── Toggle mute global ──────────────
  const toggleMute = () => {
    setMuted(prev => {
      const next = !prev;
      Object.values(ambientAudioRefs.current).forEach(a => (a.muted = next));
      if (sceneAudioRef.current) sceneAudioRef.current.muted = next;

      // si on vient de UNMUTE → relance l’ambiance actuelle
      if (!next && currentPOI) {
        const ambient = ambientAudioRefs.current[currentPOI];
        if (ambient) {
          ambient.muted = false;
          ambient.play().catch(() => {});
        }
      }

      return next;
    });
  };

  // ────────────── Lancer une scène (sceneSound) ──────────────
  const handleSceneStart = (poiId: string, sceneSound?: string) => {
    setScenePlaying(true);
    onScenePlayingChange?.(true);

    // stop toutes les ambiances
    Object.values(ambientAudioRefs.current).forEach(audio => audio.pause());

    if (sceneSound) {
      const audio = new Audio(sceneSound);
      audio.loop = false;
      audio.muted = muted;
      audio.play().catch(() => {});
      sceneAudioRef.current = audio;

      audio.onended = () => {
        setScenePlaying(false);
        onScenePlayingChange?.(false);

        // relance l’ambiance du POI
        const ambient = ambientAudioRefs.current[poiId];
        if (ambient) {
          ambient.muted = muted;
          ambient.play().catch(() => {});
        }
      };
    }
  };

  // ────────────── Fin d’une scène ──────────────
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
