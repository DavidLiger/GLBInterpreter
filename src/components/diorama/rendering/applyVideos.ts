import * as THREE from "three";
import type { DioramaVideo } from "@/types/diorama";

export function applyVideoTextures(
  root: THREE.Object3D,
  emptyRefs: Record<string, THREE.Object3D>,
  videos?: DioramaVideo[]
) {
  if (!videos) return;

  videos.forEach(({ name, src, materialIndex, loop = true, muted = true, autoplay = true }) => {
    const obj = emptyRefs[name];
    if (!obj || !(obj as THREE.Mesh).isMesh) return;

    const mesh = obj as THREE.Mesh;
    const video = document.createElement("video");
    video.src = src;
    video.crossOrigin = "anonymous";
    video.loop = loop;
    video.muted = muted;
    video.playsInline = true;

    video.addEventListener("loadeddata", () => {
      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;

      const setMap = (mat: THREE.Material) => {
        const m = mat as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
        if ("map" in m) {
          m.map = texture;
          m.needsUpdate = true;
        }
      };

      if (typeof materialIndex === "number" && Array.isArray(mesh.material)) {
        const mat = mesh.material[materialIndex];
        if (mat) setMap(mat);
      } else if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => setMap(mat));
      } else {
        setMap(mesh.material);
      }

      if (autoplay) {
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn(`Autoplay bloqué pour la vidéo ${name}:`, err);
          });
        }
      }
    });

    video.addEventListener('error', () => {
      console.warn(`Retry vidéo: ${src}`);
      // Force HTTP/2 en rechargeant sans cache
      video.src = src.split('?')[0] + '?v=' + Date.now();
      video.load();
    }, { once: true });

    video.load();
  });
}
