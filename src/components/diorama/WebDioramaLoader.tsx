"use client";

import { TranslationProvider, useTranslation } from "@/contexts/TranslationContext";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import * as THREE from "three";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import localFont from "next/font/local";
import type { DioramaConfig3D, DioramaConfig3DWithVideos } from "@/types/diorama";
import usePOIAudio from "./audio/usePOIAudio";
import SoundButton from "./audio/SoundButton";
import { usePOINavigation } from "./hooks/usePOINavigation";
import LoaderOverlay from "./ui/LoaderOverlay";
import FullscreenButton from "./ui/FullscreenButton";
import { applyVideoTextures } from "./rendering/applyVideos";
import { applyLights } from "./rendering/applyLights";
import { applyBulbs } from "./rendering/applyBulbs";
import { useOrientation } from "./hooks/useOrientation";
import { useFullscreen } from "./hooks/useFullscreen";
import { useResize } from "./hooks/useResize";
import { usePOIAnimations } from "./hooks/usePOIAnimations";
import { POIWithElements } from "@/types/diorama";
import POIPlayer from "@/components/diorama/ui/POIPlayer";
import { usePOIScenePlayer } from "@/components/diorama/hooks/usePOIScenePlayer";
import DialogueModal from "./ui/DialogueModal";
import DialogueButton from "./ui/DialogueButton";
import InfoButton from "./ui/InfoButton";
import InfoModal from "./ui/InfoModal";
import POIBreadcrumbs from "./ui/POIBreadcrumbs";
import PostProcessingControls from "./rendering/PostProcessingControls";
import { setupPostProcessing, setupEmissiveMaterials } from "./rendering/setupPostProcessing";
import { usePOIEffects } from "./hooks/usePOIEffects";
import RotateHint from "./ui/RotateHint";
import ConfigConverterTool from "./tools/ConfigConverterTool";
import QRCodeModal from "./tools/QRCodeModal";
import DownloadTooltip from "./ui/DownloadTooltip";
import { useWebGLContext } from "./hooks/useWebGLContext";
// import { useAssetPreloader } from "./hooks/useAssetPreloader";
import { disposeScene, logSceneStats } from "./utils/webglHelpers";
import BookDownloadModal from "./ui/BookDownloadModal";
import { isBookFullyCached } from "./lib/downloadManager";
import useUnifiedAudio from "./hooks/useUnifiedAudio";
import DeviceTester from "./ui/DeviceTester";
import SceneAnalyzer from "./ui/SceneAnalyzer";
import GLBOptimizer from "./ui/GLBOptimizer";
import SpritesheetGenerator from "./ui/SpritesheetGenerator";
import { applySpritesheets } from "./rendering/applySpritesheet";
import { SpritesheetAnimator } from "./rendering/SpritesheetAnimator";

const BullstandRegular = localFont({
  src: "../../../public/fonts/Bullstand-Regular.ttf",
  variable: "--font-Bullstand-Regular",
});

export default function WebDioramaLoader({ config, bookId }: { config: DioramaConfig3D; bookId: string }) {
  const [mounted, setMounted] = useState(false); // ✅ NOUVEAU

  // ✅ Attendre le mount côté client
  useEffect(() => {
    setMounted(true);
  }, []);

  // ✅ Ne rien afficher avant le mount
  if (!mounted) {
    return null;
  }

  return (
    <TranslationProvider>
      <WebDioramaLoaderWithTranslation config={config} bookId={bookId} />
    </TranslationProvider>
  );
}

