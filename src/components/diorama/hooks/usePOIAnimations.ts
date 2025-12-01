import { useRef, useCallback } from "react";
import * as THREE from "three";
import type { POIWithElements } from "@/types/diorama";

export const usePOIAnimations = (
  emptyRefs: React.RefObject<Record<string, THREE.Object3D>>
) => {
  const mixerRef = useRef<Record<string, THREE.AnimationMixer>>({});

  // ────────────── Init Mixers ──────────────
  const initMixers = useCallback((scene: THREE.Object3D) => {
    console.log('🎭 initMixers appelé');
    let mixerCount = 0;
    
    scene.traverse((child) => {
      if (!child.name) return;

      // SkinnedMesh → mixer sur parent Armature
      if (child.type === "SkinnedMesh" && child.parent) {
        const armature = child.parent;
        if (armature && !mixerRef.current[armature.name]) {
          mixerRef.current[armature.name] = new THREE.AnimationMixer(armature);
          mixerCount++;
          console.log('✅ Mixer créé (SkinnedMesh):', armature.name);
        }
      }
      // ✅ CORRIGÉ : Uniquement si morph targets
      else if (child.type === "Mesh") {
        const mesh = child as THREE.Mesh;
        
        // ✅ SEULEMENT si le mesh a des morph targets
        if (mesh.morphTargetInfluences && mesh.morphTargetInfluences.length > 0) {
          if (!mixerRef.current[child.name]) {
            mixerRef.current[child.name] = new THREE.AnimationMixer(mesh);
            mixerCount++;
            console.log('✅ Mixer créé (MorphTargets):', child.name);
          }
        }
      }
    });
    
    console.log(`🎭 Total mixers créés: ${mixerCount}`);
    console.log(`🎭 Total mixers dans ref: ${Object.keys(mixerRef.current).length}`);
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

  const cleanup = useCallback(() => {
    console.log('🧹 Cleanup mixers:', Object.keys(mixerRef.current).length);
    Object.values(mixerRef.current).forEach(mixer => {
      mixer.stopAllAction();
      // Les mixers Three.js n'ont pas de dispose(), juste les vider suffit
    });
    mixerRef.current = {};
  }, []);

  return { mixerRef, initMixers, playPOIAnimations, stopAllAnimations, updateMixers, cleanup };
};
