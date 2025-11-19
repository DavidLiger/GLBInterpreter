"use client";

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { useDeviceBenchmark, BenchmarkResult } from '../hooks/useDeviceBenchmark';
import { useTranslation } from '@/contexts/TranslationContext';

interface DeviceTesterProps {
  glbUrl: string;
  config: {
    testDuration: number;
    minFPS: number;
    minGPUTier: number;
    skipIfPreviouslyTested?: boolean;
  };
  onComplete: (passed: boolean) => void;
  onSkip: () => void;
}

export default function DeviceTester({ glbUrl, config, onComplete, onSkip }: DeviceTesterProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'intro' | 'testing' | 'results'>('intro');
  const [sceneReady, setSceneReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const { isRunning, progress, result, runBenchmark, cancelBenchmark } = useDeviceBenchmark({
    testDuration: config.testDuration,
    minFPS: config.minFPS,
    minGPUTier: config.minGPUTier,
  });

  // Dans DeviceTester.tsx, ajoutez au début du composant :
    useEffect(() => {
    console.log('🔍 DeviceTester mounted, phase:', phase);
    return () => console.log('🔍 DeviceTester unmounted');
    }, []);

    useEffect(() => {
    console.log('🔍 Phase changed:', phase);
    }, [phase]);

  // Préparer la scène de test
  useEffect(() => {
    if (!containerRef.current || phase !== 'testing') return;

    const canvas = document.createElement('canvas');
    canvas.style.display = 'none';
    containerRef.current.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2, 5);
    cameraRef.current = camera;

    // Charger le GLB
    const loader = new GLTFLoader();
    loader.load(glbUrl, (gltf) => {
    console.log('✅ GLB chargé pour benchmark');
      scene.add(gltf.scene);
      
      // Lumières simples
      const light = new THREE.DirectionalLight(0xffffff, 1);
      light.position.set(5, 10, 5);
      scene.add(light);
      scene.add(new THREE.AmbientLight(0x404040));

      console.log('✅ Scène prête pour benchmark');
      setSceneReady(true);
    },
        undefined,
        (error) => {
            console.error('❌ Erreur chargement GLB pour benchmark:', error);
    });

    return () => {
      renderer.dispose();
      canvas.remove();
    };
  }, [phase, glbUrl]);

  // Lancer le test quand prêt
  useEffect(() => {
    if (sceneReady && phase === 'testing' && !isRunning && rendererRef.current && sceneRef.current && cameraRef.current) {
      runBenchmark(rendererRef.current, sceneRef.current, cameraRef.current);
    }
  }, [sceneReady, phase, isRunning, runBenchmark]);

  // Passer aux résultats
  useEffect(() => {
    if (result && phase === 'testing') {
      setTimeout(() => setPhase('results'), 500);
    }
  }, [result, phase]);

    return (
    <div className="fixed inset-0 bg-black z-[10000] flex items-center justify-center">
        {/* ✅ Container seulement visible en phase testing ET avec pointer-events: none */}
        <div 
        ref={containerRef} 
        className="absolute inset-0"
        style={{ 
            pointerEvents: 'none', // ✅ Ne bloque pas les clics
            display: phase === 'testing' ? 'block' : 'none' // ✅ Masqué sauf en test
        }}
        />
        
        <AnimatePresence mode="wait">
        {/* Intro */}
        {phase === 'intro' && (
            <motion.div
            key="intro"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="max-w-md mx-4 text-center relative z-10" // ✅ z-10 pour être au-dessus
            >
            <div className="text-6xl mb-6">🔍</div>
            <h2 className="text-2xl font-bold text-white mb-4">
                {t.deviceTester?.title || "Test de compatibilité"}
            </h2>
            <p className="text-gray-300 mb-8">
                {t.deviceTester?.description || "Vérifions que votre appareil peut faire tourner l'application correctement. Ce test prend environ 10 secondes."}
            </p>
            <div className="flex gap-4 justify-center">
                <button
                onClick={() => {
                    console.log('🔍 Clic sur Démarrer le test');
                    setPhase('testing');
                }}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold rounded-full transition"
                >
                {t.deviceTester?.start || "Démarrer le test"}
                </button>
                <button
                onClick={() => {
                    console.log('🔍 Clic sur Passer');
                    onSkip();
                }}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-full transition"
                >
                {t.deviceTester?.skip || "Passer"}
                </button>
            </div>
            </motion.div>
        )}

        {/* Testing */}
        {phase === 'testing' && (
            <motion.div
            key="testing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="max-w-md mx-4 text-center relative z-10" // ✅ z-10
            >
            {/* ... contenu testing ... */}
            </motion.div>
        )}

        {/* Results */}
        {phase === 'results' && result && (
            <motion.div
            key="results"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-4 bg-gray-900 rounded-2xl p-8 border border-gray-700 relative z-10" // ✅ z-10
            >
            {/* ... contenu results ... */}
            </motion.div>
        )}
        </AnimatePresence>
    </div>
    );
}