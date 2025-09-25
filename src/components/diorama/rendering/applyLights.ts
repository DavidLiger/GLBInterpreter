import * as THREE from "three";
import type { DioramaLight } from "@/types/diorama";

export function applyLights(
  root: THREE.Object3D,
  emptyRefs: Record<string, THREE.Object3D>,
  lights?: DioramaLight[]
) {
  if (!lights) return;

  lights.forEach((lightCfg) => {
    let light: THREE.Light;

    if (lightCfg.type === "ambient") {
      light = new THREE.AmbientLight(
        lightCfg.color ?? 0xffffff,
        lightCfg.intensity ?? 0.5
      );
      root.add(light);

    } else if (lightCfg.type === "spot" && lightCfg.emptyName) {
      const posObj = emptyRefs[lightCfg.emptyName];
      if (!posObj) {
        console.warn(`Spot position empty not found: ${lightCfg.emptyName}`);
        return;
      }

      const spot = new THREE.SpotLight(
        lightCfg.color ?? 0xffffff,
        lightCfg.intensity ?? 1,
        lightCfg.distance ?? 15,
        lightCfg.angle ?? Math.PI / 6,
        lightCfg.penumbra ?? 0.1
      );

      spot.position.copy(posObj.position);
      spot.castShadow = true;
      spot.shadow.mapSize.width = 1024;
      spot.shadow.mapSize.height = 1024;

      // cible optionnelle
      const targetName = lightCfg.emptyName + "_target";
      const targetObj = emptyRefs[targetName];

      if (targetObj) {
        spot.target = targetObj;
      } else {
        const lookAt = new THREE.Object3D();
        lookAt.position.set(
          posObj.position.x,
          posObj.position.y - 1,
          posObj.position.z
        );
        root.add(lookAt);
        spot.target = lookAt;
      }

      root.add(spot);
      root.add(spot.target);
    }
  });
}
