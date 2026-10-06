import * as THREE from 'three';

/**
 * Libère un matériau ET toutes les textures qu'il référence (map, normalMap, emissiveMap, …,
 * ainsi que les uniforms des ShaderMaterial). material.dispose() seul ne libère aucune texture.
 */
function disposeMaterial(material: THREE.Material) {
  Object.values(material).forEach((value) => {
    if ((value as THREE.Texture | null)?.isTexture) (value as THREE.Texture).dispose();
  });

  const uniforms = (material as THREE.ShaderMaterial).uniforms;
  if (uniforms) {
    Object.values(uniforms).forEach((uniform) => {
      const value = (uniform as { value?: unknown }).value as THREE.Texture | null | undefined;
      if (value?.isTexture) value.dispose();
    });
  }

  material.dispose();
}

/**
 * Libère les ressources GPU de tout un sous-arbre (géométries, matériaux, textures, squelettes,
 * instances, ombres de lumières) sans le détacher de son parent.
 */
export function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    const o = object as THREE.Mesh & THREE.SkinnedMesh & THREE.InstancedMesh & THREE.Light;

    o.geometry?.dispose();

    if (o.material) {
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      materials.forEach(disposeMaterial);
    }

    // Texture d'os des SkinnedMesh
    if (o.isSkinnedMesh) o.skeleton?.dispose();

    // Attribut d'instances des InstancedMesh
    if (o.isInstancedMesh) o.dispose();

    // Shadow map des lumières
    if (o.isLight) o.shadow?.dispose();
  });
}

/**
 * Dispose proprement une scène Three.js
 */
export function disposeScene(scene: THREE.Scene | null) {
  if (!scene) return;

  disposeObject(scene);

  // background / environment peuvent être des textures (ou une simple Color pour background)
  const background = scene.background as THREE.Texture | THREE.Color | null;
  if (background && (background as THREE.Texture).isTexture) (background as THREE.Texture).dispose();
  scene.environment?.dispose();

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
 * Compter les meshes d'une scène (≠ draw calls réels : voir renderer.info.render.calls)
 */
export function countMeshes(scene: THREE.Scene): number {
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
  const meshes = countMeshes(scene);
  const info = renderer.info;

  console.group('📊 Scene Stats');
  console.log(`Vertices: ${vertices.toLocaleString()}`);
  console.log(`Meshes: ${meshes}`);
  console.log(`Draw calls: ${info.render.calls}`);
  console.log(`Triangles: ${info.render.triangles.toLocaleString()}`);
  console.log(`Textures: ${info.memory.textures}`);
  console.log(`Geometries: ${info.memory.geometries}`);
  console.groupEnd();
}
