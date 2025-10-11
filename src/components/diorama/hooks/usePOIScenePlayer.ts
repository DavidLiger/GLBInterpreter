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

  // 🆕 pour la caméra synchronisée
  goToPOI?: (poi: POIWithElements, smooth?: boolean, duration?: number) => void;
  findPOIRecursively?: (id: string) => POIWithElements | null;
  moveCameraTo?: (obj: THREE.Object3D, poi: POIWithElements, smooth?: boolean, onComplete?: () => void, duration?: number) => void;
  emptyRefs?: React.RefObject<Record<string, THREE.Object3D>>;
};



export const usePOIScenePlayer = ({
  poi,
  animations,
  mixerRef,
  ambientAudioRefs = {},
  fadeDuration = 0.15,
  muted = false,
  goToPOI,
  findPOIRecursively,
}: UsePOIScenePlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(1);
  const [isEnded, setIsEnded] = useState(false);

  const activeActionsRef = useRef<THREE.AnimationAction[]>([]);
  const sceneAudioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const lastSeekTimeRef = useRef(0);
  const triggeredCameraSteps = useRef<Set<number>>(new Set());

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

  // 🔹 Reset si POI change
  useEffect(() => {
    lastSeekTimeRef.current = 0; // 🔹 Réinitialiser le temps pour la nouvelle POI
    resetSceneStable();
  }, [poi, resetSceneStable]);

  // 🔹 Play / Replay
  const playScene = useCallback(() => {
    triggeredCameraSteps.current.clear();
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

    // 🕒 Repartir du point sélectionné si on avait cherché pendant la pause
    if (lastSeekTimeRef.current > 0) {
      actions.forEach(a => {
        a.time = Math.min(lastSeekTimeRef.current, a.getClip().duration);
      });
      if (sceneAudioRef.current) {
        sceneAudioRef.current.currentTime = Math.min(lastSeekTimeRef.current, sceneAudioRef.current.duration || maxDuration);
      }
    }

    // 🔊 Couper les ambiances
    Object.values(ambientAudioRefs).forEach(a => {
      a.pause();
      a.muted = true;
    });

    // 🎵 Lecture du son de scène
    if (poi.sceneSound) {
      const audio = new Audio(poi.sceneSound);
      audio.loop = false;
      audio.muted = muted;
      audio.play().catch(() => {});
      sceneAudioRef.current = audio;

      // 🕒 Avancer le son à la même position si on avait cherché pendant pause
      if (lastSeekTimeRef.current > 0) {
        audio.currentTime = Math.min(lastSeekTimeRef.current, audio.duration || maxDuration);
      }

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
      // 🧭 Repart de la dernière position cherchée
      activeActionsRef.current.forEach(a => {
        a.paused = false;
        a.time = Math.min(lastSeekTimeRef.current, a.getClip().duration);
        a.play();
      });

      if (sceneAudioRef.current) {
        sceneAudioRef.current.currentTime = Math.min(
          lastSeekTimeRef.current,
          sceneAudioRef.current.duration
        );
        sceneAudioRef.current.play().catch(() => {});
      }

      setIsPaused(false);
      setIsPlaying(true);
    } else {
      activeActionsRef.current.forEach(a => (a.paused = true));
      if (!sceneAudioRef.current?.paused) sceneAudioRef.current?.pause();
      setIsPaused(true);
    }
  }, [isPlaying, isPaused, isEnded, playScene]);

  // 🔹 Seek
  const seekScene = useCallback(
    (time: number) => {
      const clampedTime = Math.min(time, duration);
      lastSeekTimeRef.current = clampedTime;

      activeActionsRef.current.forEach(a => {
        const clipDuration = a.getClip().duration;
        a.time = Math.min(clampedTime, clipDuration);
        if (!isPaused) {
          a.paused = false;
          a.play();
        } else {
          a.paused = true;
        }
      });

      if (sceneAudioRef.current) {
        sceneAudioRef.current.currentTime = Math.min(clampedTime, sceneAudioRef.current.duration);
        if (!isPaused) {
          sceneAudioRef.current.play().catch(() => {});
        } else {
          sceneAudioRef.current.pause();
        }
      }

      setProgress(clampedTime);
      setIsEnded(clampedTime >= duration);
      setIsPlaying(!isPaused);
    },
    [duration, isPaused]
  );

  // 🔄 Caméra synchronisée à la timeline
// useEffect(() => {
//   if (!poi?.cameraPath?.length) return;
//   if (!isPlaying || isPaused) return;
//   if (!emptyRefs?.current || !moveCameraTo) return;

//   const stepsToTrigger = poi.cameraPath.filter(step => progress >= step.time);
//   if (stepsToTrigger.length > 0) {
//     const latest = stepsToTrigger[stepsToTrigger.length - 1];
//     if (!triggeredCameraSteps.current.has(latest.time)) {
//       triggeredCameraSteps.current.add(latest.time);

//       const targetPOI = findPOIRecursively?.(latest.poi);
//       if (targetPOI) {
//         const targetObj = emptyRefs.current[targetPOI.emptyName];
//         if (targetObj) {
//           moveCameraTo(targetObj, targetPOI, true, undefined, latest.duration ?? 700);
//         }
//       }
//     }
//   }
// }, [progress, poi, goToPOI, findPOIRecursively, isPlaying, isPaused, emptyRefs, moveCameraTo]);


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
