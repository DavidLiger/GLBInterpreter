import * as THREE from "three";
import type { POIWithElements } from "@/types/diorama";
import type { SpritesheetAnimator } from "./SpritesheetAnimator";

export function applyFacialSpritesheets(
  sceneOrGroup: THREE.Object3D, // ✅ Plus générique
  emptyRefs: Record<string, THREE.Object3D>,
  pois: POIWithElements[],
  animator?: SpritesheetAnimator | null
) {
  if (!animator) return;

  const loader = new THREE.TextureLoader();

  pois.forEach(poi => {
    poi.elements?.forEach(element => {
      if (!element.facialSpritesheets) return;

      element.facialSpritesheets.forEach(spriteConfig => {
        const meshObj = emptyRefs[spriteConfig.meshName];
        if (!meshObj) {
          console.warn(`❌ Mesh introuvable: ${spriteConfig.meshName}`);
          return;
        }

        loader.load(
          spriteConfig.src,
          (texture) => {
            console.log(`✅ Facial spritesheet chargée: ${spriteConfig.meshName}`);

            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;

            const { columns, rows } = spriteConfig;
            texture.repeat.set(1 / columns, 1 / rows);
            texture.offset.set(0, 1 - 1 / rows);

            // Appliquer sur le mesh
            meshObj.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                const originalMat = child.material as THREE.MeshStandardMaterial;
                const material = originalMat.clone();
                
                material.map = texture;
                material.transparent = true;
                material.alphaTest = 0.5;
                material.needsUpdate = true;

                child.material = material;
              }
            });

            // ✅ Enregistrer avec le nom du mixer de l'armature
            animator.register(
              spriteConfig.meshName,
              texture,
              {
                columns,
                rows,
                totalFrames: spriteConfig.totalFrames,
                fps: spriteConfig.fps,
                mode: spriteConfig.mode,
              },
              element.name // ✅ Nom de l'armature pour sync
            );
          },
          undefined,
          (error) => {
            console.error(`❌ Erreur chargement facial spritesheet ${spriteConfig.meshName}:`, error);
          }
        );
      });
    });
  });
}