// src/components/diorama/rendering/applySpritesheet.ts
import * as THREE from "three";
import { SpritesheetAnimator } from "./SpritesheetAnimator";
import { DioramaVideo } from "@/types/diorama";

export function applySpritesheets(
  sceneOrGroup: THREE.Object3D,
  emptyRefs: Record<string, THREE.Object3D>,
  videos?: DioramaVideo[],
  animator?: SpritesheetAnimator | null
) {
  if (!videos) return;

  const loader = new THREE.TextureLoader();

  videos.forEach((video) => {
    if (video.type !== 'spritesheet' || !video.spritesheet) return;

    // ✅ Stocker la config AVANT le callback asynchrone
    const spritesheetConfig = video.spritesheet;
    const videoName = video.name;
    const videoSrc = video.src;

    const targetObj = emptyRefs[videoName];
    if (!targetObj) {
      console.warn(`❌ Mesh introuvable pour spritesheet: ${videoName}`);
      return;
    }

    loader.load(
      videoSrc,
      (texture) => {
        console.log(`✅ Spritesheet chargée: ${videoName}`);

        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;

        // ✅ Utiliser la variable locale
        const { columns, rows } = spritesheetConfig;
        texture.repeat.set(1 / columns, 1 / rows);
        texture.offset.set(0, 1 - 1 / rows);

        targetObj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const originalMat = child.material as THREE.MeshStandardMaterial;
            const material = originalMat.clone();
            
            material.map = texture;
            material.emissive = new THREE.Color(0xffffff);
            material.emissiveMap = texture;
            material.emissiveIntensity = 1;
            material.needsUpdate = true;

            child.material = material;

            // ✅ Utiliser la variable locale
            (child.userData as any).spritesheetConfig = spritesheetConfig;
            (child.userData as any).spritesheetTexture = texture;
          }
        });

        // ✅ Utiliser la variable locale
        if (animator && spritesheetConfig.mode === 'loop') {
          animator.register(videoName, texture, {
            columns,
            rows,
            totalFrames: spritesheetConfig.totalFrames,
            fps: spritesheetConfig.fps || 24,
          });
        }
      },
      undefined,
      (error) => {
        console.error(`❌ Erreur chargement spritesheet ${videoName}:`, error);
      }
    );
  });
}