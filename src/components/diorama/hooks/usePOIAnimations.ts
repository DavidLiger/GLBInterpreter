import { useRef, useCallback } from "react";
import * as THREE from "three";
import type { POIWithElements } from "@/types/diorama";

export const usePOIAnimations = (
  emptyRefs: React.MutableRefObject<Record<string, THREE.Object3D>>
) => {
  const mixerRef = useRef<Record<string, THREE.AnimationMixer>>({});

  // ────────────── Init Mixers ──────────────
  const initMixers = useCallback((scene: THREE.Object3D) => {
    scene.traverse((child) => {
      if (!child.name) return;

      // SkinnedMesh → mixer sur parent Armature
      if (child.type === "SkinnedMesh" && child.parent) {
        const armature = child.parent;
        if (armature && !mixerRef.current[armature.name]) {
          mixerRef.current[armature.name] = new THREE.AnimationMixer(armature);
        }
      }
      // Mesh simple → mixer sur lui-même
      else if (child.type === "Mesh" && !mixerRef.current[child.name]) {
        mixerRef.current[child.name] = new THREE.AnimationMixer(child);
      }
    });
  }, []);

  // ────────────── Jouer les animations d’un POI ──────────────
  const playPOIAnimations = useCallback(
    (poi: POIWithElements, animations: THREE.AnimationClip[]) => {
      poi.elements?.forEach((el) => {
        const target = emptyRefs.current[el.name];
        if (!target) return console.warn(`⚠️ Objet non trouvé : ${el.name}`);

        // Trouver un mixer existant ou créer
        let mixer = mixerRef.current[target.name];
        if (!mixer) {
          mixer = new THREE.AnimationMixer(target);
          mixerRef.current[target.name] = mixer;
        }

        // Trouver le clip correspondant
        const clip = animations.find(
          (a) => a.name.toLowerCase() === el.clipName.toLowerCase()
        );
        if (!clip) return console.warn(`⚠️ Clip non trouvé : ${el.clipName}`);

        // Jouer l’action
        const action = mixer.clipAction(clip);
        action.reset();
        action.setLoop(el.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        if (el.autoplay) action.play();
      });
    },
    [emptyRefs]
  );

  // ────────────── Stopper toutes les animations ──────────────
  const stopAllAnimations = useCallback(() => {
    Object.values(mixerRef.current).forEach((mixer) => {
      mixer.stopAllAction();
    });
  }, []);

  // ────────────── Update pour animate() ──────────────
  const updateMixers = useCallback((delta: number) => {
    Object.values(mixerRef.current).forEach((m) => m.update(delta));
  }, []);

  return { mixerRef, initMixers, playPOIAnimations, stopAllAnimations, updateMixers };
};
