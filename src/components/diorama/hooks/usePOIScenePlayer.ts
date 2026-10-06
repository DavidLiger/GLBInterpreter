import { useState, useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import type { POIWithElements } from "@/types/diorama";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

type UsePOIScenePlayerProps = {
  poi?: POIWithElements | null;
  autoplayEnabled?: boolean;
  experienceStarted?: boolean;
  animations: THREE.AnimationClip[];
  mixerRef: Record<string, THREE.AnimationMixer>;
  actionsRef: React.MutableRefObject<Map<string, THREE.AnimationAction>>; 
  fadeDuration?: number;
  muted?: boolean;

  goToPOI?: (poi: POIWithElements, smooth?: boolean, duration?: number) => void;
  findPOIRecursively?: (id: string) => POIWithElements | null;
  moveCameraToPOI?: (obj: THREE.Object3D, poi: POIWithElements, smooth?: boolean, onComplete?: () => void, duration?: number) => void;
  moveCameraDuringAnimation?: (obj: THREE.Object3D, poi: POIWithElements) => void;
  emptyRefs?: React.RefObject<Record<string, THREE.Object3D>>;

  findParentPOI?: (childId: string) => POIWithElements | null;
  controlsRef?: React.RefObject<OrbitControls | null>;
  cameraRef?: React.RefObject<THREE.PerspectiveCamera | null>;
  startPlaceholderAnimation?: (name: string, frames?: number) => void;
  startAnimationWithSkip?: (
    animatedMeshName: string,
    action: THREE.AnimationAction,
    mixer: THREE.AnimationMixer,
    framesToSkip: number
  ) => void;
  prepareStopAnimation?: (name: string, duration: number, frames?: number) => void;
  waitForSceneAudioRef?: React.RefObject<(() => Promise<void>) | null>; // ✅ Ref au lieu de fonction directe
};

export const usePOIScenePlayer = ({
  poi,
  autoplayEnabled = true, 
  experienceStarted = false,
  animations,
  mixerRef,
  actionsRef, 
  fadeDuration = 0.15,
  startAnimationWithSkip,
  prepareStopAnimation,
  findParentPOI,
  emptyRefs, 
  controlsRef,
  moveCameraToPOI,
  moveCameraDuringAnimation,
  cameraRef,
  waitForSceneAudioRef,
}: UsePOIScenePlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(1); // Durée initiale par défaut
  const [isEnded, setIsEnded] = useState(false);
  const [isWaitingAudio, setIsWaitingAudio] = useState(false);

  const activeActionsRef = useRef<THREE.AnimationAction[]>([]);
  const rafRef = useRef<number | undefined>(undefined);
  const lastSeekTimeRef = useRef(0);

  const moveCameraToPOIRef = useRef(moveCameraToPOI);
  const moveCameraDuringAnimationRef = useRef(moveCameraDuringAnimation);

  const poiRef = useRef(poi);
  const durationRef = useRef(duration);
  const lastProgressRef = useRef(0);
  const frameCountRef = useRef(0);
  const hasAutoplayedRef = useRef<Set<string>>(new Set());

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
  }, []);

  useEffect(() => {
    poiRef.current = poi;
    durationRef.current = duration;
  }, [poi, duration]);

  useEffect(() => {
    moveCameraToPOIRef.current = moveCameraToPOI;
    moveCameraDuringAnimationRef.current = moveCameraDuringAnimation;
  }, [moveCameraToPOI, moveCameraDuringAnimation]);

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
  const playScene = useCallback(async (forceReplay = false) => {
    if (!poi) return;
    const isParent = !findParentPOI?.(poi.id);
    if (!isParent) return;

    // ✅ AJOUTER : Attendre l'audio si sceneSound
    if (poi.sceneSound && waitForSceneAudioRef?.current) {
      console.log("⏳ [PLAYER] Attente audio prêt...");
      setIsWaitingAudio(true);
      
      try {
        await waitForSceneAudioRef.current(); // ✅ Appeler via le ref
        console.log("✅ [PLAYER] Audio prêt, lancement animations");
      } catch (err) {
        console.error("❌ [PLAYER] Échec audio:", err);
      } finally {
        setIsWaitingAudio(false);
      }
    }

    if (forceReplay) lastSeekTimeRef.current = 0;
    resetSceneStable();

    const startTime = forceReplay ? 0 : (lastSeekTimeRef.current || 0);
    setProgress(startTime);
    setIsEnded(false);

    const actions: THREE.AnimationAction[] = [];
    
    poi.elements?.forEach(el => {
    const action = actionsRef.current.get(el.name);
    if (!action) {
      console.warn(`⚠️ Action non préparée pour: ${el.name}`);
      return;
    }

    // Reset et configure l'action
    action.reset();
    action.setLoop(el.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true;
    action.fadeIn(fadeDuration);
    
    // Positionner au temps de départ si reprise
    if (startTime > 0) {
      action.time = Math.min(startTime, action.getClip().duration);
    }
    
    // ✅ JOUER D'ABORD
    action.play();
    actions.push(action);
    
    // ✅ PUIS avancer et swapper (APRÈS play)
    // ✅ PUIS avancer et swapper (APRÈS quelques frames)
    if (el.placeholderMesh && el.transitionFrames) {
      const animated = emptyRefs?.current?.[el.name];
      const placeholder = emptyRefs?.current?.[el.placeholderMesh];
      
      if (animated && placeholder) {
        // Rester caché pendant X frames
        animated.visible = false;
        placeholder.visible = true;
        
        // Swapper après le délai
        const delayMs = (el.transitionFrames / 60) * 1000;
        setTimeout(() => {
          animated.visible = true;
          placeholder.visible = false;
          console.log(`✅ Swap après ${el.transitionFrames} frames: ${el.name} visible`);
        }, delayMs);
        
        // Préparer le swap inverse si non-looping
        if (!el.loop && prepareStopAnimation) {
          prepareStopAnimation(el.name, action.getClip().duration, el.transitionFrames);
        }
      }
    }
  });

    if (actions.length === 0) {
      console.warn(`⚠️ Aucune action à jouer pour POI: ${poi.id}`);
      return;
    }

    const maxDuration = Math.max(...actions.map(a => a.getClip().duration));
    setDuration(maxDuration);
    activeActionsRef.current = actions;
    setIsPlaying(true);
    setIsPaused(false);
  }, [poi, actionsRef, mixerRef, fadeDuration, resetSceneStable, findParentPOI, startAnimationWithSkip, prepareStopAnimation, waitForSceneAudioRef]);

  // ✅ NOUVEAU : Auto-lancer si POI a autoplay
  useEffect(() => {
    if (!poi || !autoplayEnabled || !experienceStarted) { // ✅ AJOUTER experienceStarted
      console.log("⏭️ [AUTOPLAY] Conditions non remplies:", { 
        poi: !!poi, 
        autoplayEnabled, 
        experienceStarted 
      });
      return;
    }
    
    // Vérifier qu'on ne l'a pas déjà lancé pour ce POI
    if (hasAutoplayedRef.current.has(poi.id)) {
      console.log("⏭️ [AUTOPLAY] Déjà joué pour:", poi.id);
      return;
    }
    
    // Vérifier que c'est un parent (pas un enfant)
    const isParent = !findParentPOI?.(poi.id);
    if (!isParent) {
      console.log("⏭️ [AUTOPLAY] Ignoré (POI enfant):", poi.id);
      return;
    }
    
    // Délai pour laisser la caméra se positionner
    console.log("🎬 [AUTOPLAY] Lancement automatique pour:", poi.id);
    const timer = setTimeout(() => {
      playScene();
      hasAutoplayedRef.current.add(poi.id);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [poi, autoplayEnabled, experienceStarted, playScene, findParentPOI]); // ✅ Ajouter autoplayEnabled aux deps

  // ✅ NOUVEAU : Reset hasAutoplayedRef quand on désactive/réactive
  useEffect(() => {
    if (!autoplayEnabled) {
      // Si on désactive, on peut reset pour permettre re-autoplay plus tard
      hasAutoplayedRef.current.clear();
    }
  }, [autoplayEnabled]);

  // 🔹 Replay depuis le début
  const replayScene = useCallback(() => {
    playScene(true);
  }, [playScene]);

  const stopScene = useCallback(() => {
    activeActionsRef.current.forEach(a => a.stop());
    activeActionsRef.current = [];

    if (poi?.elements) {
      poi.elements.forEach(el => {
        if (el.placeholderMesh) {
          const animated = emptyRefs?.current?.[el.name];
          const placeholder = emptyRefs?.current?.[el.placeholderMesh];
          
          if (animated && placeholder) {
            animated.visible = false;
            placeholder.visible = true;
            console.log(`🔄 Reset placeholder: ${el.name}`);
          }
        }
      });
    }
    
    lastSeekTimeRef.current = 0;
    setProgress(0);
    setIsPlaying(false);
    setIsPaused(false);
    setIsEnded(true);
  }, [poi]);

  // 🔹 Toggle play/pause
  const togglePlayPause = useCallback(() => {
    const shouldSyncAudio = isPaused || (!isPlaying && !isEnded && lastSeekTimeRef.current > 0);
    
    if (isPaused) {
      activeActionsRef.current.forEach(a => {
        a.paused = false;
        a.play();
      });
      setIsPaused(false);
      setIsPlaying(true);
    } else if (!isPlaying && isEnded) {
      replayScene();
    } else if (!isPlaying) {
      playScene();
    } else {
      activeActionsRef.current.forEach(a => (a.paused = true));
      setIsPaused(true);
    }
    
    // ✅ Retourner si on doit sync l'audio et à quel moment
    return { shouldSyncAudio, syncTime: lastSeekTimeRef.current };
  }, [isPlaying, isPaused, isEnded, playScene, replayScene]);



  // 🔹 Seek
  const seekScene = useCallback((time: number) => {
    console.log("🎯 [seekScene] Début, time:", time, "isPlaying:", isPlaying, "isPaused:", isPaused); // ✅ LOG
    
    const clampedTime = Math.min(time, duration);
    lastSeekTimeRef.current = clampedTime;

    activeActionsRef.current.forEach(a => {
      const clipDuration = a.getClip().duration;
      a.time = Math.min(clampedTime, clipDuration);
      console.log("🎯 [seekScene] Action time set to:", a.time); // ✅ LOG
      a.paused = !isPlaying || isPaused;
      if (isPlaying && !isPaused) a.play();
    });

    setProgress(clampedTime);
    setIsEnded(clampedTime >= duration);
    
    console.log("✅ [seekScene] Terminé, progress set to:", clampedTime); // ✅ LOG
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

  const t = Math.max(...activeActionsRef.current.map(a => a.time));

  frameCountRef.current++;
  if (frameCountRef.current % 3 === 0) {
    const newProgress = Math.min(t, durationRef.current); // ✅ durationRef
    if (Math.abs(newProgress - lastProgressRef.current) > 0.01) {
      setProgress(newProgress);
      lastProgressRef.current = newProgress;
    }
  }

  // ✅ Utiliser poiRef.current
  if (poiRef.current?.cameraPath?.length) {
    const step = getCameraStepAtTime(poiRef.current, t);
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

        if (curr.zoom !== undefined && next.zoom !== undefined) {
          const zoomDistance = curr.zoom + (next.zoom - curr.zoom) * progressStep;
          const direction = new THREE.Vector3().subVectors(tempObj.position, look).normalize();
          tempObj.position.copy(look).addScaledVector(direction, zoomDistance);
        }

        moveCameraDuringAnimationRef.current?.(tempObj, poiRef.current);
      }
    }
  }

  lastSeekTimeRef.current = t;

  if (t >= durationRef.current) { // ✅ durationRef
    setIsPlaying(false);
    setIsPaused(false);
    setIsEnded(true);
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
    isWaitingAudio,
    progress,
    duration,
    togglePlayPause,
    seekScene,
    playScene,
    replayScene,
    stopScene,
    currentSceneSound: poi?.sceneSound,
    cleanup,
  };
};
