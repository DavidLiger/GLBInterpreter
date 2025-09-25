import * as THREE from "three";
import type { DioramaBulb } from "@/types/diorama";

export function applyBulbs(
  root: THREE.Object3D,
  emptyRefs: Record<string, THREE.Object3D>,
  bulbs?: DioramaBulb[]
) {
  if (!bulbs) return;

  bulbs.forEach((b) => {
    const bulbObj = emptyRefs[b.emptyName!];
    if (!bulbObj || !(bulbObj as THREE.Mesh).isMesh) return;

    const mesh = bulbObj as THREE.Mesh;

    const color = new THREE.Color(b.color ?? 0xffffff);
    const emissiveIntensity = b.emissiveIntensity ?? 1;

    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((mat) => {
        const m = mat as THREE.MeshStandardMaterial;
        m.emissive = color;
        m.emissiveIntensity = emissiveIntensity;
        m.needsUpdate = true;
      });
    } else {
      const m = mesh.material as THREE.MeshStandardMaterial;
      m.emissive = color;
      m.emissiveIntensity = emissiveIntensity;
      m.needsUpdate = true;
    }

    // Si tu veux activer aussi une vraie lumière :
    // const pointLight = new THREE.PointLight(color, b.intensity ?? 1, b.distance ?? 10);
    // pointLight.position.copy(mesh.position);
    // root.add(pointLight);
  });
}
