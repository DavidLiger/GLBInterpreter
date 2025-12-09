// hooks/usePOIEffects.ts
import * as THREE from "three";
import { useEffect } from "react";
import type { POIWithElements } from "@/types/diorama";

export const usePOIEffects = (
  scene: THREE.Scene,
  poi?: POIWithElements,
  textureLoader?: THREE.TextureLoader
) => {
  useEffect(() => {
    // ✅ Vérification stricte
    if (!poi?.effects?.enabled) return;

    const group = new THREE.Group();
    scene.add(group);

    // 🌿 Particules dynamiques (OPTIONNEL)
    if (poi.effects.particles?.type) { // ✅ Vérifier que type existe
      const { type, intensity = 1, color = 0xffffff, area = [3, 3, 3], texture } = poi.effects.particles;
      const count = Math.floor(200 * intensity);
      const geom = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      
      for (let i = 0; i < count; i++) {
        positions[i * 3 + 0] = (Math.random() - 0.5) * area[0];
        positions[i * 3 + 1] = Math.random() * area[1];
        positions[i * 3 + 2] = (Math.random() - 0.5) * area[2];
      }
      
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const mat = new THREE.PointsMaterial({
        color,
        size: 0.05,
        transparent: true,
        opacity: 0.8,
        map: textureLoader && texture ? textureLoader.load(texture) : undefined,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const points = new THREE.Points(geom, mat);
      group.add(points);
    }

    // 🌇 Skybox dynamique (OPTIONNEL)
    if (poi.effects.skybox?.texture) { // ✅ Vérifier que texture existe
      const { texture, tint, intensity } = poi.effects.skybox;
      if (textureLoader) {
        const skyTex = textureLoader.load(texture);
        const skyMat = new THREE.MeshBasicMaterial({
          map: skyTex,
          color: new THREE.Color(tint ?? 0xffffff),
          side: THREE.BackSide,
          opacity: intensity ?? 1,
          transparent: intensity !== undefined && intensity < 1,
        });
        const skyGeo = new THREE.SphereGeometry(100, 32, 32);
        const sky = new THREE.Mesh(skyGeo, skyMat);
        group.add(sky);
      }
    }

    // 💡 Lumière dynamique (OPTIONNEL)
    if (poi.effects.lighting) { // ✅ Vérification simple suffit
      const { temperature = 5500, ambientIntensity = 0.5 } = poi.effects.lighting;
      const hue = Math.max(0, Math.min(60, (6500 - temperature) / 100));
      const ambient = new THREE.AmbientLight(
        new THREE.Color(`hsl(${hue}, 80%, 60%)`),
        ambientIntensity
      );
      group.add(ambient);
    }

    // 🧹 Nettoyage
    return () => {
      scene.remove(group);
      group.traverse((obj) => {
        if (obj instanceof THREE.Points && obj.geometry) {
          obj.geometry.dispose();
        }
        if (obj instanceof THREE.Mesh) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => m.dispose());
            } else {
              obj.material.dispose();
            }
          }
        }
      });
    };
  }, [poi, scene, textureLoader]);
};