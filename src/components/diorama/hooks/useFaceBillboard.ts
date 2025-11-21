// src/components/diorama/hooks/useFaceBillboard.ts
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useSpritesheet, SpritesheetConfig } from "./useSpritesheet";

export interface FaceBillboardConfig {
  /** Nom de l'armature ou bone de la tête */
  headBoneName: string;
  /** Offset par rapport à la tête */
  offset?: THREE.Vector3;
  /** Taille du billboard */
  scale?: number;
  /** Config spritesheet */
  spritesheet: SpritesheetConfig & { textureUrl: string };
}

export function useFaceBillboard(
  scene: THREE.Scene | null,
  emptyRefs: Record<string, THREE.Object3D>,
  mixerRef: React.MutableRefObject<Record<string, THREE.AnimationMixer>>,
  config: FaceBillboardConfig
) {
  const billboardRef = useRef<THREE.Sprite | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);

  // Charger la texture
  useEffect(() => {
    if (!scene) return;

    const loader = new THREE.TextureLoader();
    loader.load(config.spritesheet.textureUrl, (texture) => {
      textureRef.current = texture;
      texture.colorSpace = THREE.SRGBColorSpace;

      // Créer le billboard
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      });

      const sprite = new THREE.Sprite(material);
      sprite.scale.set(config.scale || 1, config.scale || 1, 1);
      billboardRef.current = sprite;

      // Attacher à la tête
      const headBone = emptyRefs[config.headBoneName];
      if (headBone) {
        if (config.offset) {
          sprite.position.copy(config.offset);
        }
        headBone.add(sprite);
        console.log(`✅ Billboard attaché à: ${config.headBoneName}`);
      } else {
        console.warn(`❌ Bone introuvable: ${config.headBoneName}`);
      }
    });

    return () => {
      if (billboardRef.current) {
        billboardRef.current.removeFromParent();
        billboardRef.current.geometry.dispose();
        (billboardRef.current.material as THREE.SpriteMaterial).dispose();
      }
      if (textureRef.current) {
        textureRef.current.dispose();
      }
    };
  }, [scene, config.headBoneName]);

  // Hook spritesheet avec mode controlled
  const spritesheetControls = useSpritesheet(
    textureRef.current,
    { ...config.spritesheet, mode: 'controlled' },
    false
  );

  // Synchroniser avec l'animation
  useEffect(() => {
    if (!mixerRef.current || !textureRef.current) return;

    const animate = () => {
      // Trouver le mixer actif pour ce personnage
      const mixer = Object.values(mixerRef.current).find(m => m.time > 0);
      
      if (mixer) {
        // ✅ Synchroniser la frame du visage avec le temps de l'animation
        spritesheetControls.setTime(mixer.time);
      }

      requestAnimationFrame(animate);
    };

    const rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [mixerRef, spritesheetControls]);

  return spritesheetControls;
}