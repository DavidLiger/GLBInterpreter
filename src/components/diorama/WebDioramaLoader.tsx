"use client";

import { TranslationProvider, useTranslation } from "@/contexts/TranslationContext";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import * as THREE from "three";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import localFont from "next/font/local";
import type { DioramaConfig3D, DioramaConfig3DWithVideos } from "@/types/diorama";
import VolumeControl from "./audio/VolumeControl"; 
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
import { disposeObject, disposeScene, logSceneStats } from "./utils/webglHelpers";
import BookDownloadModal from "./ui/BookDownloadModal";
import { isBookFullyCached, getAssetFromCache } from "./lib/downloadManager";
import useUnifiedAudio from "./hooks/useUnifiedAudio";
import SceneAnalyzer from "./ui/SceneAnalyzer";
import GLBOptimizer from "./ui/GLBOptimizer";
import SpritesheetGenerator from "./ui/SpritesheetGenerator";
import { applySpritesheets } from "./rendering/applySpritesheet";
import { SpritesheetAnimator } from "./rendering/SpritesheetAnimator";
import CVButton from "./ui/CVButton";
import CVModal from "./ui/CVModal";
 
const HandyGeorge = localFont({
  src: "../../../public/fonts/HandyGeorge.ttf",
  variable: "--font-HandyGeorge",
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
  const [checkingCache, setCheckingCache] = useState(true);
  const isFolioMode = process.env.NEXT_PUBLIC_SITE_TYPE === 'folio';
  
  useEffect(() => {
    const checkCacheStatus = async () => {
      const cached = await isBookFullyCached(bookId);
      
      if (cached) {
        console.log("✅ Assets en cache, lancement direct");
        setCheckingCache(false);
        setShowDownloadModal(false);
        setAssetsReady(true);
      } else {
        console.log("📦 Assets manquants, afficher modal");
        setShowDownloadModal(true);
        setCheckingCache(false);
      }
    };
    
    checkCacheStatus();
  }, [bookId]);

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

      {showDownloadModal && !assetsReady && (
        <BookDownloadModal
          bookId={bookId}
          onComplete={() => {
            setShowDownloadModal(false);
            setAssetsReady(true);
          }}
          onCancel={() => setShowDownloadModal(false)}
          isFolioMode={isFolioMode}
        />
      )}

      {!assetsReady && !showDownloadModal && !checkingCache && (
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
  const videoTexturesRef = useRef<THREE.VideoTexture[]>([]);
  const { 
    mixerRef, 
    actionsRef,
    initMixers, 
    prepareActions, 
    stopAllAnimations, 
    updateMixers, 
    cleanup: cleanupMixers,
    startAnimationWithSkip,
  } = usePOIAnimations(emptyRefs);
  const clock = useRef(new THREE.Clock());
  const composerRef = useRef<ReturnType<typeof setupPostProcessing> | null>(null);
  const voluntaryCleanupRef = useRef(false);
  const wasHiddenRef = useRef(false);
  const textureLoader = useMemo(() => new THREE.TextureLoader(), []);
  const [experienceStarted, setExperienceStarted] = useState(false);
  const [showCVModal, setShowCVModal] = useState(false);
  const isFolioMode = process.env.NEXT_PUBLIC_SITE_TYPE === 'folio';
  const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
  const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

  // ✅ Hook WebGL simplifié
  const { renderer, error: webglError, isReady: webglReady, destroy: destroyRenderer } = useWebGLContext(containerRef, {
    isMobile: isMobileDevice,
    onContextLost: () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    },
  });

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
  const [loadError, setLoadError] = useState<"network" | "cache" | "parse" | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showLoaderOverlay, setShowLoaderOverlay] = useState(true);
  const [viewportHeight, setViewportHeight] = useState<number>(0);
  const [showDialogue, setShowDialogue] = useState(true);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [needsManualRestart, setNeedsManualRestart] = useState(false);
  const [loadedScene, setLoadedScene] = useState<THREE.Scene | null>(null);
  const [devToolOpen, setDevToolOpen] = useState(false);
  const devToolOpenRef = useRef(false);
  const shouldAnimateRef = useRef(true); 
  const spritesheetAnimatorRef = useRef<SpritesheetAnimator | null>(null);
  const waitForSceneAudioRef = useRef<(() => Promise<void>) | null>(null);
  const useTouchIcons = isTouchDevice && (isPortrait || isSmallScreen);
  const autoplay = config.autoplay ?? false;
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);

  usePOIEffects(sceneRef.current!, currentPoi, textureLoader);

  const { 
    isPlaying, isPaused, isEnded, isWaitingAudio, progress, duration, 
    togglePlayPause, seekScene, stopScene,
    currentSceneSound, // ✅ NOUVEAU
    cleanup: cleanupScenePlayer 
  } = usePOIScenePlayer({
    poi: currentPoi,
    animations: sceneRef.current?.userData?.gltfAnimations || [],
    mixerRef: mixerRef.current,
    actionsRef,
    startAnimationWithSkip,
    muted: false, // ✅ On gère mute dans useUnifiedAudio maintenant
    emptyRefs,
    controlsRef,
    moveCameraToPOI,
    moveCameraDuringAnimation,
    goToPOI,
    autoplayEnabled,
    experienceStarted, 
    waitForSceneAudioRef,
  });

  // ✅ Hook audio unifié (remplace usePOIAudio)
  const { 
    muted, 
    volume,
    toggleMute, 
    setAudioVolume,
    startSoundReady,  
    enableAudio,
    cleanup: cleanupAudio,
    seekSceneAudio,
    prepareForPOIChange,
    preloadSceneAudio, // ✅ NOUVEAU
    waitForSceneAudio,
  } = useUnifiedAudio({
    pois: config.pois,
    currentPOI,
    audioState: {
      isPlaying,
      isPaused,
      isEnded,
      currentSceneSound,
    }
  });

  useEffect(() => {
    waitForSceneAudioRef.current = waitForSceneAudio;
  }, [waitForSceneAudio]);

  useEffect(() => {
    if (!currentPoi?.sceneSound || !experienceStarted || !startSoundReady) return;
    
    console.log("🎬 POI avec scène détecté, préchargement audio...");
    preloadSceneAudio(currentPoi.sceneSound).catch(err => {
      console.error("❌ Échec préchargement:", err);
    });
  }, [currentPoi?.id, currentPoi?.sceneSound, experienceStarted, startSoundReady, preloadSceneAudio]);


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

  // Redimensionne caméra / renderer / composer sur la taille réelle du conteneur.
  // setSize() réalloue le canvas : on ne l'appelle que si la taille a réellement changé.
  // `force` : réappliquer la taille au composer même si le renderer est déjà à la bonne taille
  // (composer fraîchement créé, qui démarre aux dimensions de la fenêtre).
  const rendererSizeRef = useRef(new THREE.Vector2());
  const updateRendererSize = useCallback((force = false) => {
    const el = containerRef.current;
    const camera = cameraRef.current;
    if (!el || !camera || !renderer) return;

    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;

    const aspect = w / h;
    if (camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }

    const current = renderer.getSize(rendererSizeRef.current);
    const sizeChanged = current.x !== w || current.y !== h;
    if (sizeChanged) renderer.setSize(w, h);
    if (sizeChanged || force) composerRef.current?.updateSize(w, h);
  }, [renderer]);

  // Toujours la dernière version, pour les écouteurs posés une seule fois
  const updateRendererSizeRef = useRef(updateRendererSize);
  useEffect(() => {
    updateRendererSizeRef.current = updateRendererSize;
  }, [updateRendererSize]);

  // Changement de plein écran : attendre la fin de la transition du navigateur (annulable)
  const fullscreenTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onFullscreenChange = useCallback(() => {
    if (fullscreenTimerRef.current !== undefined) clearTimeout(fullscreenTimerRef.current);
    fullscreenTimerRef.current = setTimeout(() => {
      fullscreenTimerRef.current = undefined;
      updateRendererSizeRef.current();
    }, 50);
  }, []);
  useEffect(() => {
    return () => {
      if (fullscreenTimerRef.current !== undefined) clearTimeout(fullscreenTimerRef.current);
    };
  }, []);

  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(containerRef, onFullscreenChange);
  useResize(updateRendererSize);

  useEffect(() => {
    const updateVH = () => {
      const vh = window.visualViewport?.height || window.innerHeight;
      setViewportHeight(vh);
      updateRendererSizeRef.current();
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
      prepareActions(poi, sceneRef.current.userData.gltfAnimations);
    }
  }, [currentPOI]);

  // Arrête et libère toutes les vidéos : éléments <video> ET VideoTextures (GPU).
  // Vider videoElementsRef invalide aussi les `loadeddata` encore en attente (voir applyVideos).
  const stopVideos = useCallback(() => {
    videoElementsRef.current.forEach((video) => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    });
    videoElementsRef.current = [];

    videoTexturesRef.current.forEach((texture) => texture.dispose());
    videoTexturesRef.current = [];
  }, []);

  // ✅ Chargement de la scène
  useEffect(() => {
    if (!renderer || !webglReady || !containerRef.current) return;

    // Tâches asynchrones à neutraliser si l'effet est nettoyé avant leur fin (démontage,
    // StrictMode, changement de scène) : drapeau + timers + travail différé après la 1re frame.
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let afterFirstFrame: (() => void) | null = null;

    const width = window.innerWidth;
    const height = window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
    camera.position.set(0, 2, 5);
    cameraRef.current = camera;
    updateRendererSizeRef.current(); // aspect depuis la taille réelle du conteneur

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
    const loadGLB = async () => {
      const loader = new GLTFLoader();
      
      let glbUrl = config.glb;
      let objectUrl: string | null = null;

      try {
        // ✅ Essayer de charger depuis le cache
        console.log("📦 Tentative chargement depuis cache...");
        const cachedBlob = await getAssetFromCache(bookId, config.glb);
        
        if (cachedBlob) {
          console.log("✅ GLB trouvé en cache, création Blob URL");
          objectUrl = URL.createObjectURL(cachedBlob);
          glbUrl = objectUrl;
          
          // ✅ Progress instantané à 70% car déjà en cache
          setLoadingProgress(70);
        } else {
          console.log("📥 GLB non trouvé en cache, chargement depuis R2");
        }
      } catch (err) {
        console.warn("⚠️ Erreur accès cache, chargement depuis R2:", err);
      }

      // Effet nettoyé pendant l'attente du cache : ne pas lancer le chargement
      if (cancelled) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        return;
      }

      loader.load(
        glbUrl,
        async (gltf: GLTF) => {
          // ✅ Nettoyer l'object URL si créé
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
          }

          // Effet nettoyé pendant le chargement : libérer le GLB reçu et s'arrêter là
          if (cancelled) {
            disposeObject(gltf.scene);
            return;
          }

          scene.add(gltf.scene);
          scene.userData.gltfAnimations = gltf.animations;
        
          setLoadedScene(scene);

          // 🔧 FIX: Force les murs à être complètement opaques
          gltf.scene.traverse((child: any) => {
            if (child.isMesh) {
              const mesh = child as THREE.Mesh;
              const mat = mesh.material as THREE.MeshStandardMaterial;
              
              // Cibler spécifiquement wall_1 et wall_2
              if (child.name.includes('wall')) {
                console.log("🔧 Correction du mur:", child.name);
                mat.transparent = false;
                mat.opacity = 1.0;
                mat.side = THREE.FrontSide; // ← Le fix principal !
                mat.depthWrite = true;
                mat.alphaTest = 0;
                mat.needsUpdate = true;
              }
            }
          });

          // Frustum culling : actif par défaut. Seuls restent exclus les meshes dont la géométrie
          // sort de sa boîte statique : skinnés (sphère figée sur la pose de repos) et morph targets.
          // (three calcule lui-même les bounding volumes à la demande.)
          gltf.scene.traverse((child: any) => {
            if (child.isMesh && (child.isSkinnedMesh || child.morphTargetInfluences)) {
              child.frustumCulled = false;
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

          // ✅ NOUVEAU : Initialiser TOUS les placeholders au chargement
          console.log('🎭 Initialisation de tous les placeholders...');
          const initAllPlaceholders = (pois: POIWithElements[]) => {
            pois.forEach(poi => {
              poi.elements?.forEach(el => {
                if (el.placeholderMesh) {
                  const animated = emptyRefs.current[el.name];
                  const placeholder = emptyRefs.current[el.placeholderMesh];
                  
                  if (animated && placeholder) {
                    animated.visible = false;
                    placeholder.visible = true;
                    console.log(`👻 Init placeholder: ${el.name} caché, ${el.placeholderMesh} visible`);
                  }
                }
              });
              
              // Récursif pour les children
              if (poi.children) {
                initAllPlaceholders(poi.children as POIWithElements[]);
              }
            });
          };
          
          initAllPlaceholders(config.pois as POIWithElements[]);

          applyLights(gltf.scene, emptyRefs.current, (config as DioramaConfig3DWithVideos).lights);
          applyBulbs(gltf.scene, emptyRefs.current, (config as any).bulbs);

          // Post-processing
          timers.push(setTimeout(() => {
            if (cancelled) return;

            if (!isMobileDevice) {
              composerRef.current = setupPostProcessing(renderer, scene, camera, ppConfig);
              updateRendererSizeRef.current(true); // le composer démarre aux dimensions de la fenêtre
            }

            if (configWithPP.emissiveObjects) {
              setupEmissiveMaterials(scene, configWithPP.emissiveObjects);
            }
          }, 100));

          // Spritesheets et vidéos : lancés juste après la première frame rendue de la scène
          // (remplace l'ancien délai fixe de 3 s)
          afterFirstFrame = () => {
            if (cancelled) return;
            applySpritesheets(
              gltf.scene, 
              emptyRefs.current, 
              config.videos,
              spritesheetAnimatorRef.current
            );
            applyVideoTextures(
              gltf.scene, 
              emptyRefs.current, 
              (config as DioramaConfig3DWithVideos).videos,
              videoElementsRef,
              videoTexturesRef
            );
          };

          setLoadingProgress(70);

          const startPOI = (config.pois as POIWithElements[]).find((p) => p.id === "start");
          setLoadingProgress(100);

          const startObj = emptyRefs.current[startPOI?.emptyName || ""];
          if (startObj && startPOI) {
            moveCameraToPOI(startObj, startPOI, false, () => setCurrentPOI("start"));
            prepareActions(startPOI, gltf.animations);
          }

          logSceneStats(scene, renderer);
          setIsLoaded(true);
        },
        (xhr) => {
          if (cancelled) return;

          // ✅ MODIFIÉ : Ne pas afficher progress si déjà en cache
          if (objectUrl) {
            // Déjà en cache, skip progress
            return;
          }
          
          if (xhr.total === 0 || !xhr.lengthComputable) {
            setLoadingProgress(70);
            return;
          }
          const progress = (xhr.loaded / xhr.total) * 70;
          setLoadingProgress(Math.floor(progress));
        },
        (error) => {
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
          }
          if (cancelled) return;

          // Origine de l'échec, pour le diagnostic :
          //  - cache   : le GLB venait du cache local et ne se décode pas (entrée corrompue)
          //  - network : requête échouée (hors ligne, HTTP 4xx/5xx, CORS)
          //  - parse   : fichier reçu mais GLB invalide
          const message = error instanceof Error ? error.message : String(error);
          // Erreur HTTP de FileLoader (porte `response`) ou échec fetch : messages Chrome / Firefox / Safari
          const isNetworkFailure =
            !!(error as { response?: unknown } | null)?.response ||
            /fetch for|failed to fetch|networkerror|load failed/i.test(message);
          const source = objectUrl ? "cache" : isNetworkFailure ? "network" : "parse";

          console.error(`❌ Échec chargement GLB (${source}) : ${config.glb}`, error);
          setLoadError(source);
        }
      );
    };

    loadGLB();

    // ✅ Reste de la boucle d'animation inchangé...
    const animate = () => {
      // ✅ CRITIQUE : Vérifier le flag EN PREMIER
      if (!shouldAnimateRef.current) {
        console.log('🛑 RAF stoppé par flag');
        return; // ✅ Ne pas rappeler RAF
      }

      if (!renderer || !cameraRef.current || !sceneRef.current) {
        console.log('⚠️ RAF appelé alors que renderer/camera/scene null, arrêt');
        shouldAnimateRef.current = false; // ✅ Désactiver le flag
        return;
      }
      // Delta borné : après une longue pause (onglet en arrière-plan, thread bloqué) le premier
      // delta serait énorme et les animations sauteraient. (Le navigateur suspend déjà les RAF
      // d'un onglet caché : l'ancien test document.hidden n'avait pas d'objet.)
      const delta = Math.min(clock.current.getDelta(), 0.1);
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

      // Travail différé jusqu'à la première frame rendue (spritesheets, vidéos)
      if (afterFirstFrame) {
        const run = afterFirstFrame;
        afterFirstFrame = null;
        run();
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    shouldAnimateRef.current = true;
    animationFrameRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      afterFirstFrame = null;

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

      if (composerRef.current) {
        composerRef.current.dispose();
        composerRef.current = null;
      }

      stopVideos();

      disposeScene(sceneRef.current);
      sceneRef.current = null;
    };
  }, [renderer, webglReady, config.glb, bookId]);

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
      if (isDevMode) {
        console.log("🔧 DEV MODE: Cleanup désactivé");
        return;
      }
      // ✅ AJOUTER : Ne pas cleanup si outil dev ouvert
      if (devToolOpenRef.current) {
        console.log("⏸️ Cleanup ignoré : outil dev ouvert");
        return;
      }
      console.log("🛑 Cleanup WebGL immédiat");

      // 1. ✅ CRITIQUE : Désactiver RAF en premier, puis l'annuler
      shouldAnimateRef.current = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }

      // 2. Audio et lecteur de scène (les audios ne sont jamais dans le DOM : tout passe par les hooks)
      cleanupAudio();
      cleanupScenePlayer();

      // 3. Vidéos (éléments + textures) : stopVideos() sait les retrouver, pas besoin de fouiller le DOM
      stopVideos();

      // 4. Animations (cleanupMixers vide aussi mixerRef)
      stopAllAnimations();
      cleanupMixers();

      if (spritesheetAnimatorRef.current) {
        spritesheetAnimatorRef.current.dispose();
        spritesheetAnimatorRef.current = null;
      }

      // 5. Post-processing, scène, contrôles
      if (composerRef.current) {
        composerRef.current.dispose();
        composerRef.current = null;
      }

      if (sceneRef.current) {
        disposeScene(sceneRef.current);
        sceneRef.current = null;
      }

      if (controlsRef.current) {
        controlsRef.current.dispose();
        controlsRef.current = null;
      }

      // 6. Renderer : possédé par useWebGLContext (dispose + perte de contexte + retrait du canvas)
      destroyRenderer();

      // 7. Reset refs
      cameraRef.current = null;
      emptyRefs.current = {};
      
      console.log("✅ Cleanup complet terminé");
    };
    
    const handleVisibilityChange = () => {
      console.log("👁️ Visibility changed:", document.hidden ? "HIDDEN" : "VISIBLE");

      if (isDevMode) {
        console.log("🔧 DEV MODE: Visibility change ignoré");
        return;
      }
      
      if (devToolOpenRef.current) {
        console.log("⏸️ Visibility change ignoré : outil dev ouvert");
        return;
      }
      
      if (document.hidden && !wasHiddenRef.current) {
        console.log("🚨 Détection: onglet caché → cleanup");
        wasHiddenRef.current = true;
        voluntaryCleanupRef.current = true;
        performCleanup();
      } else if (!document.hidden && wasHiddenRef.current) {
        console.log("⏸️ Détection: retour onglet → demander relance manuelle");
        setNeedsManualRestart(true);
      }
    };

    const handleFocus = () => {
      console.log("👁️ Window focus");

      if (isDevMode) {
        console.log("🔧 DEV MODE: Focus ignoré");
        return;
      }

      if (devToolOpenRef.current) {
        console.log("⏸️ Focus ignoré : outil dev ouvert");
        return;
      }
      
      if (wasHiddenRef.current) {
        console.log("⏸️ Détection: retour focus → demander relance manuelle");
        setNeedsManualRestart(true);
      }
    };
    
    const handlePageHide = () => {
      console.log("👁️ Page hide");

      if (isDevMode) {
        console.log("🔧 DEV MODE: PageHide ignoré");
        return;
      }

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
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pagehide", handlePageHide);
    
    return () => {
      // console.log("🧹 Cleanup listeners");
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pagehide", handlePageHide);
    };
    // Tout ce qui est listé est stable (useCallback / refs) : l'effet n'est posé qu'une fois.
    // Ne pas y ajouter de valeur instable, sous peine de re-souscrire à chaque rendu.
  }, [stopAllAnimations, cleanupMixers, cleanupAudio, cleanupScenePlayer, stopVideos, destroyRenderer]);

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
          {/* ✅ NOUVEAU : Badge mode dev */}
          {isDevMode && (
            <div className="fixed top-2 left-2 z-[200] px-3 py-1 bg-yellow-500 text-black text-xs font-bold rounded-full shadow-lg">
              🔧 DEV MODE
            </div>
          )}

          {/* ❌ Échec de chargement du GLB : écran bloquant avec rechargement */}
          {loadError && (
            <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center z-[9999]">
              <div className="text-center p-8 max-w-md mx-4">
                <div className="text-4xl mb-6">⚠️</div>
                <h2 className="text-2xl font-bold text-white mb-3">{t.loadError.title}</h2>
                <p className="text-gray-300 mb-6">{t.loadError.message}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white text-lg font-bold rounded-full shadow-lg transform transition hover:scale-105 active:scale-95"
                >
                  {t.loadError.button}
                </button>
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
                fontClassName={HandyGeorge.className}
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
                  setExperienceStarted(true);
                }}
              />
            )}
          </AnimatePresence>

          {showRotateHint && <RotateHint show={true} />}

          {!isFolioMode && (
            <DownloadTooltip bookId={bookId} isPortrait={isPortrait} variant="scene" />
          )}

          {/* ✅ NOUVEAU : Bouton CV (seulement en mode folio) */}
          {isFolioMode && (
            <CVButton onClick={() => setShowCVModal(true)} />
          )}

          {/* ✅ NOUVEAU : Modal CV */}
          {isFolioMode && (
            <CVModal
              isOpen={showCVModal}
              onClose={() => setShowCVModal(false)}
              cvHtmlUrl="https://webdiorama-proxy.david-liger-pro.workers.dev/assets/folio/cv/Cv_david_liger.html"
              cvPdfUrl="https://webdiorama-proxy.david-liger-pro.workers.dev/assets/folio/cv/Cv_david_liger.pdf"
            />
          )}

          <div className="absolute top-2 right-2 z-50 flex flex-row gap-2 items-end">
            <InfoButton onClick={() => setShowInfoModal(true)} />
          </div>

          <div className="absolute bottom-3 right-2 z-50 flex flex-row gap-2 items-end">
            {currentPoi && currentPoi.dialogue && (
              <DialogueButton visible={showDialogue} onToggle={() => setShowDialogue((v) => !v)} />
            )}
            <AnimatePresence>
              {startSoundReady && (
                <VolumeControl
                  volume={volume}
                  muted={muted}
                  onVolumeChange={setAudioVolume}
                  onToggleMute={toggleMute}
                />
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
            experienceStarted={experienceStarted} 
            bookId={bookId}
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
              isWaitingAudio={isWaitingAudio}
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
              autoplayEnabled={autoplayEnabled} // ✅ NOUVEAU
              onToggleAutoplay={() => setAutoplayEnabled(prev => !prev)} 
            />
          )}

          {currentPoi && currentPoi.dialogue && showDialogue && (
            <DialogueModal
              key={currentPoi.id} 
              dialogue={currentPoi.dialogue} 
              progress={progress} 
              isPlaying={isPlaying} 
              isPortrait={isPortrait} />
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