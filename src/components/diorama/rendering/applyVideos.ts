import * as THREE from "three";
import type { DioramaVideo } from "@/types/diorama";

export function applyVideoTextures(
  root: THREE.Object3D,
  emptyRefs: Record<string, THREE.Object3D>,
  videos?: DioramaVideo[],
  videoElementsRef?: { current: HTMLVideoElement[] }
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

    if (videoElementsRef) {
      videoElementsRef.current.push(video); // ✅ Tracker
    }

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

    // ✅ Simplifié : juste logger l'erreur, pas de retry
    video.addEventListener('error', (err) => {
      console.warn(`❌ Erreur chargement vidéo ${name} (${src}):`, err);
    }, { once: true });

    video.load();
  });
}
