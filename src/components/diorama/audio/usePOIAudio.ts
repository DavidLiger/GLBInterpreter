// src/components/diorama/hooks/usePOIAudio.ts
"use client";

import { useEffect, useRef, useState } from "react";
import type { POI } from "@/types/diorama";

export default function usePOIAudio(pois: POI[], currentPOI: string | null, muted: boolean) {
  const ambientAudioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const [startSoundReady, setStartSoundReady] = useState(false);

  // préchargement récursif (ne recrée pas si déjà existant)
  const preloadPOISounds = (list: POI[]) => {
    list.forEach((poi) => {
      if (poi.ambientSound && !ambientAudioRefs.current[poi.id]) {
        const audio = new Audio(poi.ambientSound);
        audio.loop = true;
        audio.muted = true; // start muted until user toggles
        audio.preload = "auto";
        ambientAudioRefs.current[poi.id] = audio;
        audio.load();
      }
      if (poi.children && poi.children.length) preloadPOISounds(poi.children);
    });
  };

  // Charger d'abord le son "start" puis les autres
  useEffect(() => {
    if (!pois || pois.length === 0) {
      setStartSoundReady(true);
      return;
    }

    const startPOI = pois.find((p) => p.id === "start");

    if (startPOI?.ambientSound) {
      const startAudio = new Audio(startPOI.ambientSound);
      startAudio.loop = true;
      startAudio.muted = true;
      startAudio.preload = "auto";

      const onCanPlay = () => {
        ambientAudioRefs.current[startPOI.id] = startAudio;
        setStartSoundReady(true);
        // charger les autres (sauf start)
        preloadPOISounds(pois.filter((p) => p.id !== "start"));
      };

      startAudio.addEventListener("canplaythrough", onCanPlay, { once: true });
      startAudio.load();

      return () => {
        startAudio.removeEventListener("canplaythrough", onCanPlay);
      };
    } else {
      // pas de start -> charger tout
      preloadPOISounds(pois);
      setStartSoundReady(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(pois)]); // stringify pour éviter trigger infini si la référence change

  // Quand currentPOI change -> pause tous, play POI courant
  useEffect(() => {
    if (!currentPOI) return;

    Object.values(ambientAudioRefs.current).forEach((a) => {
      try { a.pause(); } catch {}
    });

    const current = ambientAudioRefs.current[currentPOI];
    if (current) {
      current.muted = muted;
      current.play().catch(() => {});
    }
  }, [currentPOI, muted]);

  // Si on mute/unmute global -> appliquer sur tous les audios chargés
  useEffect(() => {
    Object.values(ambientAudioRefs.current).forEach((a) => {
      try { a.muted = muted; } catch {}
    });
  }, [muted]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(ambientAudioRefs.current).forEach((a) => {
        try { a.pause(); a.src = ""; } catch {}
      });
      ambientAudioRefs.current = {};
    };
  }, []);

  return { startSoundReady, ambientAudioRefs };
}
