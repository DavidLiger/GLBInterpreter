// hooks/usePOINavigation.ts
import { useState, useCallback } from "react";
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import type { POI, POIWithElements, DioramaConfig3D } from "@/types/diorama";

export const usePOINavigation = (
  config: DioramaConfig3D,
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>,
  controlsRef: React.RefObject<OrbitControls | null>,
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

  // ────────────── Caméra / déplacement AMÉLIORÉ ──────────────
  const animateCameraMove = useCallback((
    fromPos: THREE.Vector3,
    toPos: THREE.Vector3,
    fromTarget: THREE.Vector3,
    toTarget: THREE.Vector3,
    fromOrbit?: any,
    toPOI?: POI,
    duration = 700,
    onComplete?: () => void
  ) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    // ✅ Sauvegarder les contraintes initiales
    const savedConstraints = {
      minDistance: controls.minDistance,
      maxDistance: controls.maxDistance,
      minPolarAngle: controls.minPolarAngle,
      maxPolarAngle: controls.maxPolarAngle,
      minAzimuthAngle: controls.minAzimuthAngle,
      maxAzimuthAngle: controls.maxAzimuthAngle,
      enableZoom: controls.enableZoom,
      enablePan: controls.enablePan,
    };

    // ✅ Désactiver les contraintes pendant l'animation
    controls.minDistance = 0;
    controls.maxDistance = Infinity;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;

    // ✅ Calculer les quaternions pour interpolation smooth de la rotation
    const startQuaternion = new THREE.Quaternion();
    const endQuaternion = new THREE.Quaternion();
    
    // Direction initiale
    const startDir = new THREE.Vector3().subVectors(fromTarget, fromPos).normalize();
    const startMatrix = new THREE.Matrix4().lookAt(fromPos, fromTarget, camera.up);
    startQuaternion.setFromRotationMatrix(startMatrix);
    
    // Direction finale
    const endDir = new THREE.Vector3().subVectors(toTarget, toPos).normalize();
    const endMatrix = new THREE.Matrix4().lookAt(toPos, toTarget, camera.up);
    endQuaternion.setFromRotationMatrix(endMatrix);

    const startTime = performance.now();
    
    // ✅ Améliorer l'easing (plus smooth)
    const easeInOutQuart = (t: number) =>
      t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;

    let animationFrame: number;

    const step = (time: number) => {
      const elapsed = time - startTime;
      const tRaw = Math.min(elapsed / duration, 1);
      const t = easeInOutQuart(tRaw);

      // ✅ Interpoler position
      camera.position.lerpVectors(fromPos, toPos, t);
      
      // ✅ Interpoler rotation avec quaternion (SLERP = smooth)
      const currentQuat = new THREE.Quaternion().slerpQuaternions(startQuaternion, endQuaternion, t);
      camera.quaternion.copy(currentQuat);
      
      // ✅ Interpoler target
      controls.target.lerpVectors(fromTarget, toTarget, t);

      controls.update();

      if (tRaw < 1) {
        animationFrame = requestAnimationFrame(step);
      } else {
        // ✅ Réappliquer les contraintes finales à la fin
        controls.minDistance = toPOI?.minDistance ?? savedConstraints.minDistance;
        controls.maxDistance = toPOI?.maxDistance ?? savedConstraints.maxDistance;
        controls.minPolarAngle = toPOI?.minPolarAngle ?? savedConstraints.minPolarAngle;
        controls.maxPolarAngle = toPOI?.maxPolarAngle ?? savedConstraints.maxPolarAngle;
        controls.minAzimuthAngle = toPOI?.minAzimuthAngle ?? savedConstraints.minAzimuthAngle;
        controls.maxAzimuthAngle = toPOI?.maxAzimuthAngle ?? savedConstraints.maxAzimuthAngle;
        controls.enableZoom = toPOI?.enableZoom ?? savedConstraints.enableZoom;
        controls.enablePan = toPOI?.enablePan ?? savedConstraints.enablePan;
        controls.dampingFactor = toPOI?.dampingFactor ?? 0.05;
        
        controls.update();
        
        if (onComplete) onComplete();
      }
    };

    animationFrame = requestAnimationFrame(step);
  }, [cameraRef, controlsRef]);

  const moveCameraDuringAnimation = useCallback(
    (obj: THREE.Object3D, poi: POIWithElements) => {
      if (!cameraRef.current || !controlsRef.current) return;

      const camera = cameraRef.current;
      const controls = controlsRef.current;

      const toPos = obj.position.clone();

      const lookAt = new THREE.Vector3();
      obj.getWorldDirection(lookAt);
      lookAt.add(obj.position);

      camera.position.copy(toPos);
      camera.lookAt(lookAt);
      controls.target.copy(lookAt);
      controls.update();

      controls.minDistance = poi.minDistance ?? 1;
      controls.maxDistance = poi.maxDistance ?? 20;
      controls.minPolarAngle = poi.minPolarAngle ?? 0;
      controls.maxPolarAngle = poi.maxPolarAngle ?? Math.PI / 2;
      controls.minAzimuthAngle = poi.minAzimuthAngle ?? -Math.PI;
      controls.maxAzimuthAngle = poi.maxAzimuthAngle ?? Math.PI;
      controls.enableZoom = poi.enableZoom ?? true;

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

  const moveCameraToPOI = useCallback(
    (obj: THREE.Object3D, poi: POI, smooth = true, onComplete?: () => void) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) return;

      const minDist = poi.minDistance ?? 2;
      const maxDist = poi.maxDistance ?? 20;
      const targetDistance = poi.zoom 
        ? Math.max(minDist, Math.min(maxDist, poi.zoom))
        : (minDist + maxDist) / 2;

      const targetPos = obj.position.clone();

      const minPolar = poi.minPolarAngle ?? 0;
      const maxPolar = poi.maxPolarAngle ?? Math.PI;
      const minAzimuth = poi.minAzimuthAngle;
      const maxAzimuth = poi.maxAzimuthAngle;

      // ✅ Angle polaire moyen
      const targetPolar = (minPolar + maxPolar) / 2;
      
      // ✅ AMÉLIORATION : Calcul intelligent de l'azimuth
      let targetAzimuth = 0;
      
      if (minAzimuth !== undefined && maxAzimuth !== undefined) {
        // Gérer le cas où l'angle traverse 0 (ex: -0.5 à 0.5)
        let diff = maxAzimuth - minAzimuth;
        
        // Normaliser la différence dans [-π, π]
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        
        // Calculer l'angle moyen
        targetAzimuth = minAzimuth + diff / 2;
        
        // Normaliser dans [-π, π]
        while (targetAzimuth > Math.PI) targetAzimuth -= 2 * Math.PI;
        while (targetAzimuth < -Math.PI) targetAzimuth += 2 * Math.PI;
      } else if (poi.lookAxis) {
        // Fallback sur lookAxis si angles non définis
        switch (poi.lookAxis) {
          case "z": targetAzimuth = Math.PI / 2; break;
          default: targetAzimuth = 0; // "x", "y"
        }
      }

      // ✅ Position finale en coordonnées sphériques
      const finalPos = new THREE.Vector3(
        targetDistance * Math.sin(targetPolar) * Math.cos(-targetAzimuth),
        targetDistance * Math.cos(targetPolar),
        targetDistance * Math.sin(targetPolar) * Math.sin(-targetAzimuth)
      ).add(targetPos);

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
    },
    [cameraRef, controlsRef, animateCameraMove]
  );

  // ────────────── Navigation principale AMÉLIORÉE ──────────────
  const goToPOI = useCallback(
    (poi: POI) => {
      onPOIChange?.();

      const targetObj = emptyRefs.current[poi.emptyName];
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