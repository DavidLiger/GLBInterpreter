import { useRef, useCallback } from "react";
import * as THREE from "three";
import type { POI } from "@/types/diorama";
import { findNode } from "../lib/nodeNames";
import { usePlaceholderSwap } from "./usePlaceholderSwap";

/**
 * Propriétaire unique des mixers et des actions du lecteur (R-13, R-27, P-25, Î10b).
 *
 * - Fixture (ligne de temps, module réservé `timeline`) : un mixer par armature skinnée ou maillage à morph targets
 *   (`initMixers`), complété à la demande par `prepareActions` ; actions indexées par nom d'élément.
 * - Scène v1 (mode `buttons`) : un seul mixer sur la racine de la scène (`createRootMixer`), utilisé par
 *   `lib/buttonsPlayer.ts` ; pas de mixer par armature (deux mixers sur les mêmes os se contrediraient).
 * Tous sont mis à jour par `updateMixers`, appelé une fois par image dans la boucle unique (P-06), et libérés par
 * `cleanup` (`stopAllAction` puis `uncacheRoot` : actions et liaisons ne survivent pas à la scène, part de P-26).
 */
export const usePOIAnimations = (
  emptyRefs: React.RefObject<Record<string, THREE.Object3D>>
) => {
  const mixerRef = useRef<Record<string, THREE.AnimationMixer>>({});
  const actionsRef = useRef<Map<string, THREE.AnimationAction>>(new Map());
  const rootMixerRef = useRef<THREE.AnimationMixer | null>(null);

  // On déstructure : l'objet retourné par usePlaceholderSwap change à chaque rendu, ses fonctions non.
  const {
    initPlaceholder,
    resetAll: resetAllPlaceholders,
    cleanup: cleanupPlaceholders,
    startAnimationWithSkip,
  } = usePlaceholderSwap({
    emptyRefs,
    transitionFrames: 5
  });

  const releaseMixer = (mixer: THREE.AnimationMixer) => {
    mixer.stopAllAction();
    mixer.uncacheRoot(mixer.getRoot());
  };

  // ────────────── Mixers de la fixture (un par armature / maillage à morph targets) ──────────────
  const initMixers = useCallback((scene: THREE.Object3D) => {
    Object.values(mixerRef.current).forEach(releaseMixer);
    mixerRef.current = {};
    actionsRef.current.clear();

    scene.traverse((child) => {
      if (!child.name) return;
      if ((child as THREE.SkinnedMesh).isSkinnedMesh && child.parent) {
        const armature = child.parent;
        if (!mixerRef.current[armature.name]) mixerRef.current[armature.name] = new THREE.AnimationMixer(armature);
      } else if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.morphTargetInfluences?.length && !mixerRef.current[child.name]) {
          mixerRef.current[child.name] = new THREE.AnimationMixer(mesh);
        }
      }
    });
  }, []);

  // ────────────── Mixer unique sur la racine de la scène (mode `buttons`) ──────────────
  const createRootMixer = useCallback((root: THREE.Object3D) => {
    if (rootMixerRef.current) releaseMixer(rootMixerRef.current);
    rootMixerRef.current = new THREE.AnimationMixer(root);
    return rootMixerRef.current;
  }, []);

  // ────────────── Préparer les actions d'un POI (sans jouer) ──────────────
  const prepareActions = useCallback(
    (poi: POI, animations: THREE.AnimationClip[]) => {
      poi.elements?.forEach((el) => {
        const target = findNode(emptyRefs.current, el.name);
        if (!target) return console.warn(`⚠️ Objet non trouvé : ${el.name}`);

        if (el.placeholderMesh) initPlaceholder(el.name, el.placeholderMesh);

        let mixer = mixerRef.current[target.name];
        if (!mixer) {
          mixer = new THREE.AnimationMixer(target);
          mixerRef.current[target.name] = mixer;
        }

        const clip = animations.find((a) => a.name === el.clipName) ?? animations.find((a) => a.name.toLowerCase() === el.clipName.toLowerCase());
        if (!clip) return console.warn(`⚠️ Clip non trouvé : ${el.clipName}`);

        // Clé : nom de l'élément (reset/loop/clamp appliqués au lancement par usePOIScenePlayer.playScene)
        actionsRef.current.set(el.name, mixer.clipAction(clip));
      });
    },
    [emptyRefs, initPlaceholder]
  );

  // ────────────── Stopper les animations des POI ──────────────
  const stopAllAnimations = useCallback(() => {
    resetAllPlaceholders();
    Object.values(mixerRef.current).forEach((mixer) => mixer.stopAllAction());
    actionsRef.current.clear();
  }, [resetAllPlaceholders]);

  // ────────────── Mise à jour, une fois par image (boucle unique) ──────────────
  const updateMixers = useCallback((delta: number) => {
    for (const m of Object.values(mixerRef.current)) m.update(delta);
    rootMixerRef.current?.update(delta);
  }, []);

  // ────────────── Nettoyage complet ──────────────
  const cleanup = useCallback(() => {
    cleanupPlaceholders();
    Object.values(mixerRef.current).forEach(releaseMixer);
    mixerRef.current = {};
    actionsRef.current.clear();
    if (rootMixerRef.current) {
      releaseMixer(rootMixerRef.current);
      rootMixerRef.current = null;
    }
  }, [cleanupPlaceholders]);

  return {
    mixerRef,
    actionsRef,
    rootMixerRef,
    initMixers,
    createRootMixer,
    prepareActions,
    stopAllAnimations,
    updateMixers,
    cleanup,
    startAnimationWithSkip,
  };
};
