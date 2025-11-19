import { useState, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';

export interface BenchmarkResult {
  fps: {
    average: number;
    min: number;
    max: number;
  };
  gpuTier: number;
  gpuName: string;
  memory: number | null; // GB
  webglCapabilities: {
    maxTextureSize: number;
    maxRenderbufferSize: number;
    maxViewportDims: [number, number];
    extensions: string[];
  };
  resolution: {
    width: number;
    height: number;
    pixelRatio: number;
  };
  passed: boolean;
  warnings: string[];
  errors: string[];
}

interface BenchmarkConfig {
  testDuration: number;
  minFPS: number;
  minGPUTier: number;
}

export function useDeviceBenchmark(config: BenchmarkConfig) {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  
  const fpsDataRef = useRef<number[]>([]);
  const testStartTimeRef = useRef<number>(0);
  const rafRef = useRef<number | undefined>(undefined); 

  // Détection GPU Tier (simplifié, vous pouvez utiliser 'detect-gpu' npm package)
    const detectGPUTier = useCallback(async (): Promise<{ tier: number; name: string }> => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
        
        if (!gl) return { tier: 0, name: 'Unknown' };
        
        // ✅ Cast explicite vers WebGLRenderingContext
        const glContext = gl as WebGLRenderingContext | WebGL2RenderingContext;
        
        const debugInfo = glContext.getExtension('WEBGL_debug_renderer_info');
        const renderer = debugInfo 
            ? glContext.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) 
            : 'Unknown GPU';
    
    // Heuristique simple (à améliorer avec detect-gpu)
    let tier = 2; // Par défaut
    const rendererLower = renderer.toLowerCase();
    
    if (rendererLower.includes('adreno') && parseInt(rendererLower.match(/\d+/)?.[0] || '0') < 500) {
      tier = 1;
    } else if (rendererLower.includes('mali') && parseInt(rendererLower.match(/\d+/)?.[0] || '0') < 76) {
      tier = 1;
    } else if (rendererLower.includes('intel') && !rendererLower.includes('iris')) {
      tier = 1;
    } else if (rendererLower.includes('nvidia') || rendererLower.includes('rtx') || rendererLower.includes('geforce')) {
      tier = 3;
    }
    
    return { tier, name: renderer };
  }, []);

  // Obtenir WebGL capabilities
    const getWebGLCapabilities = useCallback(() => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        
        if (!gl) {
            return {
            maxTextureSize: 0,
            maxRenderbufferSize: 0,
            maxViewportDims: [0, 0] as [number, number],
            extensions: [],
            };
        }
        
        // ✅ Cast explicite
        const glContext = gl as WebGLRenderingContext | WebGL2RenderingContext;
        
        return {
            maxTextureSize: glContext.getParameter(glContext.MAX_TEXTURE_SIZE),
            maxRenderbufferSize: glContext.getParameter(glContext.MAX_RENDERBUFFER_SIZE),
            maxViewportDims: glContext.getParameter(glContext.MAX_VIEWPORT_DIMS) as [number, number],
            extensions: glContext.getSupportedExtensions() || [],
        };
    }, []);

  // Test FPS avec une scène simple
  const runFPSTest = useCallback((renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => {
    return new Promise<void>((resolve) => {
      fpsDataRef.current = [];
      testStartTimeRef.current = performance.now();
      let lastTime = performance.now();
      
      const testLoop = () => {
        const now = performance.now();
        const delta = now - lastTime;
        const fps = 1000 / delta;
        
        fpsDataRef.current.push(fps);
        lastTime = now;
        
        // Rendu
        renderer.render(scene, camera);
        
        // Progress
        const elapsed = now - testStartTimeRef.current;
        const progressPercent = Math.min((elapsed / config.testDuration) * 100, 100);
        setProgress(progressPercent);
        
        if (elapsed < config.testDuration) {
          rafRef.current = requestAnimationFrame(testLoop);
        } else {
          resolve();
        }
      };
      
      rafRef.current = requestAnimationFrame(testLoop);
    });
  }, [config.testDuration]);

  // Lancer le benchmark
  const runBenchmark = useCallback(async (
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) => {
    console.log('🎬 Démarrage benchmark...');
    setIsRunning(true);
    setProgress(0);
    
    try {
      // 1. Détection GPU
        console.log('🔍 Détection GPU...');
        const gpu = await detectGPUTier();
        console.log('✅ GPU détecté:', gpu);
      
      // 2. Capabilities
        console.log('🔍 Détection capabilities...');
        const capabilities = getWebGLCapabilities();
        console.log('✅ Capabilities:', capabilities);
      
      // 3. Mémoire
      const memory = (navigator as any).deviceMemory || null;
      console.log('💾 Mémoire:', memory);

      // 4. Résolution
      const resolution = {
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: window.devicePixelRatio,
      };
      console.log('📐 Résolution:', resolution);
      
      // 5. Test FPS
      console.log('⚡ Démarrage test FPS...');
        await runFPSTest(renderer, scene, camera);
        console.log('✅ Test FPS terminé');
      
      // Calcul résultats
      const avgFPS = fpsDataRef.current.reduce((a, b) => a + b, 0) / fpsDataRef.current.length;
      const minFPS = Math.min(...fpsDataRef.current);
      const maxFPS = Math.max(...fpsDataRef.current);
      
      // Analyse
      const warnings: string[] = [];
      const errors: string[] = [];
      let passed = true;
      
      if (avgFPS < config.minFPS) {
        errors.push(`FPS moyen trop faible: ${avgFPS.toFixed(1)} (min: ${config.minFPS})`);
        passed = false;
      }
      
      if (minFPS < config.minFPS * 0.7) {
        warnings.push(`FPS min très bas: ${minFPS.toFixed(1)}`);
      }
      
      if (gpu.tier < config.minGPUTier) {
        errors.push(`GPU trop faible: Tier ${gpu.tier} (min: ${config.minGPUTier})`);
        passed = false;
      }
      
      if (memory && memory < 2) {
        warnings.push(`Mémoire RAM faible: ${memory} GB`);
      }
      
      if (resolution.pixelRatio > 2 && avgFPS < config.minFPS * 1.2) {
        warnings.push(`Résolution haute + FPS limite`);
      }
      
      const result: BenchmarkResult = {
        fps: {
          average: avgFPS,
          min: minFPS,
          max: maxFPS,
        },
        gpuTier: gpu.tier,
        gpuName: gpu.name,
        memory,
        webglCapabilities: capabilities,
        resolution,
        passed,
        warnings,
        errors,
      };
      
      setResult(result);
      
      // Sauvegarder dans localStorage
      if (passed) {
        localStorage.setItem('device-benchmark-passed', JSON.stringify({
          date: new Date().toISOString(),
          result,
        }));
      }
      
    } catch (error) {
      console.error('Benchmark error:', error);
      setResult({
        fps: { average: 0, min: 0, max: 0 },
        gpuTier: 0,
        gpuName: 'Error',
        memory: null,
        webglCapabilities: getWebGLCapabilities(),
        resolution: {
          width: window.innerWidth,
          height: window.innerHeight,
          pixelRatio: window.devicePixelRatio,
        },
        passed: false,
        warnings: [],
        errors: ['Erreur pendant le test'],
      });
    } finally {
      setIsRunning(false);
    }
  }, [config, detectGPUTier, getWebGLCapabilities, runFPSTest]);

  const cancelBenchmark = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    setIsRunning(false);
  }, []);

  return {
    isRunning,
    progress,
    result,
    runBenchmark,
    cancelBenchmark,
  };
}