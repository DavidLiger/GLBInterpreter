import { useRef, useCallback } from "react";
import * as THREE from "three";
import type { POIWithElements } from "@/types/diorama";
import { usePlaceholderSwap } from "./usePlaceholderSwap";

export const usePOIAnimations = (
  emptyRefs: React.RefObject<Record<string, THREE.Object3D>>
) => {
  const mixerRef = useRef<Record<string, THREE.AnimationMixer>>({});
  const actionsRef = useRef<Map<string, THREE.AnimationAction>>(new Map());

  // ✅ Hook placeholder
  const placeholderSwap = usePlaceholderSwap({ 
    emptyRefs,
    transitionFrames: 5
  });

  // ────────────── Init Mixers ──────────────
  const initMixers = useCallback((scene: THREE.Object3D) => {
    console.log('🎭 initMixers appelé');
    
    console.log('🧹 Reset mixers existants:', Object.keys(mixerRef.current).length);
    Object.values(mixerRef.current).forEach(mixer => {
      mixer.stopAllAction();
    });
    mixerRef.current = {};
    
    let mixerCount = 0;
    
    scene.traverse((child) => {
      if (!child.name) return;

      if (child.type === "SkinnedMesh" && child.parent) {
        const armature = child.parent;
        if (armature && !mixerRef.current[armature.name]) {
          mixerRef.current[armature.name] = new THREE.AnimationMixer(armature);
          mixerCount++;
          console.log('✅ Mixer créé (SkinnedMesh):', armature.name);
        }
      }
      else if (child.type === "Mesh") {
        const mesh = child as THREE.Mesh;
        
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

  // ────────────── PRÉPARER les actions (SANS jouer) ──────────────
  const prepareActions = useCallback(
    (poi: POIWithElements, animations: THREE.AnimationClip[]) => {
      console.log(`🎬 prepareActions pour POI: ${poi.id}`);
      
      poi.elements?.forEach((el) => {
        const target = emptyRefs.current[el.name];
        if (!target) return console.warn(`⚠️ Objet non trouvé : ${el.name}`);

        // ✅ Initialiser placeholder si configuré
        if (el.placeholderMesh) {
          console.log(`🎭 Init placeholder pour: ${el.name} -> ${el.placeholderMesh}`);
          placeholderSwap.initPlaceholder(el.name, el.placeholderMesh);
        }

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

        // ✅ Créer l'action et la STOCKER dans actionsRef
        // (reset/loop/clamp appliqués au lancement par usePOIScenePlayer.playScene)
        const action = mixer.clipAction(clip);
        
        // ✅ CLEF IMPORTANTE : Stocker avec el.name, PAS clip.name
        actionsRef.current.set(el.name, action);
        
        console.log(`✅ Action préparée (pas jouée): ${el.name} -> ${clip.name}`);
      });
    },
    [emptyRefs, placeholderSwap]
  );

  // ────────────── Stopper toutes les animations ──────────────
  const stopAllAnimations = useCallback(() => {
    console.log('🛑 Stop all animations');
    
    placeholderSwap.resetAll();

    Object.values(mixerRef.current).forEach((mixer) => {
      mixer.stopAllAction();
    });
    
    actionsRef.current.clear(); // ✅ Vider aussi les actions préparées
  }, [placeholderSwap]);

  // ────────────── Update pour animate() ──────────────
  const updateMixers = useCallback((delta: number) => {
    Object.values(mixerRef.current).forEach((m) => m.update(delta));
  }, []);

  // ────────────── Cleanup complet ──────────────
  const cleanup = useCallback(() => {
    console.log('🧹 Cleanup mixers:', Object.keys(mixerRef.current).length);
    
    placeholderSwap.cleanup();
    
    Object.values(mixerRef.current).forEach(mixer => {
      mixer.stopAllAction();
    });
    mixerRef.current = {};
    actionsRef.current.clear();
  }, [placeholderSwap]);

  return { 
    mixerRef, 
    actionsRef, // ✅ Exposé
    initMixers, 
    prepareActions, // ✅ Renommé depuis playPOIAnimations
    stopAllAnimations, 
    updateMixers, 
    cleanup,
    startAnimationWithSkip: placeholderSwap.startAnimationWithSkip,
  };
};