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

interface BenchmarkCallbacks {
  onGpuDetectStart?: () => void;
  onGpuDetectComplete?: (name: string) => void;
  onCapabilitiesStart?: () => void;
  onCapabilitiesComplete?: () => void;
  onMemoryStart?: () => void;
  onMemoryComplete?: () => void;
  onFpsTestStart?: () => void;
  onFpsTestComplete?: () => void;
}

interface BenchmarkConfig {
  testDuration: number;
  minFPS: number;
  minGPUTier: number;
}

export function useDeviceBenchmark(config: BenchmarkConfig, callbacks?: BenchmarkCallbacks) {
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
      console.log('🎬 Init FPS test, durée:', config.testDuration, 'ms');
      fpsDataRef.current = [];
      testStartTimeRef.current = performance.now();
      let lastTime = performance.now();
      let frameCount = 0;
      const warmupFrames = 60; // ✅ Ignorer les 60 premières frames (1 seconde à 60fps)
      
      const testLoop = () => {
        const now = performance.now();
        const delta = now - lastTime;
        const fps = 1000 / delta;
        
        fpsDataRef.current.push(fps);
        frameCount++;

        // ✅ Ne collecter les FPS qu'après le warm-up
        if (frameCount > warmupFrames) {
          // ✅ Filtrer les valeurs aberrantes (< 10 fps ou > 200 fps)
          if (fps >= 10 && fps <= 200) {
            fpsDataRef.current.push(fps);
          }
        }

        lastTime = now;
        
        // Rendu
        renderer.render(scene, camera);
        
        // Progress
        const elapsed = now - testStartTimeRef.current;
        const progressPercent = Math.min((elapsed / config.testDuration) * 100, 100);
        setProgress(progressPercent);

        // Log tous les 100 frames (après warmup)
        if (frameCount > warmupFrames && (frameCount - warmupFrames) % 100 === 0) {
          const currentAvg = fpsDataRef.current.reduce((a, b) => a + b, 0) / fpsDataRef.current.length;
          console.log(`⚡ Frame ${frameCount}, elapsed: ${elapsed.toFixed(0)}ms, FPS moyen: ${currentAvg.toFixed(1)}`);
        }
        
        if (elapsed < config.testDuration) {
          rafRef.current = requestAnimationFrame(testLoop);
        } else {
          console.log(`✅ Test FPS terminé, ${frameCount} frames en ${elapsed.toFixed(0)}ms`);
          resolve();
        }
      };
      
      console.log('🎬 Démarrage loop RAF...');
      rafRef.current = requestAnimationFrame(testLoop);
    });
  }, [config.testDuration]);

  // Lancer le benchmark
  const runBenchmark = useCallback(async (
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) => {
      // ✅ Guard contre double appel
      if (isRunning) {
        console.warn('⚠️ Benchmark déjà en cours');
        return;
      }

    console.log('🎬 Démarrage benchmark...');
    setIsRunning(true);
    setProgress(0);
    
    try {
      // 1. Détection GPU
      callbacks?.onGpuDetectStart?.();
      console.log('🔍 Détection GPU...');
      await new Promise(resolve => setTimeout(resolve, 500)); // ✅ Pause pour visibilité
      const gpu = await detectGPUTier();
      console.log('✅ GPU détecté:', gpu);
      callbacks?.onGpuDetectComplete?.(gpu.name);
      
      // 2. Capabilities
      callbacks?.onCapabilitiesStart?.();
      console.log('🔍 Détection capabilities...');
      await new Promise(resolve => setTimeout(resolve, 500)); // ✅ Pause
      const capabilities = getWebGLCapabilities();
      console.log('✅ Capabilities:', capabilities);
      callbacks?.onCapabilitiesComplete?.();
      
      // 3. Mémoire
      callbacks?.onMemoryStart?.();
      const memory = (navigator as any).deviceMemory || null;
      console.log('💾 Mémoire:', memory);
      await new Promise(resolve => setTimeout(resolve, 300)); // ✅ Pause
      callbacks?.onMemoryComplete?.();
      
      // 4. Résolution
      const resolution = {
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: window.devicePixelRatio,
      };
      console.log('📐 Résolution:', resolution);
      
      // 5. Test FPS
      callbacks?.onFpsTestStart?.();
      console.log('⚡ Démarrage test FPS...');
      await runFPSTest(renderer, scene, camera);
      console.log('✅ Test FPS terminé, FPS collectés:', fpsDataRef.current.length);
      callbacks?.onFpsTestComplete?.();

      console.log('✅ Test FPS terminé, FPS collectés:', fpsDataRef.current.length);

      // ✅ Vérifier qu'on a bien des données
      if (fpsDataRef.current.length === 0) {
        console.error('❌ Aucune donnée FPS collectée !');
        throw new Error('Test FPS échoué');
      }

      // ✅ Trier pour calcul des percentiles
      const sortedFPS = [...fpsDataRef.current].sort((a, b) => a - b);

      // Calcul statistiques robustes
      const avgFPS = fpsDataRef.current.reduce((a, b) => a + b, 0) / fpsDataRef.current.length;

      // ✅ Percentiles (plus robuste que min/max)
      const p1 = sortedFPS[Math.floor(sortedFPS.length * 0.01)];  // 1er percentile
      const p5 = sortedFPS[Math.floor(sortedFPS.length * 0.05)];  // 5e percentile
      const p50 = sortedFPS[Math.floor(sortedFPS.length * 0.50)]; // Médiane
      const p95 = sortedFPS[Math.floor(sortedFPS.length * 0.95)]; // 95e percentile
      const p99 = sortedFPS[Math.floor(sortedFPS.length * 0.99)]; // 99e percentile

      const minFPS = Math.min(...fpsDataRef.current);
      const maxFPS = Math.max(...fpsDataRef.current);

      console.log('📊 FPS moyen:', avgFPS.toFixed(1));
      console.log('📊 FPS min absolu:', minFPS.toFixed(1));
      console.log('📊 FPS 1er percentile:', p1.toFixed(1));
      console.log('📊 FPS 5e percentile:', p5.toFixed(1));
      console.log('📊 FPS médiane:', p50.toFixed(1));
      
      // Analyse
      const warnings: string[] = [];
      const errors: string[] = [];
      let passed = true;
      
      if (avgFPS < config.minFPS) {
        errors.push(`FPS moyen trop faible: ${avgFPS.toFixed(1)} (min: ${config.minFPS})`);
        passed = false;
      }

      // ✅ Warning seulement si le 5e percentile est < 80% du seuil
      // (ignore les 5% de frames les plus lentes, souvent dues à des événements externes)
      if (p5 < config.minFPS * 0.8) {
        warnings.push(`FPS instables: 5% des frames sous ${p5.toFixed(1)} FPS`);
      }

      // ✅ Warning si écart entre p5 et p95 est > 20 FPS (instabilité)
      if (p95 - p5 > 20) {
        warnings.push(`Performances variables (${p5.toFixed(1)} - ${p95.toFixed(1)} FPS)`);
      }

      if (gpu.tier < config.minGPUTier) {
        errors.push(`GPU trop faible: Tier ${gpu.tier} (min: ${config.minGPUTier})`);
        passed = false;
      }

      if (memory && memory < 2) {
        warnings.push(`Mémoire RAM faible: ${memory} GB`);
      }

      if (resolution.pixelRatio > 2 && avgFPS < config.minFPS * 1.2) {
        warnings.push(`Résolution haute (${resolution.pixelRatio.toFixed(1)}x) peut impacter les performances`);
      }
      
      const result: BenchmarkResult = {
        fps: {
          average: avgFPS,
          min: p5, // ✅ Utiliser p5 au lieu du min absolu
          max: p95, // ✅ Utiliser p95 au lieu du max absolu
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
      
    } catch (error) {
      console.error('❌ Benchmark error:', error);
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
  }, [config, detectGPUTier, getWebGLCapabilities, runFPSTest, callbacks]);

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