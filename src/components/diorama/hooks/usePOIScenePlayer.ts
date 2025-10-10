import { useState, useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import type { POIWithElements } from "@/types/diorama";

type UsePOIScenePlayerProps = {
  poi?: POIWithElements | null;
  animations: THREE.AnimationClip[];
  mixerRef: Record<string, THREE.AnimationMixer>;
  ambientAudioRefs?: Record<string, HTMLAudioElement>;
  fadeDuration?: number;
  muted?: boolean;
  onSceneStart?: (poiId: string, sceneSound?: string) => void;
  onSceneEnd?: (poiId: string) => void;
};

export const usePOIScenePlayer = ({
  poi,
  animations,
  mixerRef,
  ambientAudioRefs = {},
  fadeDuration = 0.15,
  muted = false,
}: UsePOIScenePlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(1);
  const [isEnded, setIsEnded] = useState(false);

  const activeActionsRef = useRef<THREE.AnimationAction[]>([]);
  const sceneAudioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | undefined>(undefined);


  // 🔹 Reset stable de la scène
  const resetSceneStable = useCallback(() => {
    activeActionsRef.current.forEach(a => {
      a.stop();
      a.paused = false;
    });
    activeActionsRef.current = [];
    setIsPlaying(false);
    setIsPaused(false);
    setProgress(0);
    setDuration(1);
    setIsEnded(false);

    if (sceneAudioRef.current) {
      sceneAudioRef.current.pause();
      sceneAudioRef.current.currentTime = 0;
      sceneAudioRef.current = null;
    }
  }, []);

  // 🔹 Play / Replay
  const playScene = useCallback(() => {
    if (!poi) return;

    resetSceneStable();
    setProgress(0);
    setIsEnded(false);

    const actions: THREE.AnimationAction[] = [];
    poi.elements?.forEach(el => {
      const mixer = mixerRef[el.name];
      if (!mixer) return;
      const clip = animations.find(a => a.name.toLowerCase() === el.clipName.toLowerCase());
      if (!clip) return;

      const action = mixer.clipAction(clip);
      action.reset();
      action.setLoop(el.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = true;
      action.fadeIn(fadeDuration);
      action.play();
      actions.push(action);
    });

    const maxDuration = actions.length > 0 ? Math.max(...actions.map(a => a.getClip().duration)) : 1;
    setDuration(maxDuration);
    activeActionsRef.current = actions;
    setIsPlaying(true);
    setIsPaused(false);

    // 🔊 Couper toutes les ambiances
    Object.values(ambientAudioRefs).forEach(a => {
      if (a) {
        a.pause();
        a.muted = true;
      }
    });

    // 🔊 Scene sound
    if (poi.sceneSound) {
      const audio = new Audio(poi.sceneSound);
      audio.loop = false;
      audio.muted = muted;
      audio.play().catch(() => {});
      sceneAudioRef.current = audio;

      audio.onended = () => {
        const ambientAudio = poi.id ? ambientAudioRefs[poi.id] : undefined;
        if (ambientAudio) {
          ambientAudio.muted = muted;
          ambientAudio.play().catch(() => {});
        }
        setIsPlaying(false);
        setIsEnded(true);
        setProgress(maxDuration);
      };
    }
  }, [poi, mixerRef, animations, ambientAudioRefs, fadeDuration, muted, resetSceneStable]);

  // 🔹 Toggle play/pause/replay
  const togglePlayPause = useCallback(() => {
    if (!isPlaying && isEnded) {
      playScene();
    } else if (!isPlaying) {
      playScene();
    } else if (isPaused) {
      activeActionsRef.current.forEach(a => (a.paused = false));
      if (sceneAudioRef.current?.paused) sceneAudioRef.current.play().catch(() => {});
      setIsPaused(false);
    } else {
      activeActionsRef.current.forEach(a => (a.paused = true));
      if (!sceneAudioRef.current?.paused) sceneAudioRef.current?.pause();
      setIsPaused(true);
    }
  }, [isPlaying, isPaused, isEnded, playScene]);

  // 🔹 Seek
  const seekScene = useCallback((time: number) => {
    activeActionsRef.current.forEach(a => {
      const clipDuration = a.getClip().duration;
      a.time = Math.min(time, clipDuration);
      a.paused = false;
      a.play();
    });

    if (sceneAudioRef.current) {
      sceneAudioRef.current.currentTime = Math.min(time, sceneAudioRef.current.duration);
      sceneAudioRef.current.play().catch(() => {});
    }

    setProgress(time);
    setIsPlaying(true);
    setIsPaused(false);
    setIsEnded(time >= duration);
  }, [duration]);

  // 🔄 Boucle progression
  useEffect(() => {
    const update = () => {
      if (!isPlaying || isPaused || activeActionsRef.current.length === 0) {
        rafRef.current = requestAnimationFrame(update);
        return;
      }

      const t = Math.max(...activeActionsRef.current.map(a => a.time));
      if (t >= duration) {
        setProgress(duration);
        setIsPlaying(false);
        setIsPaused(false);
        setIsEnded(true);
        activeActionsRef.current.forEach(a => {
          a.stop();
          a.paused = true;
        });
      } else {
        setProgress(t);
      }

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, isPaused, duration]);

  // 🔹 Reset si POI change
  useEffect(() => {
    resetSceneStable();
  }, [poi, resetSceneStable]);

  return {
    isPlaying,
    isPaused,
    isEnded,
    progress,
    duration,
    togglePlayPause,
    seekScene,
    playScene,
  };
};
