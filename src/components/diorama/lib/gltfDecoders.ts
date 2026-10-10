// Décodeurs des GLB optimisés par le pipeline (Î7, R-33) : Meshopt (géométrie, animations) et KTX2 (textures BasisU).
// Tout est auto-hébergé, rien n'est chargé depuis un CDN (exigence 0) :
// - MeshoptDecoder : WebAssembly embarqué dans le module JS de three, donc dans le bundle ;
// - transcodeur Basis : `decoders/basis/basis_transcoder.{js,wasm}`, copiés depuis three par scripts/copy-decoders.ts
//   (predev / prebuild), chemin relatif à la racine du livre (page unique, D-8.4), chargés seulement si un GLB contient
//   une texture KTX2.
import type * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { getAssetUrl } from "./assets";

/** Dossier du transcodeur Basis, relatif à la racine du livre (avec `/` final, exigé par KTX2Loader). */
export const BASIS_TRANSCODER_PATH = "decoders/basis/";

export interface GLTFLoaderWithDecoders {
  loader: GLTFLoader;
  /** Libère le KTX2Loader (termine ses workers). Idempotent. */
  dispose: () => void;
}

/**
 * GLTFLoader équipé des décodeurs. `detectSupport(renderer)` choisit le format GPU cible (ASTC/ETC2/BC7/S3TC… selon
 * l'appareil). Un KTX2Loader par chargement de scène, libéré au nettoyage de la scène.
 */
export function createGLTFLoader(renderer: THREE.WebGLRenderer): GLTFLoaderWithDecoders {
  const ktx2 = new KTX2Loader().setTranscoderPath(getAssetUrl(BASIS_TRANSCODER_PATH)).detectSupport(renderer);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(ktx2);
  let disposed = false;
  return {
    loader,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      ktx2.dispose();
    },
  };
}
