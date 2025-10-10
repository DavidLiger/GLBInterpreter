import { useState, useCallback, useEffect } from "react";
import * as THREE from "three";
import type { POIWithElements } from "@/types/diorama";

type UsePOIScenePlayerProps = {
  poi?: POIWithElements | null;
  animations: THREE.AnimationClip[];
  mixerRef: Record<string, THREE.AnimationMixer>;
  ambientAudioRefs: Record<string, HTMLAudioElement>;
  fadeDuration?: number;
};

export const usePOIScenePlayer = ({
  poi,
  animations,
  mixerRef,
  ambientAudioRefs,
  fadeDuration = 1,
}: UsePOIScenePlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(1);
  const [activeActions, setActiveActions] = useState<THREE.AnimationAction[]>([]);
  const [isEnded, setIsEnded] = useState(false);

  // 🔉 Fondu sonore
  const fadeOutAudio = useCallback(
    (audio: HTMLAudioElement) => {
      const originalVolume = audio.volume;
      const start = Date.now();
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
    },
    [fadeDuration]
  );

  // 🔄 Reset stable
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
    setIsEnded(false); // ✅ reset fin
  }, []);

  // ▶️ Lecture principale
  const playScene = useCallback(() => {
    if (!poi) return;

    resetSceneStable();
    setIsEnded(false); // ✅ reset fin

    const actions: THREE.AnimationAction[] = [];

    poi.elements?.forEach((el) => {
      const mixer = mixerRef[el.name];
      if (!mixer) return;

      const clip = animations.find(
        (a) => a.name.toLowerCase() === el.clipName.toLowerCase()
      );
      if (!clip) return;

      const action = mixer.clipAction(clip);
      action.reset();
      action.setLoop(el.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = true;
      action.play();

      actions.push(action);
    });

    if (actions.length > 0) {
      const maxDuration = Math.max(...actions.map((a) => a.getClip().duration));
      setDuration(maxDuration);
    } else {
      setDuration(1);
    }

    setActiveActions(actions);
    setIsPlaying(true);
    setIsPaused(false);
    setProgress(0);

    const currentAmbient = ambientAudioRefs[poi.id];
    if (currentAmbient) fadeOutAudio(currentAmbient);
  }, [poi, mixerRef, animations, ambientAudioRefs, fadeOutAudio, resetSceneStable]);

  // ⏩ Seek manuel
  const seekScene = useCallback(
    (time: number) => {
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
      setProgress(time);
      setIsPlaying(true);
      setIsPaused(false);
      setIsEnded(false); // ✅ reset fin si seek
    },
    [activeActions]
  );

  // ⏯️ Toggle Play / Pause / Replay
  const togglePlayPause = useCallback(() => {
    if (!isPlaying && isEnded) {
      seekScene(0);
    } else if (!isPlaying) {
      playScene();
    } else if (isPaused) {
      activeActions.forEach((a) => (a.paused = false));
      setIsPaused(false);
    } else {
      activeActions.forEach((a) => (a.paused = true));
      setIsPaused(true);
    }
  }, [isPlaying, isPaused, isEnded, activeActions, playScene, seekScene]);

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
          setIsEnded(true); // ✅ animation terminée
        }
      }
      frameId = requestAnimationFrame(update);
    };
    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, isPaused, duration, activeActions]);

  // 🔄 Reset automatique à chaque changement de POI
  useEffect(() => {
    resetSceneStable();
  }, [poi, resetSceneStable]);

  return {
    isPlaying,
    isPaused,
    isEnded,   // ✅ exposé pour POIPlayer
    progress,
    duration,
    togglePlayPause,
    seekScene,
  };
};
