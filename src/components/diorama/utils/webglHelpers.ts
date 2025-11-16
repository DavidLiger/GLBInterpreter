import * as THREE from 'three';

/**
 * Dispose proprement une scène Three.js
 */
export function disposeScene(scene: THREE.Scene | null) {
  if (!scene) return;

  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      // Dispose geometry
      object.geometry?.dispose();

      // Dispose materials
      if (Array.isArray(object.material)) {
        object.material.forEach((mat) => mat.dispose());
      } else {
        object.material?.dispose();
      }
    }
  });

  scene.clear();
}

/**
 * Calculer les vertices totaux d'une scène (pour profiling)
 */
export function countSceneVertices(scene: THREE.Scene): number {
  let total = 0;

  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const geometry = object.geometry;
      if (geometry.attributes.position) {
        total += geometry.attributes.position.count;
      }
    }
  });

  return total;
}

/**
 * Calculer les draw calls d'une scène
 */
export function countDrawCalls(scene: THREE.Scene): number {
  let count = 0;

  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      count++;
    }
  });

  return count;
}

/**
 * Logger les stats d'une scène (dev uniquement)
 */
export function logSceneStats(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  if (process.env.NODE_ENV !== 'development') return;

  const vertices = countSceneVertices(scene);
  const drawCalls = countDrawCalls(scene);
  const info = renderer.info;

  console.group('📊 Scene Stats');
  console.log(`Vertices: ${vertices.toLocaleString()}`);
  console.log(`Draw calls: ${drawCalls}`);
  console.log(`Triangles: ${info.render.triangles.toLocaleString()}`);
  console.log(`Textures: ${info.memory.textures}`);
  console.log(`Geometries: ${info.memory.geometries}`);
  console.groupEnd();
}
