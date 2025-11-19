import { useState, useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import type { POIWithElements } from "@/types/diorama";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

type UsePOIScenePlayerProps = {
  poi?: POIWithElements | null;
  animations: THREE.AnimationClip[];
  mixerRef: Record<string, THREE.AnimationMixer>;
  // ambientAudioRefs?: Record<string, HTMLAudioElement>;
  fadeDuration?: number;
  muted?: boolean;
  // onSceneStart?: (poiId: string, sceneSound?: string) => void;
  // onSceneEnd?: (poiId: string) => void;

  goToPOI?: (poi: POIWithElements, smooth?: boolean, duration?: number) => void;
  findPOIRecursively?: (id: string) => POIWithElements | null;
  moveCameraToPOI?: (obj: THREE.Object3D, poi: POIWithElements, smooth?: boolean, onComplete?: () => void, duration?: number) => void;
  moveCameraDuringAnimation?: (obj: THREE.Object3D, poi: POIWithElements, smooth?: boolean, onComplete?: () => void, duration?: number) => void;
  emptyRefs?: React.RefObject<Record<string, THREE.Object3D>>;

  findParentPOI?: (childId: string) => POIWithElements | null;
  controlsRef?: React.RefObject<OrbitControls | null>;
  cameraRef?: React.RefObject<THREE.PerspectiveCamera | null>;
};

export const usePOIScenePlayer = ({
  poi,
  animations,
  mixerRef,
  // ambientAudioRefs = {},
  fadeDuration = 0.15,
  // muted = false,
  findParentPOI,
  emptyRefs, 
  controlsRef,
  moveCameraToPOI,
  moveCameraDuringAnimation,
  cameraRef
}: UsePOIScenePlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(1); // Durée initiale par défaut
  const [isEnded, setIsEnded] = useState(false);
  // const [sceneMuted, setSceneMuted] = useState(false);

  const activeActionsRef = useRef<THREE.AnimationAction[]>([]);
  // const sceneAudioRef = useRef<HTMLAudioElement | null>(null);
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
    setIsEnded(false);

    // if (sceneAudioRef.current) {
    //   sceneAudioRef.current.pause();
    //   sceneAudioRef.current.currentTime = 0;
    //   sceneAudioRef.current = null;
    // }
  }, []);

  // 🔹 Reset si POI parent change
  useEffect(() => {
    if (!poi) return;
    const isParent = !findParentPOI?.(poi.id);
    if (isParent) {
      lastSeekTimeRef.current = 0;
      resetSceneStable();
    }
  }, [poi, resetSceneStable, findParentPOI]);

  // 🔹 Calculer la durée totale du POI avant lecture
  useEffect(() => {
    if (!poi) return;

    const actionsDurations: number[] = [];
    poi.elements?.forEach(el => {
      const clip = animations.find(a => a.name.toLowerCase() === el.clipName.toLowerCase());
      if (clip) actionsDurations.push(clip.duration);
    });

    if (actionsDurations.length > 0) {
      const maxDuration = Math.max(...actionsDurations);
      setDuration(maxDuration);
    }
  }, [poi, animations]);

  // 🔹 Play scene (pause / resume / seek aware)
  const playScene = useCallback((forceReplay = false) => {
    if (!poi) return;
    const isParent = !findParentPOI?.(poi.id);
    if (!isParent) return;

    triggeredCameraSteps.current.clear();

    if (forceReplay) lastSeekTimeRef.current = 0;
    resetSceneStable();

    const startTime = forceReplay ? 0 : (lastSeekTimeRef.current || 0);
    setProgress(startTime);
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
      // ✅ Positionner au temps de départ
      if (startTime > 0) {
        action.time = Math.min(startTime, clip.duration);
      }
      action.play();
      actions.push(action);
    });

    const maxDuration = actions.length > 0 ? Math.max(...actions.map(a => a.getClip().duration)) : duration;
    setDuration(maxDuration);
    activeActionsRef.current = actions;
    setIsPlaying(true);
    setIsPaused(false);

    // 🔹 Si pause + seek, reprendre là où on s'était arrêté
    if (!forceReplay && lastSeekTimeRef.current > 0) {
      actions.forEach(a => {
        a.time = Math.min(lastSeekTimeRef.current, a.getClip().duration);
      });
    }

    // 🔹 Son de la scène
    
  }, [poi, mixerRef, animations, fadeDuration, resetSceneStable, findParentPOI, duration]);

  // 🔹 Replay depuis le début
  const replayScene = useCallback(() => {
    playScene(true);
  }, [playScene]);

  const stopScene = useCallback(() => {
    activeActionsRef.current.forEach(a => a.stop());
    activeActionsRef.current = [];
    
    lastSeekTimeRef.current = 0;
    setProgress(0);
    setIsPlaying(false);
    setIsPaused(false);
    setIsEnded(true);
  }, [poi]);

  // 🔹 Toggle play/pause
  const togglePlayPause = useCallback(() => {
  if (isPaused) {
    // reprendre là où on était réellement
    activeActionsRef.current.forEach(a => {
      a.paused = false;
      a.play();
    });

    setIsPaused(false);
    setIsPlaying(true);
  } else if (!isPlaying && isEnded) {
    // replay depuis le début
    replayScene();
  } else if (!isPlaying) {
    // play depuis le début
    playScene();
  } else {
    // pause
    activeActionsRef.current.forEach(a => (a.paused = true));
    // if (!sceneAudioRef.current?.paused) sceneAudioRef.current?.pause();
    setIsPaused(true);
  }
}, [isPlaying, isPaused, isEnded, playScene, replayScene]);



  // 🔹 Seek
  const seekScene = useCallback((time: number) => {
    const clampedTime = Math.min(time, duration);
    lastSeekTimeRef.current = clampedTime;

    activeActionsRef.current.forEach(a => {
      const clipDuration = a.getClip().duration;
      a.time = Math.min(clampedTime, clipDuration);
      a.paused = !isPlaying || isPaused;
      if (isPlaying && !isPaused) a.play();
    });

    setProgress(clampedTime);
    setIsEnded(clampedTime >= duration);
  }, [duration, isPlaying, isPaused]);

  function normalizeCameraPath(poi: POIWithElements) {
  if (!poi.cameraPath?.length) return [];

  const steps = [
    { point: poi.emptyName, target: poi.emptyName, time: 0, duration: 0 },
    ...poi.cameraPath,
  ];

  const last = poi.cameraPath[poi.cameraPath.length - 1];

  // ⚡ Forcer le retour au POI de base
  steps.push({
    point: poi.emptyName,
    target: poi.emptyName,
    time: (last.time ?? 0) + (last.duration ?? 0),
    duration: 0.01, // quasi instantané
    zoom: poi.zoom, // zoom de base
  });

  return steps;
}


