// hooks/usePOINavigation.ts
import { useState, useCallback } from "react";
import * as THREE from "three";
import type { POI, POIWithElements, DioramaConfig3D } from "@/types/diorama";

type UsePOINavigationProps = {
  onPOIChange?: () => void; // ✅ NOUVEAU
};

export const usePOINavigation = (
  config: DioramaConfig3D,
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>,
  controlsRef: React.RefObject<any>,
  emptyRefs: React.RefObject<Record<string, THREE.Object3D>>,
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

  const getVisiblePOIs = useCallback((): POI[] => {
    if (!currentPOI) return config.pois;

    const activePOI = config.pois.find((p) => p.id === currentPOI) || findPOIRecursively(currentPOI);
    const parent = findParentPOI(currentPOI);

    if (parent) {
      const siblings = parent.children?.filter((p) => p.id !== currentPOI) ?? [];
      const children = activePOI?.children ?? [];
      return [...siblings, ...children];
    } else {
      const siblings = config.pois.filter((p) => p.id !== currentPOI);
      const children = activePOI?.children ?? [];
      return [...siblings, ...children];
    }
  }, [currentPOI, config.pois, findParentPOI, findPOIRecursively]);

  // ────────────── Caméra / déplacement ──────────────
  const animateCameraMove = useCallback((
    fromPos: THREE.Vector3,
    toPos: THREE.Vector3,
    fromTarget: THREE.Vector3,
    toTarget: THREE.Vector3,
    fromOrbit?: any,
    toPOI?: POI,
    duration = 500,
    onComplete?: () => void
  ) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const startTime = performance.now();
    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const lerp = (from?: number, to?: number, t = 0) =>
      from !== undefined && to !== undefined ? from + (to - from) * t : to ?? from;

    const step = (time: number) => {
      const elapsed = time - startTime;
      const tRaw = Math.min(elapsed / duration, 1);
      const t = easeInOutCubic(tRaw);

      camera.position.lerpVectors(fromPos, toPos, t);
      controls.target.lerpVectors(fromTarget, toTarget, t);

      controls.minDistance = lerp(fromOrbit?.minDistance, toPOI?.minDistance, t) ?? controls.minDistance;
      controls.maxDistance = lerp(fromOrbit?.maxDistance, toPOI?.maxDistance, t) ?? controls.maxDistance;
      controls.minPolarAngle = lerp(fromOrbit?.minPolarAngle, toPOI?.minPolarAngle, t) ?? controls.minPolarAngle;
      controls.maxPolarAngle = lerp(fromOrbit?.maxPolarAngle, toPOI?.maxPolarAngle, t) ?? controls.maxPolarAngle;
      controls.minAzimuthAngle = lerp(fromOrbit?.minAzimuthAngle, toPOI?.minAzimuthAngle, t) ?? controls.minAzimuthAngle;
      controls.maxAzimuthAngle = lerp(fromOrbit?.maxAzimuthAngle, toPOI?.maxAzimuthAngle, t) ?? controls.maxAzimuthAngle;
      controls.dampingFactor = lerp(fromOrbit?.dampingFactor, toPOI?.dampingFactor, t) ?? controls.dampingFactor;

      controls.enableZoom = t < 1 ? fromOrbit?.enableZoom ?? controls.enableZoom : toPOI?.enableZoom ?? controls.enableZoom;
      controls.enablePan = t < 1 ? fromOrbit?.enablePan ?? controls.enablePan : toPOI?.enablePan ?? controls.enablePan;

      controls.update();
      if (tRaw < 1) requestAnimationFrame(step);
      else if (onComplete) onComplete();
    };

    requestAnimationFrame(step);
  }, [cameraRef, controlsRef]);

  const moveCameraDuringAnimation = useCallback(
  (
    obj: THREE.Object3D,
    poi: POIWithElements,
    smooth = true,
    onComplete?: () => void,
    duration = 1
  ) => {
    if (!cameraRef.current || !controlsRef.current) return;

    const camera = cameraRef.current;
    const controls = controlsRef.current;

    const fromPos = camera.position.clone();
    const toPos = obj.position.clone();

    const lookAt = new THREE.Vector3();
    obj.getWorldDirection(lookAt);
    lookAt.add(obj.position);

    if (smooth) {
      // interpolation fluide (ex: 1s)
      const startTime = performance.now();
      const animate = (time: number) => {
        const elapsed = (time - startTime) / 1000;
        const t = Math.min(elapsed / duration, 1);

        camera.position.lerpVectors(fromPos, toPos, t);
        camera.lookAt(lookAt);
        controls.target.lerp(lookAt, t);
        controls.update();

        if (t < 1) requestAnimationFrame(animate);
        else if (onComplete) onComplete();
      };
      requestAnimationFrame(animate);
    } else {
      camera.position.copy(toPos);
      camera.lookAt(lookAt);
      controls.target.copy(lookAt);
      controls.update();
      if (onComplete) onComplete?.();
    }

    // 🔹 Appliquer les réglages du POI
    controls.minDistance = poi.minDistance ?? 1;
    controls.maxDistance = poi.maxDistance ?? 20;
    controls.minPolarAngle = poi.minPolarAngle ?? 0;
    controls.maxPolarAngle = poi.maxPolarAngle ?? Math.PI / 2;
    controls.minAzimuthAngle = poi.minAzimuthAngle ?? -Math.PI;
    controls.maxAzimuthAngle = poi.maxAzimuthAngle ?? Math.PI;
    controls.enableZoom = poi.enableZoom ?? true;

    // Si zoom est défini → on rapproche/éloigne la caméra
    if (poi.zoom !== undefined && poi.zoom !== 1) {
      const dir = new THREE.Vector3()
        .subVectors(camera.position, controls.target)
        .normalize()
        .multiplyScalar(poi.zoom);
      camera.position.copy(controls.target.clone().add(dir));
    }

    controls.update();
  },
  [cameraRef, controlsRef]
);

