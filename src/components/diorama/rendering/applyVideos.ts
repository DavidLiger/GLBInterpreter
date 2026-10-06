import * as THREE from "three";
import type { DioramaVideo } from "@/types/diorama";

export function applyVideoTextures(
  sceneOrGroup: THREE.Object3D,
  emptyRefs: Record<string, THREE.Object3D>,
  videos?: DioramaVideo[],
  videoElementsRef?: { current: HTMLVideoElement[] },
  videoTexturesRef?: { current: THREE.VideoTexture[] }
) {
  if (!videos) return;

  videos.forEach(({ name, src, type, materialIndex, loop = true, muted = true, autoplay = true }) => {

    if (type === 'spritesheet') {
      console.log(`⏭️ Spritesheet ignorée par applyVideoTextures: ${name}`);
      return;
    }

    const obj = emptyRefs[name];
    if (!obj) {
      console.warn(`❌ Mesh introuvable pour vidéo: ${name}`);
      return;
    }
    if (!(obj as THREE.Mesh).isMesh) {
      console.warn(`❌ L'objet "${name}" n'est pas un mesh, vidéo ignorée`);
      return;
    }

    const mesh = obj as THREE.Mesh;
    const video = document.createElement("video");
    video.src = src;
    video.crossOrigin = "anonymous";
    video.loop = loop;
    video.muted = muted;
    video.playsInline = true;

    if (videoElementsRef) {
      videoElementsRef.current.push(video); // ✅ Tracker
    }

    video.addEventListener("loadeddata", () => {
      // Vidéo arrêtée entre-temps (démontage, changement de scène) : ne rien créer
      if (videoElementsRef && !videoElementsRef.current.includes(video)) return;

      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      videoTexturesRef?.current.push(texture); // ✅ Tracker pour le dispose

      // Les matériaux glTF sont partagés entre meshes : on pose la texture sur un clone
      const withVideoMap = (mat: THREE.Material): THREE.Material => {
        if (!("map" in mat)) return mat;
        const clone = mat.clone() as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
        clone.map = texture;
        clone.needsUpdate = true;
        return clone;
      };

      if (Array.isArray(mesh.material)) {
        const materials = [...mesh.material];
        if (typeof materialIndex === "number") {
          if (materials[materialIndex]) materials[materialIndex] = withVideoMap(materials[materialIndex]);
        } else {
          materials.forEach((mat, i) => { materials[i] = withVideoMap(mat); });
        }
        mesh.material = materials;
      } else {
        mesh.material = withVideoMap(mesh.material);
      }

      if (autoplay) {
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn(`Autoplay bloqué pour la vidéo ${name}:`, err);
          });
        }
      }
    }, { once: true });

    // ✅ Simplifié : juste logger l'erreur, pas de retry
    video.addEventListener('error', (err) => {
      console.warn(`❌ Erreur chargement vidéo ${name} (${src}):`, err);
    }, { once: true });

    video.load();
  });
}
