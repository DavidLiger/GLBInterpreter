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
  const allAudiosRef = useRef<HTMLAudioElement[]>([]); 
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
        allAudiosRef.current.push(audio);
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
      console.log("🎵 Scene audio créé:", sceneSound, audio);
      audio.play().catch(() => {});
      sceneAudioRef.current = audio;
      allAudiosRef.current.push(audio);

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

  // Dans usePOIAudio.ts, modifiez cleanup :

  const cleanup = () => {
    console.log("🔇 Cleanup audio complet - Total audios:", allAudiosRef.current.length);
    
    // 1. ✅ STOP LE SCENE AUDIO EN PRIORITÉ (pas dans la liste)
    if (sceneAudioRef.current) {
      console.log("🔇 Stop sceneAudioRef:", sceneAudioRef.current.src);
      sceneAudioRef.current.pause();
      sceneAudioRef.current.currentTime = 0;
      sceneAudioRef.current.src = '';
      sceneAudioRef.current.load();
      sceneAudioRef.current = null;
    }
    
    // 2. Stop TOUS les audios trackés
    allAudiosRef.current.forEach((audio, index) => {
      console.log(`🔇 Stop audio ${index}:`, audio.src);
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
      audio.load();
    });
    
    // 3. Vider les refs
    ambientAudioRefs.current = {};
    allAudiosRef.current = [];
    setScenePlaying(false);
    
    console.log("✅ Audio cleanup terminé");
  };

  return {
    startSoundReady,
    muted,
    toggleMute,
    scenePlaying,
    ambientAudioRefs,
    handleSceneStart,
    handleSceneEnd,
    cleanup,
  };
}
