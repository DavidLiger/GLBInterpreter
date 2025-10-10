import { useState, useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import type { POIWithElements } from "@/types/diorama";

type UsePOIScenePlayerProps = {
  poi?: POIWithElements | null;
  animations: THREE.AnimationClip[];
  mixerRef: Record<string, THREE.AnimationMixer>;
  ambientAudioRefs: Record<string, HTMLAudioElement>;
  fadeDuration?: number; // pour les fades si besoin
  muted?: boolean;       // <- nouvel argument
};

export const usePOIScenePlayer = ({
  poi,
  animations,
  mixerRef,
  ambientAudioRefs,
  fadeDuration = 0.15,
  muted = false,
}: UsePOIScenePlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(1);
  const [activeActions, setActiveActions] = useState<THREE.AnimationAction[]>([]);
  const [isEnded, setIsEnded] = useState(false);

  const sceneAudioRef = useRef<HTMLAudioElement | null>(null);

  // 🔄 Reset scène
  const resetSceneStable = useCallback(() => {
    setActiveActions((prev) => {
      prev.forEach((a) => {
        a.stop();
        a.paused = false;
      });
      return [];
    });

    setIsPlaying(false);
    setIsPaused(false);
    setProgress(0);
    setDuration(1);
    setIsEnded(false);

    if (sceneAudioRef.current) {
      sceneAudioRef.current.pause();
      sceneAudioRef.current.currentTime = 0;
    }
  }, []);

  // ▶️ Lecture principale
  const playScene = useCallback(() => {
    if (!poi) return;

    resetSceneStable();

    const actions: THREE.AnimationAction[] = [];

    poi.elements?.forEach((el) => {
      const mixer = mixerRef[el.name];
      if (!mixer) return;
      const clip = animations.find((a) => a.name.toLowerCase() === el.clipName.toLowerCase());
      if (!clip) return;

      const action = mixer.clipAction(clip);
      action.reset();
      action.setLoop(el.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = true;
      action.play();
      actions.push(action);
    });

    const maxDuration = actions.length > 0 ? Math.max(...actions.map((a) => a.getClip().duration)) : 1;
    setDuration(maxDuration);
    setActiveActions(actions);
    setIsPlaying(true);
    setIsPaused(false);
    setProgress(0);
    setIsEnded(false);

    // ⚡ Jouer le son de scène
    if (poi.sceneSound) {
      if (!sceneAudioRef.current) {
        sceneAudioRef.current = new Audio(poi.sceneSound);
        sceneAudioRef.current.loop = false;
      } else {
        sceneAudioRef.current.pause();
        sceneAudioRef.current.currentTime = 0;
        sceneAudioRef.current.src = poi.sceneSound;
      }

      sceneAudioRef.current.muted = muted;
      sceneAudioRef.current.play().catch(() => {});
    }

  }, [poi, mixerRef, animations, muted, resetSceneStable]);

  // ⏯ Toggle play / pause / replay
  const togglePlayPause = useCallback(() => {
    if (!isPlaying && isEnded) {
      playScene(); // replay
    } else if (!isPlaying) {
      playScene(); // première lecture
    } else if (isPaused) {
      activeActions.forEach((a) => (a.paused = false));
      if (sceneAudioRef.current && sceneAudioRef.current.paused) sceneAudioRef.current.play().catch(() => {});
      setIsPaused(false);
    } else {
      activeActions.forEach((a) => (a.paused = true));
      if (sceneAudioRef.current && !sceneAudioRef.current.paused) sceneAudioRef.current.pause();
      setIsPaused(true);
    }
  }, [isPlaying, isPaused, isEnded, activeActions, playScene]);

  // ⏩ Seek manuel
  const seekScene = useCallback((time: number) => {
    activeActions.forEach((a) => {
      const clipDuration = a.getClip().duration;
      if (time >= clipDuration && a.loop === THREE.LoopOnce) {
        a.reset();
        a.paused = true;
      } else {
        a.time = Math.min(time, clipDuration);
        a.paused = false;
        a.play();
      }
    });

    if (sceneAudioRef.current) {
      sceneAudioRef.current.currentTime = Math.min(time, sceneAudioRef.current.duration);
      sceneAudioRef.current.play().catch(() => {});
    }

    setProgress(time);
    setIsPlaying(true);
    setIsPaused(false);
    setIsEnded(time >= duration);
  }, [activeActions, duration]);

  // 🕒 Boucle de progression
  useEffect(() => {
    let frameId: number;
    const update = () => {
      if (isPlaying && !isPaused && activeActions.length > 0) {
        const t = Math.max(...activeActions.map((a) => a.time));
        setProgress(t);

        if (t >= duration) {
          setProgress(duration);
          setIsPlaying(false);
          setIsPaused(false);
          setIsEnded(true);
        }
      }
      frameId = requestAnimationFrame(update);
    };
    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, isPaused, duration, activeActions]);

  // 🔄 Reset automatique si POI change
  useEffect(() => {
    resetSceneStable();
  }, [poi, resetSceneStable]);

  // 🔇 Appliquer mute global
  useEffect(() => {
    if (sceneAudioRef.current) {
      sceneAudioRef.current.muted = muted;
    }
    // On mute aussi tous les ambients ici si nécessaire
    Object.values(ambientAudioRefs).forEach(a => {
      a.muted = muted;
    });
  }, [muted, ambientAudioRefs]);

  return {
    isPlaying,
    isPaused,
    isEnded,
    progress,
    duration,
    togglePlayPause,
    seekScene,
  };
};