// ✅ Composant INTERNE avec useTranslation
function WebDioramaLoaderWithTranslation({ config, bookId }: { config: DioramaConfig3D; bookId: string }) {
  const { t } = useTranslation(); // ✅ Maintenant c'est OK !
  const [assetsReady, setAssetsReady] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);  // ✅ NOUVEAU
  const [checkingCache, setCheckingCache] = useState(true);
  const [testKey, setTestKey] = useState(0);
  const [isPreparingAfterTest, setIsPreparingAfterTest] = useState(false);
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
  
  const [showDeviceTester, setShowDeviceTester] = useState(() => {
    return (config as any).deviceTester?.enabled || false;
  });

  const [deviceTestPassed, setDeviceTestPassed] = useState(false);

  useEffect(() => {
  // ✅ Force le test en dev avec Ctrl+Shift+T
  const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P' && process.env.NODE_ENV === 'development') {
        console.log('🔍 Force device test');
        localStorage.removeItem('device-benchmark-passed');
        setShowDeviceTester(true);
        setDeviceTestPassed(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const checkCacheStatus = async () => {
      const cached = await isBookFullyCached(bookId);
      
      if (cached) {
        console.log("✅ Assets en cache, lancement direct");
        setCheckingCache(false);
        setShowDownloadModal(false);
        setIsInitializing(true); // ✅ Afficher "Préparation..."
        
        console.log("⏳ Pause 2s pour libérer mémoire...");
        setTimeout(() => {
          console.log("✅ Mémoire libérée, lancement scène...");
          setAssetsReady(true);
          setIsInitializing(false); // ✅ Masquer APRÈS
        }, 2000);
      } else {
        console.log("📦 Assets manquants, afficher modal");
        setShowDownloadModal(true);
        setCheckingCache(false);
      }
    };
    
    checkCacheStatus();
  }, [bookId]);

  const handleRetest = () => {
    setTestKey(prev => prev + 1);
  };

  return (
    <>
      {/* ✅ Écran de vérification cache */}
      {checkingCache && (
        <div className="fixed inset-0 bg-black flex items-center justify-center z-[9999]">
          <div className="text-white text-center">
            <div className="animate-spin text-4xl mb-4">⚙️</div>
            <p>{t.bookDownload.cacheChecking}</p>
          </div>
        </div>
      )}

      {/* ✅ Device Tester EN PREMIER, bloque tout */}
      {showDeviceTester && (config as any).deviceTester && (
        <DeviceTester
          key={testKey}
          isMobileDevice={isMobileDevice}
          glbUrl={config.glb}
          config={(config as any).deviceTester}
          onRetest={handleRetest}
          onComplete={(passed) => {
            console.log('✅ Test terminé, résultat:', passed);
            setDeviceTestPassed(true);
            
            // ✅ ATTENDRE 2 secondes pour libérer WebGL
            console.log('⏳ Pause 2s pour libérer le contexte WebGL du test...');
            setTimeout(() => {
              console.log('✅ Contexte WebGL libéré, continuer');
              setShowDeviceTester(false);
            }, 2000);
          }}
          onSkip={() => {
            console.log('⏭️ Test skippé');
            setDeviceTestPassed(true);
            setShowDeviceTester(false);
          }}
        />
      )}
      {isPreparingAfterTest && (
        <div className="fixed inset-0 bg-black z-[9998] flex items-center justify-center">
          <div className="text-white text-center">
            <div className="animate-spin text-4xl mb-4">⚙️</div>
            <p className="text-xl">{t.deviceTester?.preparing || "Préparation de l'expérience..."}</p>
          </div>
        </div>
      )}
      {/* ✅ Le reste seulement si pas de device tester */}
      {!showDeviceTester && (
        <>
          {checkingCache && (
            <div className="fixed inset-0 bg-black flex items-center justify-center z-[9999]">
              {/* ... */}
            </div>
          )}

          {showDownloadModal && !assetsReady && (
            <BookDownloadModal
              bookId={bookId}
              config={config}
              onComplete={() => {
                setShowDownloadModal(false);
                setIsInitializing(true); // ✅ État intermédiaire
                
                console.log("⏳ Pause 2s pour libérer mémoire...");
                
                // ✅ Forcer garbage collection (si disponible)
                if (typeof window !== 'undefined' && (window as any).gc) {
                  (window as any).gc();
                }
                
                // ✅ Délai avant de lancer la scène 3D
                setTimeout(() => {
                  console.log("✅ Mémoire libérée, lancement scène...");
                  setAssetsReady(true);
                  // setIsInitializing(false);
                }, 2000);
              }}
              onCancel={() => setShowDownloadModal(false)}
            />
          )}

          {/* ✅ Écran de transition */}
          {isInitializing && !assetsReady && (
            <div className="fixed inset-0 bg-black flex items-center justify-center z-[9999]">
              <div className="text-white text-center">
                <div className="text-6xl mb-4 animate-pulse">🎬</div>
                <p className="text-xl">{t.reload?.preparing || "Préparation de la scène..."}</p>
                <p className="text-sm text-gray-400 mt-2">{t.reload?.optimizing || "Optimisation mémoire GPU"}</p>
              </div>
            </div>
          )}

          {!assetsReady && !showDownloadModal && !checkingCache && !isInitializing && (
            <div className="fixed inset-0 bg-black flex items-center justify-center z-[9999]">
              <div className="text-center">
                <div className="text-6xl mb-6">📦</div>
                <h2 className="text-white text-xl mb-6">
                  {t.bookDownload?.required || "Téléchargement requis"}
                </h2>
                <button
                  onClick={() => setShowDownloadModal(true)}
                  className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white text-lg font-bold rounded-full shadow-lg transition"
                >
                  📥 {t.bookDownload?.download || "Télécharger"}
                </button>
              </div>
            </div>
          )}

          {assetsReady && <WebDioramaLoaderInner config={config} bookId={bookId} />}
        </>
      )}

      
    </>
  );
}

