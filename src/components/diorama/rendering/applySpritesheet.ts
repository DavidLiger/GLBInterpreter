// src/components/diorama/rendering/applySpritesheet.ts
import { DioramaVideo } from "@/types/diorama";
import * as THREE from "three";

export function applySpritesheets(
  scene: THREE.Scene,
  emptyRefs: Record<string, THREE.Object3D>,
  videos?: DioramaVideo[]
) {
  if (!videos) return;

  const loader = new THREE.TextureLoader();

  videos.forEach((video) => {
    if (video.type !== 'spritesheet' || !video.spritesheet) return;

    const targetObj = emptyRefs[video.name];
    if (!targetObj) {
      console.warn(`❌ Mesh introuvable pour spritesheet: ${video.name}`);
      return;
    }

    // Charger la texture spritesheet
    loader.load(
      video.src,
      (texture) => {
        console.log(`✅ Spritesheet chargée: ${video.name}`);

        // Configuration
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = THREE.SRGBColorSpace;

        // Initialiser l'UV
        const { columns, rows } = video.spritesheet!;
        texture.repeat.set(1 / columns, 1 / rows);
        texture.offset.set(0, 1 - 1 / rows);

        // Appliquer à tous les meshes enfants
        targetObj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const material = child.material as THREE.MeshStandardMaterial;
            material.map = texture;
            material.emissive = new THREE.Color(0xffffff);
            material.emissiveMap = texture;
            material.emissiveIntensity = 1;
            material.needsUpdate = true;

            // Stocker la config pour récupération ultérieure
            (child.userData as any).spritesheetConfig = video.spritesheet;
            (child.userData as any).spritesheetTexture = texture;
          }
        });
      },
      undefined,
      (error) => {
        console.error(`❌ Erreur chargement spritesheet ${video.name}:`, error);
      }
    );
  });
}