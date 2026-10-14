// hooks/usePOINavigation.ts
import { useState, useCallback, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import type { POI, DioramaConfig3D } from "@/types/diorama";
import { findNode } from "../lib/nodeNames";
import type { FrameTasks } from "../lib/frameTasks";
import { applyOrbitConstraints, orbitPosition, resolveOrbit, type OrbitConstraints } from "../lib/orbitFraming";

export const usePOINavigation = (
  config: DioramaConfig3D,
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>,
  controlsRef: React.RefObject<OrbitControls | null>,
  emptyRefs: React.RefObject<Record<string, THREE.Object3D>>,
  /** Boucle unique du lecteur (P-06) : la transition de caméra y est une tâche. */
  frameTasks: React.RefObject<FrameTasks | null>,
  /** Rayon de la sphère englobante de la scène chargée (valeurs par défaut du cadrage). */
  sceneRadiusRef: React.RefObject<number | null>,
  onPOIChange?: () => void 
) => {
  const [currentPOI, setCurrentPOI] = useState<string | null>(null);

  // ────────────── Utils POI ──────────────
  const findParentPOI = useCallback((childId: string): POI | null => {
    const search = (pois: POI[]): POI | null => {
      for (const poi of pois) {
        if (poi.children?.some((c) => c.id === childId)) return poi;
        if (poi.children) {
          const p = search(poi.children);
          if (p) return p;
        }
      }
      return null;
    };
    return search(config.pois);
  }, [config.pois]);

  const findPOIRecursively = useCallback((id: string): POI | null => {
    const search = (pois: POI[]): POI | null => {
      for (const poi of pois) {
        if (poi.id === id) return poi;
        if (poi.children) {
          const found = search(poi.children);
          if (found) return found;
        }
      }
      return null;
    };
    return search(config.pois);
  }, [config.pois]);

  // ────────────── Caméra : transition (tâche de la boucle unique, P-06) ──────────────
  // Une seule transition à la fois : une nouvelle transition annule la précédente (avant Î10b, deux transitions
  // pouvaient courir ensemble, chacune avec son requestAnimationFrame).
  const cancelMoveRef = useRef<(() => void) | null>(null);

  const animateCameraMove = useCallback((
    fromPos: THREE.Vector3,
    toPos: THREE.Vector3,
    fromTarget: THREE.Vector3,
    toTarget: THREE.Vector3,
    finalConstraints: OrbitConstraints,
    duration = 700,
    onComplete?: () => void
  ) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    cancelMoveRef.current?.();
    cancelMoveRef.current = null;

    // Contraintes levées pendant la transition, posées à la fin
    controls.minDistance = 0;
    controls.maxDistance = Infinity;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;

    // Interpolation de la rotation par quaternions (SLERP)
    const startQuaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(fromPos, fromTarget, camera.up));
    const endQuaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(toPos, toTarget, camera.up));
    const currentQuat = new THREE.Quaternion();

    const easeInOutQuart = (t: number) =>
      t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;

    let startTime: number | null = null;
    const step = (_dt: number, now: number) => {
      if (startTime === null) startTime = now;
      const tRaw = Math.min((now - startTime) / duration, 1);
      const t = easeInOutQuart(tRaw);

      camera.position.lerpVectors(fromPos, toPos, t);
      camera.quaternion.copy(currentQuat.slerpQuaternions(startQuaternion, endQuaternion, t));
      controls.target.lerpVectors(fromTarget, toTarget, t);
      controls.update();

      if (tRaw < 1) return true;
      cancelMoveRef.current = null;
      applyOrbitConstraints(controls, finalConstraints);
      controls.update();
      onComplete?.();
      return false;
    };

    const tasks = frameTasks.current;
    if (!tasks) return;
    cancelMoveRef.current = tasks.add(step);
  }, [cameraRef, controlsRef, frameTasks]);

  /** Cadrage complet du POI (valeurs déclarées, sinon valeurs par défaut sur la sphère englobante de la scène). */
  const frameFor = useCallback((poi: POI) => resolveOrbit(poi, sceneRadiusRef.current ?? 1), [sceneRadiusRef]);

  /**
   * Caméra pendant une animation à `cameraPath` (module réservé) : `obj` porte la position et l'orientation calculées par
   * le lecteur de ligne de temps. Même règle de `zoom` que le cadrage du POI (décision du 13/10) : la distance à la
   * cible vaut `minDistance + zoom × (maxDistance − minDistance)` quand le POI déclare `zoom`.
   */
  const moveCameraDuringAnimation = useCallback(
    (obj: THREE.Object3D, poi: POI) => {
      if (!cameraRef.current || !controlsRef.current) return;

      const camera = cameraRef.current;
      const controls = controlsRef.current;

      const toPos = obj.getWorldPosition(new THREE.Vector3());
      const lookAt = obj.getWorldDirection(new THREE.Vector3()).add(toPos);

      camera.position.copy(toPos);
      camera.lookAt(lookAt);
      controls.target.copy(lookAt);

      const frame = frameFor(poi);
      applyOrbitConstraints(controls, frame);

      if (poi.zoom !== undefined) {
        const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize().multiplyScalar(frame.distance);
        camera.position.copy(controls.target).add(dir);
      }

      controls.update();
    },
    [cameraRef, controlsRef, frameFor]
  );

  /**
   * Cadrage orbital d'un POI (P-17 à P-21) : cible = position **monde** de l'empty (P-20) ; vue de départ et bornes
   * calculées par `resolveOrbit` dans la convention d'`OrbitControls` (`lib/orbitFraming.ts`).
   */
  const moveCameraToPOI = useCallback(
    (obj: THREE.Object3D, poi: POI, smooth = true, onComplete?: () => void) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      const frame = frameFor(poi);
      const targetPos = obj.getWorldPosition(new THREE.Vector3());
      const finalPos = orbitPosition(targetPos, frame);

      if (smooth) {
        animateCameraMove(camera.position.clone(), finalPos, controls.target.clone(), targetPos, frame, 700, onComplete);
      } else {
        cancelMoveRef.current?.();
        cancelMoveRef.current = null;
        camera.position.copy(finalPos);
        controls.target.copy(targetPos);
        applyOrbitConstraints(controls, frame);
        controls.update();
        onComplete?.();
      }
    },
    [cameraRef, controlsRef, animateCameraMove, frameFor]
  );

  // ────────────── Navigation principale AMÉLIORÉE ──────────────
  const goToPOI = useCallback(
    (poi: POI) => {
      onPOIChange?.();

      const targetObj = findNode(emptyRefs.current, poi.emptyName);
      if (!targetObj) return;

      const current = currentPOI;
      const parent = current ? findParentPOI(current) : null;

      const goingToChild = current && poi && findParentPOI(poi.id)?.id === current;
      const goingToParent = parent?.id === poi.id;

      // ✅ Transition directe pour parent<->enfant et start
      if (goingToChild || goingToParent || poi.id === "start" || !current) {
        moveCameraToPOI(targetObj, poi, true, () => setCurrentPOI(poi.id));
        return;
      }

      // ✅ OPTION 1 : Transition directe (sans passer par start)
      // Décommenter cette ligne pour éviter le double mouvement :
      moveCameraToPOI(targetObj, poi, true, () => setCurrentPOI(poi.id));
      
      // ✅ OPTION 2 : Passage par start (comportement actuel)
      // Commenter l'option 1 et décommenter ce bloc si tu préfères :
      /*
      const startPOI = config.pois.find((p) => p.id === "start");
      if (startPOI) {
        const startObj = emptyRefs.current[startPOI.emptyName];
        if (startObj) {
          moveCameraToPOI(startObj, startPOI, true, () => {
            // ✅ Petit délai entre les deux mouvements
            setTimeout(() => {
              moveCameraToPOI(targetObj, poi, true, () => setCurrentPOI(poi.id));
            }, 100);
          });
        }
      } else {
        moveCameraToPOI(targetObj, poi, true, () => setCurrentPOI(poi.id));
      }
      */
    },
    [currentPOI, emptyRefs, moveCameraToPOI, config.pois, findParentPOI, onPOIChange]
  );

  return {
    currentPOI,
    goToPOI,
    findParentPOI,
    moveCameraToPOI,
    moveCameraDuringAnimation,
    setCurrentPOI,
    findPOIRecursively,
  };
};