function WebDioramaLoaderInner({
  config,
  bookId,
}: {
  config: DioramaConfig3D;
  bookId: string;
}) {
  const { t, lang } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const { isPortrait, showRotateHint } = useOrientation(5000);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const emptyRefs = useRef<Record<string, THREE.Object3D>>({});
  const animationFrameRef = useRef<number | undefined>(undefined);
  const videoElementsRef = useRef<HTMLVideoElement[]>([]);
  const { mixerRef, initMixers, playPOIAnimations, stopAllAnimations, updateMixers } =
    usePOIAnimations(emptyRefs);
  const clock = useRef(new THREE.Clock());
  const hasAutoUnmutedRef = useRef(false);
  const composerRef = useRef<ReturnType<typeof setupPostProcessing> | null>(null);
  const voluntaryCleanupRef = useRef(false);
  const wasHiddenRef = useRef(false);
  const textureLoader = useMemo(() => new THREE.TextureLoader(), []);
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

  // ✅ Hook WebGL simplifié
  const { renderer, error: webglError, isReady: webglReady } = useWebGLContext(containerRef, {
    isMobile: isMobileDevice,
    onContextLost: () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    },
  });

  // ✅ Hook préchargement assets
  // const { loadAssets, progress: assetProgress, loadedCount, totalCount, currentAsset } = useAssetPreloader();

  const { currentPOI, goToPOI, findParentPOI, moveCameraToPOI, moveCameraDuringAnimation, setCurrentPOI, findPOIRecursively } =
    usePOINavigation(
      config, 
      cameraRef, 
      controlsRef, 
      emptyRefs,
    () => {
      // ✅ NOUVEAU : Callback appelé AVANT chaque changement de POI
      if (isPlaying) {
        console.log("🛑 Changement POI détecté, stop scène");
        prepareForPOIChange();
        stopScene();
      }
    }
    );

  const currentPoi = currentPOI ? findPOIRecursively(currentPOI) ?? undefined : undefined;
  const [isLoaded, setIsLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showLoaderOverlay, setShowLoaderOverlay] = useState(true);
  const [viewportHeight, setViewportHeight] = useState<number>(0);
  const [showDialogue, setShowDialogue] = useState(true);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [needsManualRestart, setNeedsManualRestart] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [loadedScene, setLoadedScene] = useState<THREE.Scene | null>(null);
  const [devToolOpen, setDevToolOpen] = useState(false);
  const devToolOpenRef = useRef(false);
  const spritesheetAnimatorRef = useRef<SpritesheetAnimator | null>(null);
  const performCleanupRef = useRef<(() => void) | null>(null);
  const useTouchIcons = isTouchDevice && (isPortrait || isSmallScreen);
  const autoplay = config.autoplay ?? false;

  usePOIEffects(sceneRef.current!, currentPoi, textureLoader);

  const { 
    isPlaying, isPaused, isEnded, progress, duration, 
    audioProgress,
    togglePlayPause, seekScene, stopScene,
    currentSceneSound, // ✅ NOUVEAU
    cleanup: cleanupScenePlayer 
  } = usePOIScenePlayer({
    poi: currentPoi,
    animations: sceneRef.current?.userData?.gltfAnimations || [],
    mixerRef: mixerRef.current,
    muted: false, // ✅ On gère mute dans useUnifiedAudio maintenant
    emptyRefs,
    controlsRef,
    moveCameraToPOI,
    moveCameraDuringAnimation,
    goToPOI,
  });

  // ✅ Hook audio unifié (remplace usePOIAudio)
  const { 
    muted, 
    toggleMute, 
    startSoundReady,  
    enableAudio,
    cleanup: cleanupAudio,
    seekSceneAudio,
    prepareForPOIChange
  } = useUnifiedAudio({
    pois: config.pois,
    currentPOI,
    audioState: {
      isPlaying,
      isPaused,
      isEnded,
      currentSceneSound,
      currentTime: audioProgress.current,
    }
  });

  const activePOIIcon = React.useMemo(() => {
    if (!currentPOI) return undefined;
    const active = findPOIRecursively(currentPOI);
    if (!active) return undefined;
    const parent = findParentPOI(active.id);
    if (parent && (!active.children || active.children.length === 0)) {
      return parent.icon ?? active.icon;
    }
    return active.icon;
  }, [currentPOI, findPOIRecursively, findParentPOI]);

  useEffect(() => {
    console.log('🎬 VIEWER: Démarrage polling changement scène');
    const processedRequests = new Set<string>();
    
    const checkSceneChange = () => {
      const changeRequest = localStorage.getItem('webdiorama-change-scene');
      
      if (changeRequest) {
        try {
          const { url, requestId, bookId, dioramaId } = JSON.parse(changeRequest);
          
          if (processedRequests.has(requestId)) {
            console.log('⏭️ VIEWER: Demande déjà traitée:', requestId);
            return;
          }
          
          console.log('🔄 VIEWER: Nouvelle demande détectée:', requestId, url);
          
          const currentUrl = window.location.href;
          if (currentUrl.includes(`/${bookId}/${dioramaId}`)) {
            console.log('⏭️ VIEWER: Déjà sur cette scène, ignorer');
            processedRequests.add(requestId);
            localStorage.setItem('webdiorama-scene-processed', requestId);
            return;
          }
          
          // ✅ NOUVEAU : Marquer qu'un changement est en cours
          localStorage.setItem('webdiorama-changing-scene', 'true');
          
          processedRequests.add(requestId);
          localStorage.setItem('webdiorama-scene-processed', requestId);
          
          // ✅ Annuler le needsManualRestart (au cas où)
          setNeedsManualRestart(false);
          wasHiddenRef.current = false; // ✅ Reset pour éviter le reload
          
          if (performCleanupRef.current) {
            console.log('🧹 VIEWER: Cleanup avant changement');
            performCleanupRef.current();
          }
          
          setTimeout(() => {
            console.log('🔄 VIEWER: Redirection vers:', url);
            localStorage.removeItem('webdiorama-change-scene');
            localStorage.removeItem('webdiorama-changing-scene');
            window.location.href = url;
          }, 300);
          
        } catch (e) {
          console.error('❌ VIEWER: Erreur parsing:', e);
        }
      }
    };
    
    checkSceneChange();
    const pollInterval = setInterval(checkSceneChange, 200);
    
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('👁️ VIEWER: Retour focus, check immédiat');
        checkSceneChange();
      }
    };
    
    const handleFocus = () => {
      console.log('👁️ VIEWER: Focus, check immédiat');
      checkSceneChange();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    
    return () => {
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // ✅ Heartbeat pour indiquer au launcher qu'on est vivant
  useEffect(() => {
    const updateHeartbeat = () => {
      localStorage.setItem('webdiorama-viewer-alive', JSON.stringify({
        timestamp: Date.now()
      }));
    };
    
    updateHeartbeat();
    const interval = setInterval(updateHeartbeat, 1000);
    
    return () => {
      clearInterval(interval);
      localStorage.removeItem('webdiorama-viewer-alive');
    };
  }, []);

  // ✅ Écouter les changements de scène
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'webdiorama-change-scene' && e.newValue) {
        const { url } = JSON.parse(e.newValue);
        console.log('🔄 Changement de scène demandé:', url);
        
        // ✅ Changer de scène
        window.location.href = url;
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  useEffect(() => {
    devToolOpenRef.current = devToolOpen;
    console.log('🔧 DevTool state changed:', devToolOpen);
  }, [devToolOpen]);

  // Detect mobile/touch
  useEffect(() => {
    const checkIsMobile = () => setIsMobile(window.innerWidth < 768);
    checkIsMobile();
    window.addEventListener("resize", checkIsMobile);
    return () => window.removeEventListener("resize", checkIsMobile);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supportsMatchMedia = typeof window.matchMedia === "function";
    const mm = supportsMatchMedia ? window.matchMedia("(pointer: coarse)") : null;

    const detectTouch = () => {
      const mmMatches = mm?.matches ?? false;
      const maxTouch = !!(navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
      const hasTouchEvent = "ontouchstart" in window;
      setIsTouchDevice(mmMatches || maxTouch || hasTouchEvent);
    };

    const detectSmall = () => setIsSmallScreen(window.innerWidth <= 900);

    detectTouch();
    detectSmall();

    const mmHandler = (e: MediaQueryListEvent) => setIsTouchDevice(e.matches);
    if (mm) {
      if (typeof mm.addEventListener === "function") mm.addEventListener("change", mmHandler);
      else if (typeof (mm as any).addListener === "function") (mm as any).addListener(mmHandler);
    }

    const onResize = () => {
      detectTouch();
      detectSmall();
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    return () => {
      if (mm) {
        if (typeof mm.removeEventListener === "function") mm.removeEventListener("change", mmHandler);
        else if (typeof (mm as any).removeListener === "function") (mm as any).removeListener(mmHandler);
      }
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const updateRendererSize = () => {
    const w = containerRef.current?.clientWidth;
    const h = containerRef.current?.clientHeight;
    if (!w || !h || !cameraRef.current || !renderer) return;

    cameraRef.current.aspect = w / h;
    cameraRef.current.updateProjectionMatrix();
    renderer.setSize(w, h);

    if (composerRef.current) {
      composerRef.current.updateSize(w, h);
    }
  };

  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(
    containerRef,
    () => setTimeout(updateRendererSize, 50)
  );
  useResize(updateRendererSize);

  useEffect(() => {
    const updateVH = () => {
      const vh = window.visualViewport?.height || window.innerHeight;
      setViewportHeight(vh);
      updateRendererSize();
    };

    updateVH();
    window.addEventListener("resize", updateVH);
    window.addEventListener("orientationchange", updateVH);
    window.visualViewport?.addEventListener("resize", updateVH);

    return () => {
      window.removeEventListener("resize", updateVH);
      window.removeEventListener("orientationchange", updateVH);
      window.visualViewport?.removeEventListener("resize", updateVH);
    };
  }, [isFullscreen]);

  function findPOIById(pois: POIWithElements[], id: string): POIWithElements | null {
    for (const p of pois) {
      if (p.id === id) return p;
      if (p.children) {
        const found = findPOIById(p.children as POIWithElements[], id);
        if (found) return found;
      }
    }
    return null;
  }

  useEffect(() => {
    if (!currentPOI) return;
    stopAllAnimations();

    const poi = findPOIById(config.pois as POIWithElements[], currentPOI);
    if (poi && sceneRef.current?.userData?.gltfAnimations) {
      playPOIAnimations(poi, sceneRef.current.userData.gltfAnimations);
    }
  }, [currentPOI]);

  // ✅ Chargement de la scène
  useEffect(() => {
    if (!renderer || !webglReady || !containerRef.current) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
    camera.position.set(0, 2, 5);
    cameraRef.current = camera;

    spritesheetAnimatorRef.current = new SpritesheetAnimator();

    // Post-processing config
    const configWithPP = config as any;
    const toneMappingMap: Record<string, THREE.ToneMapping> = {
      ACESFilmic: THREE.ACESFilmicToneMapping,
      Linear: THREE.LinearToneMapping,
      Reinhard: THREE.ReinhardToneMapping,
      Cineon: THREE.CineonToneMapping,
    };

    const ppConfig = configWithPP.postProcessing
      ? {
          ...configWithPP.postProcessing,
          toneMapping: configWithPP.postProcessing.toneMapping
            ? {
                ...configWithPP.postProcessing.toneMapping,
                type: configWithPP.postProcessing.toneMapping.type
                  ? toneMappingMap[configWithPP.postProcessing.toneMapping.type]
                  : THREE.ACESFilmicToneMapping,
              }
            : undefined,
        }
      : undefined;

    // OutlineEffect
    if (config.toonOutline) {
      new OutlineEffect(renderer, {
        defaultThickness: config.toonOutline.defaultThickness ?? 0.01,
        defaultColor: config.toonOutline.defaultColor ?? [0, 0, 0],
        defaultAlpha: config.toonOutline.defaultAlpha ?? 0.8,
        defaultKeepAlive: config.toonOutline.defaultKeepAlive ?? true,
      });
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI / 2;
    controls.minDistance = 0.5;
    controls.maxDistance = 20;
    controlsRef.current = controls;

    // Chargement GLB
    const loader = new GLTFLoader();
    loader.load(
      config.glb,
      async (gltf: GLTF) => {
        scene.add(gltf.scene);
        scene.userData.gltfAnimations = gltf.animations;
      
        // ✅ AJOUTER : Mettre à jour le state pour l'analyzer
        setLoadedScene(scene);

        // Frustum culling + bounding boxes
        gltf.scene.traverse((child: any) => {
          if (child.isMesh) {
            child.frustumCulled = false;
            if (child.geometry && !child.geometry.boundingBox) {
              child.geometry.computeBoundingBox();
              child.geometry.computeBoundingSphere();
            }
          }
        });

        // Populate empty refs + mixers
        gltf.scene.traverse((child) => {
          if (!child.name) return;
          emptyRefs.current[child.name] = child;

          if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
            const skinned = child as THREE.SkinnedMesh;
            const armature = skinned.skeleton?.bones?.[0]?.parent;
            if (armature && !mixerRef.current[armature.name]) {
              mixerRef.current[armature.name] = new THREE.AnimationMixer(armature);
            } else if (!mixerRef.current[skinned.name]) {
              mixerRef.current[skinned.name] = new THREE.AnimationMixer(skinned);
            }
          } else if ((child as THREE.Mesh).isMesh && !mixerRef.current[child.name]) {
            mixerRef.current[child.name] = new THREE.AnimationMixer(child);
          } else if (child.type === "Bone" || child.name.toLowerCase().includes("armature")) {
            if (!mixerRef.current[child.name]) {
              mixerRef.current[child.name] = new THREE.AnimationMixer(child);
            }
          }
        });

        initMixers(gltf.scene);
        applyLights(gltf.scene, emptyRefs.current, (config as DioramaConfig3DWithVideos).lights);
        applyBulbs(gltf.scene, emptyRefs.current, (config as any).bulbs);

        // Post-processing (délai pour stabilité)
        setTimeout(() => {
          if (!isMobileDevice) {
            composerRef.current = setupPostProcessing(renderer, scene, camera, ppConfig);
          }

          if (configWithPP.emissiveObjects) {
            setupEmissiveMaterials(scene, configWithPP.emissiveObjects);
          }
        }, 100);

        setTimeout(() => {
          applySpritesheets(
            gltf.scene, 
            emptyRefs.current, 
            config.videos,
            spritesheetAnimatorRef.current // ✅ Passer l'animator
          );
          applyVideoTextures(
            gltf.scene, 
            emptyRefs.current, 
            (config as DioramaConfig3DWithVideos).videos,
            videoElementsRef
          );
        }, 3000);

        setLoadingProgress(70);

        // ✅ Précharger les assets du POI start
        const startPOI = (config.pois as POIWithElements[]).find((p) => p.id === "start");

        setLoadingProgress(100);

        // Position caméra sur start POI
        const startObj = emptyRefs.current[startPOI?.emptyName || ""];
        if (startObj && startPOI) {
          moveCameraToPOI(startObj, startPOI, false, () => setCurrentPOI("start"));
          playPOIAnimations(startPOI, gltf.animations);
        }

        // Log stats (dev)
        logSceneStats(scene, renderer);

        setIsLoaded(true);
      },
      (xhr) => {
        if (xhr.total === 0 || !xhr.lengthComputable) {
          setLoadingProgress(70);
          return;
        }
        const progress = (xhr.loaded / xhr.total) * 70;
        setLoadingProgress(Math.floor(progress));
      },
      (error) => {
        console.error("Erreur chargement GLB:", error);
        setIsLoaded(true);
      }
    );

    // ✅ Boucle d'animation
    const animate = () => {
      if (document.hidden) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const delta = clock.current.getDelta();
      updateMixers(delta);
      controlsRef.current?.update();

      if (spritesheetAnimatorRef.current) {
        spritesheetAnimatorRef.current.update(delta, mixerRef.current); // ✅ Passer les mixers
      }

      if (composerRef.current) {
        composerRef.current.composer.render();
      } else if (renderer && cameraRef.current && sceneRef.current) {
        renderer.render(sceneRef.current, cameraRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      if (animationFrameRef.current !== undefined) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }

      if (controlsRef.current) {
        controlsRef.current.dispose();
        controlsRef.current = null;
      }

      if (spritesheetAnimatorRef.current) {
        spritesheetAnimatorRef.current.dispose();
        spritesheetAnimatorRef.current = null;
      }

      disposeScene(sceneRef.current);
      sceneRef.current = null;
    };
  }, [renderer, webglReady, config.glb]);

  // DOF selon POI
  useEffect(() => {
    if (!composerRef.current || !currentPOI) return;

    const poi = findPOIById(config.pois as POIWithElements[], currentPOI);
    if (!poi) return;

    const hasDOFConfig = (poi as any).dofConfig;
    if (hasDOFConfig) {
      composerRef.current.enableDOF(true);
      composerRef.current.updateDOF(
        (poi as any).dofConfig.focus,
        (poi as any).dofConfig.aperture,
        (poi as any).dofConfig.maxblur
      );
    } else {
      composerRef.current.enableDOF(false);
    }
  }, [currentPOI, config.pois]);

  // ✅ Puis modifiez le useEffect de cleanup :
  useEffect(() => {
    const performCleanup = () => {
      // ✅ AJOUTER : Ne pas cleanup si outil dev ouvert
      if (devToolOpenRef.current) {
        console.log("⏸️ Cleanup ignoré : outil dev ouvert");
        return;
      }
      console.log("🛑 Cleanup WebGL immédiat");

      // ✅ 0. MUTER ET STOPPER via les hooks AVANT tout
      console.log("🔇 Cleanup audio via hooks...");
      cleanupAudio(); // Ceci va vider les refs
      cleanupScenePlayer();
      
      // ✅ 0.5. PUIS muter TOUS les audios DOM restants (sécurité)
      console.log("🔇 Mute tous audios DOM restants...");
      document.querySelectorAll('audio').forEach((audio) => {
        const audioEl = audio as HTMLAudioElement;
        console.log("🔇 Mute audio DOM:", audioEl.src);
        audioEl.pause();
        audioEl.muted = true;
        audioEl.volume = 0;
        audioEl.currentTime = 0;
        audioEl.src = '';
        audioEl.load();
      });
      // setIsHidden(true);
      
      // 1. Annuler RAF
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      
      // 2. ✅ STOP TOUS LES AUDIOS via le hook
      console.log("🔇 Appel cleanupAudio...");
      cleanupAudio();
      cleanupScenePlayer();

      // 2.5. ✅ Stop vidéos
      videoElementsRef.current.forEach(video => {
        console.log("🎬 Stop vidéo:", video.src);
        video.pause();
        video.currentTime = 0;
        video.src = '';
        video.load();
        video.remove();
      });
      videoElementsRef.current = [];
      
      // 3. ✅ STOP VIDEOS (avec bon typage)
      document.querySelectorAll('video').forEach((video) => {
        const videoEl = video as HTMLVideoElement;
        videoEl.pause();
        videoEl.currentTime = 0;
        videoEl.src = '';
        videoEl.load();
      });
      
      // 4. Stop animations
      stopAllAnimations();
      Object.values(mixerRef.current).forEach(mixer => mixer.stopAllAction());

      if (spritesheetAnimatorRef.current) {
        spritesheetAnimatorRef.current.dispose();
        spritesheetAnimatorRef.current = null;
      }
      
      // 5. Dispose scene
      if (sceneRef.current) {
        disposeScene(sceneRef.current);
        sceneRef.current = null;
      }
      
      // 6. Dispose renderer + FORCE CONTEXT LOSS
      if (renderer) {
        renderer.dispose();
        // renderer.forceContextLoss();
        renderer.domElement?.remove();
      }
      
      // 7. Dispose composer
      if (composerRef.current) {
        composerRef.current.composer?.dispose();
        composerRef.current = null;
      }
      
      // 8. Dispose controls
      if (controlsRef.current) {
        controlsRef.current.dispose();
        controlsRef.current = null;
      }
      
      // 9. Reset refs
      cameraRef.current = null;
      emptyRefs.current = {};
      mixerRef.current = {};
      
      console.log("✅ Cleanup complet terminé");
    };
    
    const handleVisibilityChange = () => {
      console.log("👁️ Visibility changed:", document.hidden ? "HIDDEN" : "VISIBLE");
      
      if (devToolOpenRef.current) {
        console.log("⏸️ Visibility change ignoré : outil dev ouvert");
        return;
      }
      
      if (localStorage.getItem('webdiorama-changing-scene') === 'true') {
        console.log("⏸️ Visibility change ignoré : changement de scène en cours");
        return;
      }

      if (document.hidden && !wasHiddenRef.current) {
        console.log("🚨 Détection: onglet caché → cleanup");
        wasHiddenRef.current = true;
        voluntaryCleanupRef.current = true;
        setIsHidden(true); // ✅ Mettre ici
        performCleanup();
      } else if (!document.hidden && wasHiddenRef.current) {
        console.log("⏸️ Détection: retour onglet → demander relance manuelle");
        setIsHidden(false); // ✅ RESET isHidden
        setNeedsManualRestart(true);
      }
    };

    const handleFocus = () => {
      console.log("👁️ Window focus");

      if (devToolOpenRef.current) {
        console.log("⏸️ Focus ignoré : outil dev ouvert");
        return;
      }
      
      if (localStorage.getItem('webdiorama-changing-scene') === 'true') {
        console.log("⏸️ Focus ignoré : changement de scène en cours");
        return;
      }

      if (wasHiddenRef.current) {
        console.log("⏸️ Détection: retour focus → demander relance manuelle");
        setIsHidden(false); // ✅ RESET isHidden
        setNeedsManualRestart(true);
      }
    };
    
    const handleBlur = () => {
      console.log("👁️ Window blur");

      // ✅ AJOUTER : Ignorer si outil dev ouvert
      if (devToolOpenRef.current) {
        console.log("⏸️ Blur ignoré : outil dev ouvert");
        return;
      }

      if (!wasHiddenRef.current) {
        wasHiddenRef.current = true;
        voluntaryCleanupRef.current = true;
        setIsHidden(true); // ✅ Mettre ici aussi
        performCleanup();
      }
    };
    
    const handlePageHide = () => {
      console.log("👁️ Page hide");

      // ✅ AJOUTER : Ignorer si outil dev ouvert
      if (devToolOpenRef.current) {
        console.log("⏸️ PageHide ignoré : outil dev ouvert");
        return;
      }

      if (!wasHiddenRef.current) {
        wasHiddenRef.current = true;
        voluntaryCleanupRef.current = true;
        performCleanup();
      }
    };
    
    // console.log("🎬 Setup listeners - document.hidden:", document.hidden);
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pagehide", handlePageHide);
    
    return () => {
      // console.log("🧹 Cleanup listeners");
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [renderer, stopAllAnimations, cleanupAudio, cleanupScenePlayer]);

  // Auto-unmute reset
  useEffect(() => {
    if (isPlaying && !isEnded) {
      hasAutoUnmutedRef.current = false;
    }
  }, [isPlaying, isEnded]);

  useEffect(() => {
    if (showLoaderOverlay) {
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
      document.body.style.height = "100%";
      window.scrollTo(0, 0);
    } else {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.height = "";
    }

    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.height = "";
    };
  }, [showLoaderOverlay]);

  // ✅ UI d'erreur WebGL - VERSION CORRIGÉE SANS useEffect
  if (webglError && !voluntaryCleanupRef.current) {
    return (
      <>
        {/* ❌ Cacher le conteneur principal avec le canvas */}
        <div 
          ref={containerRef} 
          style={{ display: 'none' }} // ✅ Cacher au lieu d'utiliser useEffect
        />
        
        {/* ✅ UI d'erreur par-dessus */}
        <div 
          className="fixed inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center z-[9999]"
          style={{
            width: '100vw',
            height: '100vh',
            position: 'fixed',
            top: 0,
            left: 0,
          }}
        >
          <div className="text-center p-8 max-w-md mx-4">
            {/* Emoji/Icon */}
            <div className="text-4xl mb-6 animate-bounce">
              😴💤
            </div>
            
            {/* Titre principal */}
            <h2 className="text-2xl font-bold text-white mb-3">
              {t.webglErrorScreen?.title}
            </h2>
            
            {/* Message d'erreur technique (petit) */}
            <p className="text-sm text-gray-400 mb-6 italic">
              {webglError === "lost"
                ? `${t.webglErrorScreen?.technicalMessageWebglError}`
                : `${t.webglErrorScreen?.technicalMessageWebglNotError}`}
            </p>
            
            {/* Bouton principal */}
            <button
              onClick={() => {
                console.log("🔄 Rechargement complet de la page...");
                window.location.reload();
              }}
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white text-lg font-bold rounded-full shadow-lg transform transition hover:scale-105 active:scale-95 mb-4"
            >
              {t.webglErrorScreen?.boutonTitle}
                          {/* Sous-titre */}
              <p className="text-xs text-gray-100">
                ( {t.webglErrorScreen?.boutonSubTitle} )
              </p>
            </button>
            

            
            {/* Note technique (très petit) */}
            <p className="text-sm font-bold text-gray-300 mt-4 max-w-xs mx-auto animate-pulse">
              {t.webglErrorScreen?.technicalNote}
            </p>
          </div>
        </div>
      </>
    );
  }

  if (needsManualRestart) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-900 via-black to-purple-900 flex items-center justify-center z-[9999]">
        <div className="text-center p-8 max-w-md">
          <div className="text-6xl mb-6 animate-pulse">💤</div>
          <h2 className="text-2xl font-bold text-white mb-4">
            {t.restart?.title || "Scène en pause"}
          </h2>
          <p className="text-gray-300 mb-6">
            {t.restart?.message || "La scène a été mise en pause pour économiser la mémoire."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white text-lg font-bold rounded-full shadow-lg"
          >
            {t.restart?.button || "⚡ Relancer la scène"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        height: "100dvh",
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        overflow: "hidden",
      }}
      className="bg-black"
    >
      {/* ✅ Overlay de masquage */}
          {isHidden && (
            <div className="fixed inset-0 bg-black z-[10000] flex items-center justify-center">
              <div className="text-white text-center">
                <div className="text-6xl mb-4 animate-pulse">💤</div>
                <p className="text-xl">{t.reload.sleep}</p>
              </div>
            </div>
          )}

          {/* LoaderOverlay et le reste... */}
          <AnimatePresence>
            {showLoaderOverlay && (
              <LoaderOverlay
                isPortrait={isPortrait}
                isMobile={isMobile}
                loadingProgress={loadingProgress}
                isLoaded={isLoaded}
                sceneName={config.name[lang]}
                loaderImage={config.loaderImage}
                fontClassName={BullstandRegular.className}
                autoplay={autoplay}
                bookId={bookId}
                // assetLoadingStatus={
                //   currentAsset 
                //     ? `${currentAsset.type} : ${currentAsset.name}` 
                //     : loadingProgress < 70 
                //       ? "Chargement de la scène 3D..." 
                //       : loadingProgress < 100 
                //         ? `Chargement des assets (${loadedCount}/${totalCount})...`
                //         : ""
                // }
                onStart={() => {
                  window.scrollTo(0, 0);

                  // ✅ Activer audio
                  enableAudio();

                  // ✅ Procéder selon le mode
                  if (autoplay) {
                    console.log("🎬 Mode autoplay : lancement scène");
                    if (!isFullscreen) toggleFullscreen();
                    if (!isPlaying) togglePlayPause(); // Lance scène + sceneSound
                    setShowLoaderOverlay(false);
                  } else {
                    console.log("🎵 Mode normal : activation ambient");
                    if (!isFullscreen) toggleFullscreen();
                    if (muted) toggleMute(); // Active ambient
                    setShowLoaderOverlay(false);
                  }
                }}
              />
            )}
          </AnimatePresence>

          {showRotateHint && <RotateHint show={true} />}

          <DownloadTooltip bookId={bookId} isPortrait={isPortrait} variant="scene" />

          <div className="absolute top-2 right-2 z-50 flex flex-row gap-2 items-end">
            <InfoButton onClick={() => setShowInfoModal(true)} />
          </div>

          <div className="absolute bottom-3 right-2 z-50 flex flex-row gap-2 items-end">
            {currentPoi && currentPoi.dialogue && (
              <DialogueButton visible={showDialogue} onToggle={() => setShowDialogue((v) => !v)} />
            )}
            <AnimatePresence>
              {startSoundReady && (
                <SoundButton muted={muted} onToggle={toggleMute} />
              )}
            </AnimatePresence>
            <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />
          </div>

          <POIBreadcrumbs
            currentPOI={currentPOI}
            goToPOI={goToPOI}
            findPOIRecursively={findPOIRecursively}
            findParentPOI={findParentPOI}
            configPOIs={config.pois}
            isPortrait={isPortrait}
            viewportHeight={viewportHeight}
          />

          {process.env.NODE_ENV === "development" && composerRef.current && (
            <PostProcessingControls
              composer={composerRef.current}
              onUpdate={(type, values) => {
                if (!composerRef.current) return;
                if (type === "bloom")
                  composerRef.current.updateBloom(values.strength, values.radius, values.threshold);
                if (type === "ssao")
                  composerRef.current.updateSSAO(values.kernelRadius, values.minDistance);
                if (type === "dof") {
                  if ("enabled" in values) composerRef.current.enableDOF(values.enabled);
                  else composerRef.current.updateDOF(values.focus, values.aperture, values.maxblur);
                }
                if (type === "toneMapping")
                  composerRef.current?.updateToneMapping(values.type, values.exposure);
              }}
              onOpenChange={setDevToolOpen} 
            />
          )}

          {process.env.NODE_ENV === "development" && (
            <SceneAnalyzer
              scene={loadedScene} 
              glbUrl={config.glb}
              onOpenChange={setDevToolOpen}
            />
          )}

          {process.env.NODE_ENV === "development" && (
            <ConfigConverterTool
              defaultProxyUrl="https://webdiorama-proxy.david-liger-pro.workers.dev/assets/1"
              defaultSceneId="street"
              onOpenChange={setDevToolOpen} 
            />
          )}

          {process.env.NODE_ENV === "development" && (
            <QRCodeModal 
              onOpenChange={setDevToolOpen} 
            />
          )}

          {process.env.NODE_ENV === "development" && (
            <GLBOptimizer 
              onOpenChange={setDevToolOpen} 
            />
          )}

          {process.env.NODE_ENV === "development" && (
            <SpritesheetGenerator 
              onOpenChange={setDevToolOpen} 
            />
          )}

          {currentPoi && currentPoi.elements && currentPoi.elements.length > 0 && (
            <POIPlayer
              isPlaying={isPlaying}
              isPaused={isPaused}
              isEnded={isEnded}
              progress={progress}
              duration={duration}
              onTogglePlayPause={() => {
                const syncInfo = togglePlayPause();
                if (syncInfo?.shouldSyncAudio) {
                  setTimeout(() => seekSceneAudio(syncInfo.syncTime), 50);
                }
              }}
              onSeek={(time) => {
                seekScene(time); // Sync animation
                seekSceneAudio(time); // ✅ Sync audio
              }}
              onStop={stopScene}
              isPortrait={isPortrait}
            />
          )}

          {currentPoi && currentPoi.dialogue && showDialogue && (
            <DialogueModal 
              dialogue={currentPoi.dialogue} progress={progress} isPlaying={isPlaying} isPortrait={isPortrait} />
          )}

          <InfoModal
            show={showInfoModal}
            onClose={() => setShowInfoModal(false)}
            credits={config.credits}
            isMobile={useTouchIcons}
            poiIcon={activePOIIcon}
          />

          {/* Reste de votre UI (RotateHint, InfoButton, etc.) */}
    </div>
  );
}