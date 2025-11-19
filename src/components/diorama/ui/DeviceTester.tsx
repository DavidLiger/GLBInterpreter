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
  const hasStartedTestRef = useRef(false);
  const [testSteps, setTestSteps] = useState<{
    gpu: 'pending' | 'running' | 'done';
    capabilities: 'pending' | 'running' | 'done';
    memory: 'pending' | 'running' | 'done';
    fps: 'pending' | 'running' | 'done';
  }>({
    gpu: 'pending',
    capabilities: 'pending',
    memory: 'pending',
    fps: 'pending',
  });

  const [gpuName, setGpuName] = useState<string>('');

  const { isRunning, progress, result, runBenchmark, cancelBenchmark } = useDeviceBenchmark(
    {
      testDuration: config.testDuration,
      minFPS: config.minFPS,
      minGPUTier: config.minGPUTier,
    },
    {
      onGpuDetectStart: () => setTestSteps(s => ({ ...s, gpu: 'running' })),
      onGpuDetectComplete: (name) => {
        setGpuName(name);
        setTestSteps(s => ({ ...s, gpu: 'done' }));
      },
      onCapabilitiesStart: () => setTestSteps(s => ({ ...s, capabilities: 'running' })),
      onCapabilitiesComplete: () => setTestSteps(s => ({ ...s, capabilities: 'done' })),
      onMemoryStart: () => setTestSteps(s => ({ ...s, memory: 'running' })),
      onMemoryComplete: () => setTestSteps(s => ({ ...s, memory: 'done' })),
      onFpsTestStart: () => setTestSteps(s => ({ ...s, fps: 'running' })),
      onFpsTestComplete: () => setTestSteps(s => ({ ...s, fps: 'done' })),
    }
  );

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

  // Modifiez le useEffect de lancement :
  useEffect(() => {
    if (sceneReady && phase === 'testing' && !isRunning && !hasStartedTestRef.current && rendererRef.current && sceneRef.current && cameraRef.current) {
      console.log('🎬 Lancement du benchmark...');
      hasStartedTestRef.current = true; // ✅ Marquer comme lancé
      runBenchmark(rendererRef.current, sceneRef.current, cameraRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneReady, phase, isRunning]);

  // Reset le flag quand on change de phase
  useEffect(() => {
    if (phase === 'intro') {
      hasStartedTestRef.current = false;
    }
  }, [phase]);

  // Passer aux résultats
  useEffect(() => {
    if (result && phase === 'testing' && !isRunning) { // ✅ Ajouter !isRunning
      console.log('✅ Résultats disponibles, affichage dans 500ms...');
      setTimeout(() => setPhase('results'), 500);
    }
  }, [result, phase, isRunning]); // ✅ Ajouter isRunning

    return (
      <div className="fixed inset-0 bg-black z-[10000] overflow-y-auto">
        {/* ✅ Container seulement visible en phase testing ET avec pointer-events: none */}
        <div 
        ref={containerRef} 
        className="absolute inset-0"
        style={{ 
            pointerEvents: 'none', // ✅ Ne bloque pas les clics
            visibility: phase === 'testing' ? 'visible' : 'hidden', // ✅ Caché en intro/results
        }}
        />
        
        {/* ✅ Conteneur scrollable pour le contenu */}
      <div className="min-h-screen w-full flex items-center justify-center py-4 sm:py-8 px-4">
      <AnimatePresence mode="wait">
        {/* Intro */}
        {phase === 'intro' && (
            <motion.div
              key="intro"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-md w-full text-center relative z-10"
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

        {/* Testing - Checklist */}
        {phase === 'testing' && (
          <motion.div
            key="testing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="max-w-md w-full relative z-10"
          >
            <div className="text-6xl mb-6 text-center animate-pulse">⚡</div>
            <h2 className="text-2xl font-bold text-white mb-6 text-center">
              {t.deviceTester?.testing || "Test en cours..."}
            </h2>
            
            {/* GPU Name Display */}
            {gpuName && (
              <div className="bg-gray-800 rounded-lg p-3 mb-6 border border-gray-700">
                <p className="text-xs text-gray-400 mb-1">Carte graphique détectée</p>
                <p className="text-white text-sm truncate">{gpuName}</p>
              </div>
            )}
            
            {/* Checklist */}
            <div className="space-y-3 mb-6">
              {/* Test GPU */}
              <div className="flex items-center gap-3 bg-gray-800 rounded-lg p-4">
                <div className="flex-shrink-0">
                  {testSteps.gpu === 'pending' && (
                    <div className="w-6 h-6 rounded-full border-2 border-gray-600" />
                  )}
                  {testSteps.gpu === 'running' && (
                    <div className="w-6 h-6 rounded-full border-2 border-blue-500 animate-spin border-t-transparent" />
                  )}
                  {testSteps.gpu === 'done' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center"
                    >
                      <span className="text-white text-sm">✓</span>
                    </motion.div>
                  )}
                </div>
                <p className={`flex-1 ${testSteps.gpu === 'done' ? 'text-white' : 'text-gray-400'}`}>
                  Détection GPU
                </p>
              </div>

              {/* Test Capabilities */}
              <div className="flex items-center gap-3 bg-gray-800 rounded-lg p-4">
                <div className="flex-shrink-0">
                  {testSteps.capabilities === 'pending' && (
                    <div className="w-6 h-6 rounded-full border-2 border-gray-600" />
                  )}
                  {testSteps.capabilities === 'running' && (
                    <div className="w-6 h-6 rounded-full border-2 border-blue-500 animate-spin border-t-transparent" />
                  )}
                  {testSteps.capabilities === 'done' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center"
                    >
                      <span className="text-white text-sm">✓</span>
                    </motion.div>
                  )}
                </div>
                <p className={`flex-1 ${testSteps.capabilities === 'done' ? 'text-white' : 'text-gray-400'}`}>
                  Analyse capacités WebGL
                </p>
              </div>

              {/* Test Memory */}
              <div className="flex items-center gap-3 bg-gray-800 rounded-lg p-4">
                <div className="flex-shrink-0">
                  {testSteps.memory === 'pending' && (
                    <div className="w-6 h-6 rounded-full border-2 border-gray-600" />
                  )}
                  {testSteps.memory === 'running' && (
                    <div className="w-6 h-6 rounded-full border-2 border-blue-500 animate-spin border-t-transparent" />
                  )}
                  {testSteps.memory === 'done' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center"
                    >
                      <span className="text-white text-sm">✓</span>
                    </motion.div>
                  )}
                </div>
                <p className={`flex-1 ${testSteps.memory === 'done' ? 'text-white' : 'text-gray-400'}`}>
                  Vérification mémoire
                </p>
              </div>

              {/* Test FPS */}
              <div className="flex items-center gap-3 bg-gray-800 rounded-lg p-4">
                <div className="flex-shrink-0">
                  {testSteps.fps === 'pending' && (
                    <div className="w-6 h-6 rounded-full border-2 border-gray-600" />
                  )}
                  {testSteps.fps === 'running' && (
                    <div className="w-6 h-6 rounded-full border-2 border-blue-500 animate-spin border-t-transparent" />
                  )}
                  {testSteps.fps === 'done' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center"
                    >
                      <span className="text-white text-sm">✓</span>
                    </motion.div>
                  )}
                </div>
                <div className="flex-1">
                  <p className={`${testSteps.fps === 'done' ? 'text-white' : 'text-gray-400'}`}>
                    Test de performance 3D
                  </p>
                  {testSteps.fps === 'running' && (
                    <div className="mt-2">
                      <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-600"
                          style={{ width: `${progress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{progress.toFixed(0)}%</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {testSteps.fps === 'done' && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center text-green-400 text-sm"
              >
                ✓ Analyse terminée, préparation des résultats...
              </motion.p>
            )}
          </motion.div>
        )}

        {/* Results */}
        {phase === 'results' && result && (
          <>
            {console.log('🎯 Rendering results phase, result:', result)}
            {result ? (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-2xl w-full bg-gray-900 rounded-2xl p-4 sm:p-8 border border-gray-700 relative z-10"
              >
                <div className="text-center mb-4 sm:mb-6">
                  <div className="text-4xl sm:text-6xl mb-2 sm:mb-4">
                    {result.passed ? '✅' : '⚠️'}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
                    {result.passed 
                      ? (t.deviceTester?.resultPassed || "Appareil compatible !")
                      : (t.deviceTester?.resultFailed || "Performances limitées")}
                  </h2>
                </div>

                {/* Stats - Grid responsive */}
                <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-4 sm:mb-6">
                  <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
                    <p className="text-gray-400 text-xs sm:text-sm mb-1">FPS Moyen</p>
                    <p className={`text-xl sm:text-2xl font-bold ${result.fps.average >= config.minFPS ? 'text-green-400' : 'text-red-400'}`}>
                      {result.fps.average.toFixed(1)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Min: {config.minFPS}</p>
                  </div>
                  
                  <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
                    <p className="text-gray-400 text-xs sm:text-sm mb-1">Puissance GPU</p>
                    <p className={`text-xl sm:text-2xl font-bold ${result.gpuTier >= config.minGPUTier ? 'text-green-400' : 'text-red-400'}`}>
                      {result.gpuTier}/3
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {result.gpuTier === 1 && "Faible"}
                      {result.gpuTier === 2 && "Moyen"}
                      {result.gpuTier === 3 && "Élevé"}
                    </p>
                  </div>
                  
                  <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
                    <p className="text-gray-400 text-xs sm:text-sm mb-1">FPS Min (p5)</p>
                    <p className="text-lg sm:text-xl font-bold text-gray-300">
                      {result.fps.min.toFixed(1)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">5% le plus bas</p>
                  </div>
                  
                  <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
                    <p className="text-gray-400 text-xs sm:text-sm mb-1">Mémoire</p>
                    <p className="text-lg sm:text-xl font-bold text-gray-300">
                      {result.memory ? `${result.memory} GB` : 'N/A'}
                    </p>
                  </div>
                </div>

                {/* GPU Name - Responsive */}
                <div className="bg-gray-800 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
                  <p className="text-gray-400 text-xs sm:text-sm mb-1">Carte graphique</p>
                  <p className="text-white text-xs sm:text-sm break-words">{result.gpuName}</p>
                </div>

                {/* Warnings/Errors - Responsive */}
                {result.errors.length > 0 && (
                  <div className="bg-red-900/30 border border-red-500 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
                    <p className="text-red-300 font-semibold mb-2 text-sm sm:text-base">❌ Problèmes détectés :</p>
                    {result.errors.map((error, i) => (
                      <p key={i} className="text-red-200 text-xs sm:text-sm">• {error}</p>
                    ))}
                  </div>
                )}

                {result.warnings.length > 0 && (
                  <div className="bg-yellow-900/30 border border-yellow-500 rounded-lg p-3 sm:p-4 mb-4 sm:mb-6">
                    <p className="text-yellow-300 font-semibold mb-2 text-sm sm:text-base">⚠️ Avertissements :</p>
                    {result.warnings.map((warning, i) => (
                      <p key={i} className="text-yellow-200 text-xs sm:text-sm">• {warning}</p>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 sm:gap-4">
                  <button
                    onClick={() => {
                      console.log('🔄 Refaire le test');
                      setPhase('intro');
                      // Reset tous les états
                      setSceneReady(false);
                      setTestSteps({
                        gpu: 'pending',
                        capabilities: 'pending',
                        memory: 'pending',
                        fps: 'pending',
                      });
                      setGpuName('');
                      hasStartedTestRef.current = false;
                    }}
                    className="flex-1 px-4 sm:px-6 py-2 sm:py-3 bg-gray-700 hover:bg-gray-600 text-white text-sm sm:text-base font-bold rounded-full transition"
                  >
                    🔄 Refaire le test
                  </button>
                  
                  <button
                    onClick={() => {
                      console.log('✅ Clic continuer, passed:', result.passed);
                      onComplete(result.passed);
                    }}
                    className="flex-1 px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white text-sm sm:text-base font-bold rounded-full transition"
                  >
                    {result.passed 
                      ? (t.deviceTester?.continue || "Continuer")
                      : (t.deviceTester?.continueAnyway || "Continuer quand même")}
                  </button>
                </div>

                {!result.passed && (
                  <p className="text-center text-gray-400 text-xs sm:text-sm mt-3 sm:mt-4">
                    {t.deviceTester?.warningMessage || "L'expérience pourrait être dégradée sur cet appareil."}
                  </p>
                )}
              </motion.div>
            ) : (
              <div className="text-white">Chargement résultats...</div>
            )}
          </>
          
        )}
        </AnimatePresence>
        </div>
    </div>
    );
}