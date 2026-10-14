import { useState, useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import type { POI } from "@/types/diorama";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { findNode } from "../lib/nodeNames";
import type { FrameTasks } from "../lib/frameTasks";

/**
 * Lecteur de la ligne de temps d'un POI : module réservé `timeline` (barre de progression, seek, `sceneSound`,
 * `cameraPath`), utilisé par la fixture `test-street`. Une scène v1 n'a pas d'élément animé dans son POI `start` : ce
 * lecteur y reste inerte (c'est le mode `buttons`, `lib/buttonsPlayer.ts`, qui joue). Les constats propres au module
 * `timeline` (P-05, P-10, P-11, P-30, P-32, P-34, A-17, A-18, A-20, A-21) sont reportés.
 *
 * Correctifs du moteur commun (Î10b) :
 *  - P-02 : la fin de la ligne de temps est traitée une seule fois (avant : à chaque image après la fin) ;
 *  - P-04, R-22 : chaque lancement porte un jeton ; un lancement en attente du son de scène, ou un échange de
 *    placeholder différé, est abandonné si un autre lancement, un arrêt ou un changement de POI est survenu entre-temps ;
 *  - P-06 : le suivi image par image est une tâche de la boucle unique (`FrameTasks`), plus un requestAnimationFrame ;
 *  - P-12 : une action démarre à poids plein (un fondu depuis l'arrêt mélangeait la pose de repos du squelette) ;
 *  - P-14 : hiérarchie de l'autoplay : `poi.autoplay`, sinon `autoplay` de la scène, sinon non ; seulement pour un POI
 *    parent qui a des éléments animés, une fois par POI et par session, et si l'interrupteur de l'utilisateur est actif ;
 *  - caméra : plus de recadrage forcé à chaque changement de POI (il écrasait le cadrage de `moveCameraToPOI`) ; à la fin
 *    d'une ligne de temps à `cameraPath`, retour au cadrage du POI par `moveCameraToPOI`.
 */
type UsePOIScenePlayerProps = {
  poi?: POI | null;
  /** `autoplay` de la scène (valeur par défaut des POI qui ne le déclarent pas, P-14). */
  sceneAutoplay?: boolean;
  /** Interrupteur de l'utilisateur (bouton du lecteur de ligne de temps). */
  autoplayEnabled?: boolean;
  experienceStarted?: boolean;
  animations: THREE.AnimationClip[];
  actionsRef: React.MutableRefObject<Map<string, THREE.AnimationAction>>;
  muted?: boolean;

  moveCameraToPOI?: (obj: THREE.Object3D, poi: POI, smooth?: boolean, onComplete?: () => void) => void;
  moveCameraDuringAnimation?: (obj: THREE.Object3D, poi: POI) => void;
  emptyRefs?: React.RefObject<Record<string, THREE.Object3D>>;

  findParentPOI?: (childId: string) => POI | null;
  controlsRef?: React.RefObject<OrbitControls | null>;
  frameTasks: React.RefObject<FrameTasks | null>;
  startAnimationWithSkip?: (
    animatedMeshName: string,
    action: THREE.AnimationAction,
    mixer: THREE.AnimationMixer,
    framesToSkip: number
  ) => void;
  prepareStopAnimation?: (name: string, duration: number, frames?: number) => void;
  waitForSceneAudioRef?: React.RefObject<(() => Promise<void>) | null>;
};

/** Vrai si la ligne de temps du POI se lance seule (P-14). */
export function shouldAutoplay(poi: POI | null | undefined, sceneAutoplay: boolean | undefined): boolean {
  if (!poi || !(poi.elements?.length)) return false;
  return poi.autoplay ?? sceneAutoplay ?? false;
}

export const usePOIScenePlayer = ({
  poi,
  sceneAutoplay,
  autoplayEnabled = true,
  experienceStarted = false,
  animations,
  actionsRef,
  prepareStopAnimation,
  findParentPOI,
  emptyRefs,
  controlsRef,
  moveCameraToPOI,
  moveCameraDuringAnimation,
  frameTasks,
  waitForSceneAudioRef,
}: UsePOIScenePlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(1); // Durée initiale par défaut
  const [isEnded, setIsEnded] = useState(false);
  const [isWaitingAudio, setIsWaitingAudio] = useState(false);

  const activeActionsRef = useRef<THREE.AnimationAction[]>([]);
  const lastSeekTimeRef = useRef(0);

  const moveCameraToPOIRef = useRef(moveCameraToPOI);
  const moveCameraDuringAnimationRef = useRef(moveCameraDuringAnimation);

  const poiRef = useRef(poi);
  const durationRef = useRef(duration);
  const lastProgressRef = useRef(0);
  const frameCountRef = useRef(0);
  const hasAutoplayedRef = useRef<Set<string>>(new Set());
  // P-04, R-22 : jeton du lancement courant ; tout traitement différé vérifie qu'il n'a pas changé
  const playTokenRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // P-02 : fin de la ligne de temps déjà traitée pour le lancement courant
  const endHandledRef = useRef(true);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  // 🔹 Reset stable de la scène (invalide les lancements en attente)
  const resetSceneStable = useCallback(() => {
    playTokenRef.current++;
    clearTimers();
    endHandledRef.current = true;
    activeActionsRef.current.forEach(a => {
      a.stop();
      a.paused = false;
    });
    activeActionsRef.current = [];
    setIsPlaying(false);
    setIsPaused(false);
    setProgress(0);
    setIsEnded(false);
  }, [clearTimers]);

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
      setDuration(Math.max(...actionsDurations));
    }
  }, [poi, animations]);

  // 🔹 Play scene (pause / resume / seek aware)
  const playScene = useCallback(async (forceReplay = false) => {
    if (!poi) return;
    const isParent = !findParentPOI?.(poi.id);
    if (!isParent) return;
    if (!poi.elements?.length) return; // pas de ligne de temps (scène v1 : mode `buttons`)

    const token = ++playTokenRef.current;

    // Attente du son de scène (bornée, voir useUnifiedAudio.waitForSceneAudio)
    if (poi.sceneSound && waitForSceneAudioRef?.current) {
      setIsWaitingAudio(true);
      try {
        await waitForSceneAudioRef.current();
      } catch (err) {
        console.error("❌ [PLAYER] Échec audio:", err);
      } finally {
        if (token === playTokenRef.current) setIsWaitingAudio(false);
      }
      // Lancement abandonné : arrêt, autre lancement ou changement de POI pendant l'attente
      if (token !== playTokenRef.current) return;
    }

    if (forceReplay) lastSeekTimeRef.current = 0;
    const startTime = forceReplay ? 0 : (lastSeekTimeRef.current || 0);
    resetSceneStable();
    const runToken = playTokenRef.current;

    setProgress(startTime);
    setIsEnded(false);

    const actions: THREE.AnimationAction[] = [];

    poi.elements.forEach(el => {
      const action = actionsRef.current.get(el.name);
      if (!action) {
        console.warn(`⚠️ Action non préparée pour: ${el.name}`);
        return;
      }

      action.reset();
      action.setLoop(el.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = true;
      action.setEffectiveWeight(1); // P-12 : pas de fondu depuis la pose de repos

      if (startTime > 0) {
        action.time = Math.min(startTime, action.getClip().duration);
      }

      action.play();
      actions.push(action);

      // Placeholder : l'objet animé reste caché pendant `transitionFrames`, puis prend la place du placeholder
      if (el.placeholderMesh && el.transitionFrames && emptyRefs?.current) {
        const animated = findNode(emptyRefs.current, el.name);
        const placeholder = findNode(emptyRefs.current, el.placeholderMesh);

        if (animated && placeholder) {
          animated.visible = false;
          placeholder.visible = true;

          const delayMs = (el.transitionFrames / 60) * 1000;
          timersRef.current.push(setTimeout(() => {
            if (runToken !== playTokenRef.current) return;
            animated.visible = true;
            placeholder.visible = false;
          }, delayMs));

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

    setDuration(Math.max(...actions.map(a => a.getClip().duration)));
    activeActionsRef.current = actions;
    endHandledRef.current = false;
    setIsPlaying(true);
    setIsPaused(false);
  }, [poi, actionsRef, resetSceneStable, findParentPOI, prepareStopAnimation, waitForSceneAudioRef, emptyRefs]);

  // 🔹 Autoplay (P-14) : une fois par POI et par session
  const autoplayWanted = !!poi && autoplayEnabled && shouldAutoplay(poi, sceneAutoplay) && !findParentPOI?.(poi.id);

  /** Lancement immédiat de l'autoplay, dans le geste de l'utilisateur (écran de démarrage). */
  const autoplayNow = useCallback(() => {
    if (!poi || !autoplayWanted || hasAutoplayedRef.current.has(poi.id)) return;
    hasAutoplayedRef.current.add(poi.id);
    playScene();
  }, [poi, autoplayWanted, playScene]);

  useEffect(() => {
    if (!poi || !autoplayWanted || !experienceStarted) return;
    if (hasAutoplayedRef.current.has(poi.id)) return;

    // Délai pour laisser la caméra se positionner
    const timer = setTimeout(() => {
      if (hasAutoplayedRef.current.has(poi.id)) return;
      hasAutoplayedRef.current.add(poi.id);
      playScene();
    }, 1000);

    return () => clearTimeout(timer);
  }, [poi, autoplayWanted, experienceStarted, playScene]);

  // Interrupteur désactivé : l'autoplay pourra rejouer quand il sera réactivé
  useEffect(() => {
    if (!autoplayEnabled) hasAutoplayedRef.current.clear();
  }, [autoplayEnabled]);

  // 🔹 Replay depuis le début
  const replayScene = useCallback(() => {
    playScene(true);
  }, [playScene]);

  const stopScene = useCallback(() => {
    playTokenRef.current++;
    clearTimers();
    endHandledRef.current = true;
    activeActionsRef.current.forEach(a => a.stop());
    activeActionsRef.current = [];

    if (poi?.elements && emptyRefs?.current) {
      poi.elements.forEach(el => {
        if (el.placeholderMesh) {
          const animated = findNode(emptyRefs.current, el.name);
          const placeholder = findNode(emptyRefs.current, el.placeholderMesh);
          if (animated && placeholder) {
            animated.visible = false;
            placeholder.visible = true;
          }
        }
      });
    }

    lastSeekTimeRef.current = 0;
    setProgress(0);
    setIsPlaying(false);
    setIsPaused(false);
    setIsEnded(true);
  }, [poi, emptyRefs, clearTimers]);

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

    return { shouldSyncAudio, syncTime: lastSeekTimeRef.current };
  }, [isPlaying, isPaused, isEnded, playScene, replayScene]);

  // 🔹 Seek
  const seekScene = useCallback((time: number) => {
    const clampedTime = Math.min(time, duration);
    lastSeekTimeRef.current = clampedTime;

    activeActionsRef.current.forEach(a => {
      a.time = Math.min(clampedTime, a.getClip().duration);
      a.paused = !isPlaying || isPaused;
      if (isPlaying && !isPaused) a.play();
    });

    setProgress(clampedTime);
    const ended = clampedTime >= duration;
    setIsEnded(ended);
    endHandledRef.current = ended || activeActionsRef.current.length === 0; // un seek avant la fin réarme le traitement de fin
  }, [duration, isPlaying, isPaused]);

  function normalizeCameraPath(poi: POI) {
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

  function getCameraStepAtTime(poi: POI, t: number) {
    const steps = normalizeCameraPath(poi);
    for (let i = 0; i < steps.length - 1; i++) {
      const curr = steps[i];
      const next = steps[i + 1];
      const currDuration = curr.duration ?? 0;
      const currTime = curr.time ?? 0;

      if (t >= currTime && t <= currTime + currDuration) {
        return { curr, next };
      }
    }
    return null;
  }

  // 🔹 Suivi image par image : tâche de la boucle unique (P-06)
  useEffect(() => {
    const tasks = frameTasks.current;
    if (!poi || !poi.elements?.length || !emptyRefs?.current || !controlsRef?.current || !tasks) return;

    /** Fin de la ligne de temps : retour au cadrage du POI si une `cameraPath` a déplacé la caméra. */
    const onEnd = () => {
      setIsPlaying(false);
      setIsPaused(false);
      setIsEnded(true);
      const p = poiRef.current;
      if (p?.cameraPath?.length) {
        const baseObj = findNode(emptyRefs.current, p.emptyName);
        if (baseObj) moveCameraToPOIRef.current?.(baseObj, p, false);
      }
    };

    const update = () => {
      if (activeActionsRef.current.length === 0) return;

      const t = Math.max(...activeActionsRef.current.map(a => a.time));

      frameCountRef.current++;
      if (frameCountRef.current % 3 === 0) {
        const newProgress = Math.min(t, durationRef.current);
        if (Math.abs(newProgress - lastProgressRef.current) > 0.01) {
          setProgress(newProgress);
          lastProgressRef.current = newProgress;
        }
      }

      const p = poiRef.current;
      if (p?.cameraPath?.length && !endHandledRef.current) {
        const step = getCameraStepAtTime(p, t);
        if (step) {
          const { curr, next } = step;
          const pointA = findNode(emptyRefs.current, curr.point);
          const pointB = findNode(emptyRefs.current, next.point);
          const targetA = findNode(emptyRefs.current, curr.target || curr.point);
          const targetB = findNode(emptyRefs.current, next.target || next.point);

          if (pointA && pointB && targetA && targetB) {
            // Module réservé `cameraPath` : positions locales des empties, inchangées (Annexe A)
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

            moveCameraDuringAnimationRef.current?.(tempObj, p);
          }
        }
      }

      lastSeekTimeRef.current = t;

      // P-02 : fin traitée une seule fois par lancement
      if (!endHandledRef.current && t >= durationRef.current) {
        endHandledRef.current = true;
        onEnd();
      }
    };

    return tasks.add(update);
  }, [poi, emptyRefs, controlsRef, frameTasks]);

  const cleanup = useCallback(() => {
    playTokenRef.current++;
    clearTimers();
    endHandledRef.current = true;
    activeActionsRef.current.forEach(a => a.stop());
    activeActionsRef.current = [];

    setIsPlaying(false);
    setIsPaused(false);
    setProgress(0);
    setIsEnded(false);
  }, [clearTimers]);

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
    autoplayNow,
    autoplayWanted,
    currentSceneSound: poi?.sceneSound,
    cleanup,
  };
};