const moveCameraToPOI = useCallback((obj: THREE.Object3D, poi: POI, smooth = true, onComplete?: () => void) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const distance = poi.zoom ?? 3;
    const axis = poi.lookAxis ?? "x";
    const offset = new THREE.Vector3(
      axis === "x" ? distance : 0,
      axis === "y" ? distance : 0,
      axis === "z" ? distance : 0
    );

    const targetPos = obj.position.clone();
    const finalPos = targetPos.clone().add(offset);

    if (smooth) {
      const currentOrbit: any = {
        minDistance: controls.minDistance,
        maxDistance: controls.maxDistance,
        minPolarAngle: controls.minPolarAngle,
        maxPolarAngle: controls.maxPolarAngle,
        minAzimuthAngle: controls.minAzimuthAngle,
        maxAzimuthAngle: controls.maxAzimuthAngle,
        enableZoom: controls.enableZoom,
        enablePan: controls.enablePan,
        dampingFactor: controls.dampingFactor,
      };

      animateCameraMove(
        camera.position.clone(),
        finalPos,
        controls.target.clone(),
        targetPos,
        currentOrbit,
        poi,
        700,
        onComplete
      );
    } else {
      camera.position.copy(finalPos);
      controls.target.copy(targetPos);
      Object.assign(controls, {
        minDistance: poi.minDistance ?? controls.minDistance,
        maxDistance: poi.maxDistance ?? controls.maxDistance,
        minPolarAngle: poi.minPolarAngle ?? controls.minPolarAngle,
        maxPolarAngle: poi.maxPolarAngle ?? controls.maxPolarAngle,
        minAzimuthAngle: poi.minAzimuthAngle ?? controls.minAzimuthAngle,
        maxAzimuthAngle: poi.maxAzimuthAngle ?? controls.maxAzimuthAngle,
        enableZoom: poi.enableZoom ?? controls.enableZoom,
        enablePan: poi.enablePan ?? controls.enablePan,
        dampingFactor: poi.dampingFactor ?? controls.dampingFactor,
      });
      controls.update();
      if (onComplete) onComplete();
    }
  }, [cameraRef, controlsRef, animateCameraMove]);

//------> Comportement de base <----------

  // ────────────── Navigation principale ──────────────
  const goToPOI = useCallback((poi: POI) => {
    // ✅ AJOUTER : Appeler le callback AVANT de bouger
    onPOIChange?.();

    const targetObj = emptyRefs.current[poi.emptyName];
    if (!targetObj) return;

    const current = currentPOI;
    const parent = current ? findParentPOI(current) : null;

    const goingToChild = current && poi && findParentPOI(poi.id)?.id === current;
    const goingToParent = parent?.id === poi.id;

    if (goingToChild || goingToParent || poi.id === "start") {
      moveCameraToPOI(targetObj, poi, true, () => setCurrentPOI(poi.id));
      return;
    }

    // navigation libre → passage par start
    const startPOI = config.pois.find((p) => p.id === "start");
    if (startPOI) {
      const startObj = emptyRefs.current[startPOI.emptyName];
      if (startObj) {
        moveCameraToPOI(startObj, startPOI, true, () => {
          moveCameraToPOI(targetObj, poi, true, () => setCurrentPOI(poi.id));
        });
      }
    } else {
      moveCameraToPOI(targetObj, poi, true, () => setCurrentPOI(poi.id));
    }
  }, [currentPOI, emptyRefs, moveCameraToPOI, config.pois, findParentPOI, onPOIChange]);

  return { currentPOI, goToPOI, getVisiblePOIs, findParentPOI, moveCameraToPOI, moveCameraDuringAnimation, setCurrentPOI, findPOIRecursively  };
};