function getCameraStepAtTime(poi: POIWithElements, t: number) {
  const steps = normalizeCameraPath(poi);
  for (let i = 0; i < steps.length - 1; i++) {
    const curr = steps[i];
    const next = steps[i + 1];
    const currDuration = curr.duration ?? 0; // 👈 fallback if undefined
    const currTime = curr.time ?? 0;

    if (t >= currTime && t <= currTime + currDuration) {
      return { curr, next };
    }
  }
  return null;
}

useEffect(() => {
  if (!poi || !emptyRefs?.current || !controlsRef?.current || !moveCameraDuringAnimation || !moveCameraToPOI) return;

  const controls = controlsRef.current;

  const getLookOffset = (axis: "x" | "y" | "z" = "x") => {
    switch (axis) {
      case "x": return new THREE.Vector3(1, 0, 0);
      case "y": return new THREE.Vector3(0, 1, 0);
      case "z": return new THREE.Vector3(0, 0, 1);
      default: return new THREE.Vector3(1, 0, 0);
    }
  };

  // 🔹 Fonction pour reset camera POI de base (utilisateur)
  const resetCameraToPOI = () => {
    const baseObj = emptyRefs.current[poi.emptyName];
    if (!baseObj) return;

    // Déplace la caméra
    cameraRef?.current!.position.copy(baseObj.position.clone().add(new THREE.Vector3(0, 0, poi.zoom ?? 3)));

    // Débloque OrbitControls
    if (controlsRef?.current) {
      controlsRef.current.target.copy(baseObj.position); // cible = POI
      controlsRef.current.update(); // recalcul
      controlsRef.current.enabled = true; // s'assurer qu'il est actif
    }
  };

  resetCameraToPOI();

  const update = () => {
    if (activeActionsRef.current.length === 0) {
      rafRef.current = requestAnimationFrame(update);
      return;
    }

    // 🔹 Progress basé sur mixers pour keep seek
    const t = Math.max(...activeActionsRef.current.map(a => a.time));
    setProgress(Math.min(t, duration));

    // 🔹 Gestion cameraPath pendant animation
    if (poi.cameraPath?.length) {
      const step = getCameraStepAtTime(poi, t);
      if (step) {
        const { curr, next } = step;
        const pointA = emptyRefs.current[curr.point];
        const pointB = emptyRefs.current[next.point];
        const targetA = emptyRefs.current[curr.target || curr.point];
        const targetB = emptyRefs.current[next.target || next.point];

        if (pointA && pointB && targetA && targetB) {
          const progressStep = Math.min((t - (curr.time ?? 0)) / (curr.duration ?? 1), 1);

          const pos = new THREE.Vector3().lerpVectors(pointA.position, pointB.position, progressStep);
          const look = new THREE.Vector3().lerpVectors(targetA.position, targetB.position, progressStep);

          const tempObj = new THREE.Object3D();
          tempObj.position.copy(pos);
          tempObj.lookAt(look);

          // 🔹 Zoom progressif si défini
          if (curr.zoom !== undefined && next.zoom !== undefined) {
            const zoomDistance = curr.zoom + (next.zoom - curr.zoom) * progressStep;
            const direction = new THREE.Vector3().subVectors(tempObj.position, look).normalize();
            tempObj.position.copy(look).addScaledVector(direction, zoomDistance);
          }

          moveCameraDuringAnimation(tempObj, poi, false);
        }
      }
    }

    // 🔹 Fin de l’animation
    if (t >= duration) {
      setIsPlaying(false);
      setIsPaused(false);
      setIsEnded(true);

      // 🔹 Reset à la position de base pour que l'utilisateur reprenne le contrôle
      resetCameraToPOI();
    }

    rafRef.current = requestAnimationFrame(update);
  };

  rafRef.current = requestAnimationFrame(update);
  return () => cancelAnimationFrame(rafRef.current!);
}, [poi, duration, emptyRefs, controlsRef, moveCameraDuringAnimation, moveCameraToPOI]);

const cleanup = useCallback(() => {
  console.log("🔇 Cleanup POI Scene Player");
  
  // Stop animations
  activeActionsRef.current.forEach(a => a.stop());
  activeActionsRef.current = [];
  
  // Cancel RAF
  if (rafRef.current) {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = undefined;
  }
  
  // Reset state
  setIsPlaying(false);
  setIsPaused(false);
  setProgress(0);
  setIsEnded(false);
  
  console.log("✅ POI Scene Player cleanup terminé");
}, []);



  return {
    isPlaying,
    isPaused,
    isEnded,
    progress,
    duration,
    togglePlayPause,
    seekScene,
    playScene,
    replayScene,
    // sceneMuted,
    // toggleSceneMute,
    stopScene,
    currentSceneSound: poi?.sceneSound,
    cleanup,
  };
};
