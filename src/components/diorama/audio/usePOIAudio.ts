import { useEffect, useRef, useState } from "react";
import type { POI } from "@/types/diorama";

export default function usePOIAudio(pois: POI[], currentPOI: string | null, muted: boolean) {
  const ambientAudioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const sceneAudioRef = useRef<HTMLAudioElement | null>(null);
  const scenePlayingRef = useRef(false);
  const [startSoundReady, setStartSoundReady] = useState(false);
  const [sceneProgress, setSceneProgress] = useState(0);

  // 🔹 Préchargement récursif des sons d'ambiance
  const preloadPOISounds = (list: POI[]) => {
    list.forEach(poi => {
      if (poi.ambientSound && !ambientAudioRefs.current[poi.id]) {
        const audio = new Audio(poi.ambientSound);
        audio.loop = true;
        audio.muted = true; // start muted
        audio.preload = "auto";
        ambientAudioRefs.current[poi.id] = audio;
        audio.load();
      }
      if (poi.children?.length) preloadPOISounds(poi.children);
    });
  };

  // 🔹 Précharger tous les sons au montage
  useEffect(() => {
    if (!pois.length) return;
    preloadPOISounds(pois);
    setStartSoundReady(true);
  }, [JSON.stringify(pois)]);

  // 🔹 Changement de POI → stopper toutes les autres ambiances, jouer celle du POI courant si aucun sceneSound actif
  useEffect(() => {
    if (!currentPOI) return;

    Object.entries(ambientAudioRefs.current).forEach(([id, audio]) => {
      if (id === currentPOI) return; // ne touche pas celle du POI courant pour l'instant
      audio.pause();
      audio.currentTime = 0;
    });

    const ambient = ambientAudioRefs.current[currentPOI];
    if (ambient && !scenePlayingRef.current) {
      ambient.muted = muted;
      ambient.play().catch(() => {});
    }
  }, [currentPOI, muted]);

  // 🔹 Mute global → appliquer à tous les sons
  useEffect(() => {
    Object.values(ambientAudioRefs.current).forEach(a => {
      try { a.muted = muted; } catch {}
    });
    if (sceneAudioRef.current) {
      sceneAudioRef.current.muted = muted;
    }
  }, [muted]);

  // 🔹 Play / Replay d'une scène
  const handleSceneStart = (poiId: string, sceneSound?: string) => {
    // 🔹 Couper toutes les ambiances
    Object.entries(ambientAudioRefs.current).forEach(([id, audio]) => {
      audio.pause();
      if (id === poiId) audio.muted = true;
    });

    // Stop ancien sceneSound
    if (sceneAudioRef.current) {
      sceneAudioRef.current.pause();
      sceneAudioRef.current = null;
      scenePlayingRef.current = false;
    }

    if (sceneSound) {
      const audio = new Audio(sceneSound);
      audio.loop = false;
      audio.muted = muted;
      audio.play().catch(() => {});
      sceneAudioRef.current = audio;
      scenePlayingRef.current = true;

      const interval = setInterval(() => {
        if (!audio.paused) setSceneProgress(audio.currentTime);
      }, 50);

      audio.onended = () => {
        clearInterval(interval);
        scenePlayingRef.current = false;
        // 🔹 relancer l'ambiance propre au POI
        const amb = ambientAudioRefs.current[poiId];
        if (amb) {
          amb.muted = muted;
          amb.play().catch(() => {});
        }
      };
    }
  };

  // 🔹 Fin de scène manuelle (utile pour Replay)
  const handleSceneEnd = (poiId: string) => {
    if (sceneAudioRef.current) {
      sceneAudioRef.current.pause();
      sceneAudioRef.current = null;
      scenePlayingRef.current = false;
    }
    const ambient = ambientAudioRefs.current[poiId];
    if (ambient) {
      ambient.muted = muted;
      ambient.play().catch(() => {});
    }
  };

  // 🔹 Replay → relance la scène en respectant le mute de l'ambiance
  const handleReplay = (poiId: string, sceneSound?: string) => {
    if (sceneAudioRef.current) sceneAudioRef.current.currentTime = 0;
    setSceneProgress(0); // reset immédiat pour la barre
    handleSceneStart(poiId, sceneSound);
  };

  return {
    startSoundReady,
    ambientAudioRefs,
    handleSceneStart,
    handleSceneEnd,
    handleReplay,
  };
}
