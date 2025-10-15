// rendering/setupPostProcessing.ts
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/Addons.js"; 
import { RenderPass } from "three/examples/jsm/Addons.js"; 
import { UnrealBloomPass } from "three/examples/jsm/Addons.js"; 
import { SSAOPass } from "three/examples/jsm/Addons.js"; 
import { BokehPass } from "three/examples/jsm/Addons.js"; 
import { OutputPass } from "three/examples/jsm/Addons.js"; 

export interface PostProcessingConfig {
  bloom?: {
    enabled: boolean;
    strength?: number;
    radius?: number;
    threshold?: number;
  };
  ssao?: {
    enabled: boolean;
    kernelRadius?: number;
    minDistance?: number;
    maxDistance?: number;
  };
  dof?: {
    enabled: boolean;
    focus?: number;
    aperture?: number;
    maxblur?: number;
  };
  toneMapping?: {
    enabled: boolean;
    exposure?: number;
    type?: THREE.ToneMapping;
  };
}

export function setupPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  config?: PostProcessingConfig
) {
  // Configuration par défaut
  const defaultConfig: PostProcessingConfig = {
    bloom: {
      enabled: true,
      strength: 0.8,
      radius: 0.5,
      threshold: 0.85,
    },
    ssao: {
      enabled: true,
      kernelRadius: 8,
      minDistance: 0.005,
      maxDistance: 0.1,
    },
    dof: {
      enabled: false, // Désactivé par défaut, sera activé dynamiquement
      focus: 5.0,
      aperture: 0.025,
      maxblur: 0.01,
    },
    toneMapping: {
      enabled: true,
      exposure: 1.2,
      type: THREE.ACESFilmicToneMapping,
    },
  };

  const finalConfig = { ...defaultConfig, ...config };

  // Activer le tone mapping sur le renderer
  if (finalConfig.toneMapping?.enabled) {
    renderer.toneMapping = finalConfig.toneMapping.type || THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = finalConfig.toneMapping.exposure || 1.2;
  }

  // Créer le composer
  const composer = new EffectComposer(renderer);
  composer.setSize(window.innerWidth, window.innerHeight);

  // Pass de rendu de base
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // SSAO Pass
  let ssaoPass: SSAOPass | null = null;
  if (finalConfig.ssao?.enabled) {
    ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
    ssaoPass.kernelRadius = finalConfig.ssao.kernelRadius || 8;
    ssaoPass.minDistance = finalConfig.ssao.minDistance || 0.005;
    ssaoPass.maxDistance = finalConfig.ssao.maxDistance || 0.1;
    composer.addPass(ssaoPass);
  }

  // Bloom Pass
  let bloomPass: UnrealBloomPass | null = null;
  if (finalConfig.bloom?.enabled) {
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      finalConfig.bloom.strength || 0.8,
      finalConfig.bloom.radius || 0.5,
      finalConfig.bloom.threshold || 0.85
    );
    composer.addPass(bloomPass);
  }

  // Depth of Field (Bokeh) Pass
  let bokehPass: BokehPass | null = null;
    if (finalConfig.dof?.enabled) {
    bokehPass = new BokehPass(scene, camera, {
        focus: finalConfig.dof.focus || 5.0,
        aperture: finalConfig.dof.aperture || 0.025,
        maxblur: finalConfig.dof.maxblur || 0.01,
        width: window.innerWidth,
        height: window.innerHeight,
    } as any); // 👈 Cast pour éviter l'erreur TS
    composer.addPass(bokehPass);
    }

  // Output Pass (obligatoire pour la correction gamma)
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  return {
    composer,
    passes: {
      render: renderPass,
      ssao: ssaoPass,
      bloom: bloomPass,
      bokeh: bokehPass,
      output: outputPass,
    },
    updateSize: (width: number, height: number) => {
      composer.setSize(width, height);
      if (ssaoPass) {
        ssaoPass.setSize(width, height);
      }
      if (bloomPass) {
        bloomPass.setSize(width, height);
      }
      if (bokehPass) {
        bokehPass.setSize(width, height);
      }
    },
    updateDOF: (focus: number, aperture?: number, maxblur?: number) => {
        if (bokehPass) {
            const uniforms = bokehPass.uniforms as any; // 👈 Cast ici
            uniforms["focus"].value = focus;
            if (aperture !== undefined) uniforms["aperture"].value = aperture;
            if (maxblur !== undefined) uniforms["maxblur"].value = maxblur;
        }
    },
    enableDOF: (enabled: boolean) => {
      if (bokehPass) {
        bokehPass.enabled = enabled;
      }
    },
    updateBloom: (strength?: number, radius?: number, threshold?: number) => {
      if (bloomPass) {
        if (strength !== undefined) bloomPass.strength = strength;
        if (radius !== undefined) bloomPass.radius = radius;
        if (threshold !== undefined) bloomPass.threshold = threshold;
      }
    },
    updateSSAO: (kernelRadius?: number, minDistance?: number, maxDistance?: number) => {
      if (ssaoPass) {
        if (kernelRadius !== undefined) ssaoPass.kernelRadius = kernelRadius;
        if (minDistance !== undefined) ssaoPass.minDistance = minDistance;
        if (maxDistance !== undefined) ssaoPass.maxDistance = maxDistance;
      }
    },
  };
}

// Helper pour marquer les objets qui doivent briller (bloom)
export function markForBloom(object: THREE.Object3D, shouldBloom: boolean = true) {
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      (child as any).layers.enable(shouldBloom ? 1 : 0);
    }
  });
}

// Helper pour configurer les matériaux émissifs (pour le bloom)
export function setupEmissiveMaterials(
  scene: THREE.Scene,
  emissiveObjects: Array<{ name: string; color: number; intensity: number }>
) {
  emissiveObjects.forEach(({ name, color, intensity }) => {
    const obj = scene.getObjectByName(name);
    if (obj && (obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      if (mesh.material) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissive = new THREE.Color(color);
        mat.emissiveIntensity = intensity;
      }
      markForBloom(obj, true);
    }
  });
}