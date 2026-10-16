"use client";

import { TranslationProvider, useTranslation, type Lang } from "@/contexts/TranslationContext";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import dynamic from "next/dynamic";
import type { POI } from "@/types/diorama";
import { START_POI_ID, type ReaderScene } from "@/components/book/readerScene";
import { findNode, indexSceneNodes } from "./lib/nodeNames";
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
import POIPlayer from "@/components/diorama/ui/POIPlayer";
import { usePOIScenePlayer } from "@/components/diorama/hooks/usePOIScenePlayer";
import DialogueModal from "./ui/DialogueModal";
import DialogueButton from "./ui/DialogueButton";
import InfoButton from "./ui/InfoButton";
import InfoModal from "./ui/InfoModal";
import POIBreadcrumbs from "./ui/POIBreadcrumbs";
import { setupPostProcessing, setupEmissiveMaterials } from "./rendering/setupPostProcessing";
import { usePOIEffects } from "./hooks/usePOIEffects";
import RotateHint from "./ui/RotateHint";
import { useWebGLContext } from "./hooks/useWebGLContext";
import { disposeObject, disposeScene, logSceneStats } from "./utils/webglHelpers";
import { getAssetFromCache } from "@/components/book/install/bookCache";
import { createGLTFLoader, type GLTFLoaderWithDecoders } from "./lib/gltfDecoders";
import { FrameTasks } from "./lib/frameTasks";
import { sceneRadius } from "./lib/orbitFraming";
import { addFallbackLightsIfNone } from "./lib/fallbackLights";
import { ButtonsPlayer, type ActionEvent } from "./lib/buttonsPlayer";
import ActionButtons from "./ui/ActionButtons";
import useUnifiedAudio from "./hooks/useUnifiedAudio";
import useBookAudio from "./hooks/useBookAudio";
import { effectiveVolume, type SceneSounds } from "./lib/audioEngine";
import { applySpritesheets } from "./rendering/applySpritesheet";
import { SpritesheetAnimator } from "./rendering/SpritesheetAnimator";

// Outils de développement hors bundle de production (R-29, T-01) : la condition est évaluée au build, la branche
// `import()` disparaît en production.
const DevTools =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("./tools/DevTools"), { ssr: false })
    : null;

/**
 * Poignée du lecteur sur la scène chargée (`onEngineReady`), pour l'atelier et les outils de développement : lecture
 * libre d'un clip (`lib/clipPreview.ts`, hors bundle du livre), diagnostic. Valable jusqu'au déchargement de la scène.
 */
export interface ReaderEngine {
  /** Racine du GLB chargé. */
  root: THREE.Object3D;
  /** Clips du GLB. */
  clips: readonly THREE.AnimationClip[];
  /** Boucle unique du lecteur (P-06) : tâches exécutées à chaque image. */
  frameTasks: FrameTasks;
  /** Mode `buttons` (scène v1), ou `null` (fixture). */
  buttons: ButtonsPlayer | null;
  /** Rayon de la sphère englobante (valeurs par défaut du cadrage, `lib/orbitFraming.ts`). */
  radius: number;
  /**
   * Caméra et contrôles orbitaux du lecteur (A4) : l'onglet Caméra de l'atelier lit la vue actuelle et pose le cadrage
   * saisi en place, sans remonter le lecteur. Le lecteur ne les lit pas en retour : sans atelier, rien ne change.
   */
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
}

export interface WebDioramaLoaderProps {
  scene: ReaderScene;
  /** Mode `buttons` : action lancée, interrompue ou finie (son par action en Î11). */
  onAction?: (e: ActionEvent) => void;
  /** Scène chargée (atelier, outils de développement). */
  onEngineReady?: (engine: ReaderEngine | null) => void;
  /**
   * Atelier (A2) : lecteur rendu dans le conteneur de la page (position absolue) au lieu de l'écran entier, sans passage
   * en plein écran au démarrage, sans bouton plein écran ni outils de développement. Sans cette prop, rien ne change.
   */
  embedded?: boolean;
  /**
   * Atelier (A3) : langue d'aperçu imposée par la page, et langue choisie dans le lecteur (sélecteur de l'écran de
   * chargement) renvoyée à la page. Sans ces props, le lecteur garde sa langue (enregistrée, sinon celle du navigateur).
   */
  lang?: Lang;
  onLangChange?: (lang: Lang) => void;
}

/**
 * Lecteur de scène. Entrée unique (C-01 à C-04, Î10) : `ReaderScene` (scène v1 lue dans `scenes/<id>.json`, traduite
 * pour le moteur, ou fixture de développement). Utilisable hors de `BookApp` (atelier, piste A) : il ne dépend que de
 * la scène et du dossier du livre servi à côté de la page.
 */
export default function WebDioramaLoader(props: WebDioramaLoaderProps) {
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
    <TranslationProvider lang={props.lang} onLangChange={props.onLangChange}>
      <WebDioramaLoaderInner {...props} />
    </TranslationProvider>
  );
}

// Î8 : le livre entier est installé et vérifié avant le montage du lecteur (InstallGate, src/components/book/install/) ;
// plus de vérification de cache ni de modale de téléchargement ici.
function WebDioramaLoaderInner({ scene: readerScene, onAction, onEngineReady, embedded = false }: WebDioramaLoaderProps) {
  const { config, bookId } = readerScene;
  // Boucle unique (P-06) et mode `buttons` (Î10b)
  const frameTasksRef = useRef<FrameTasks>(new FrameTasks());
  const sceneRadiusRef = useRef<number | null>(null);
  const buttonsRef = useRef<ButtonsPlayer | null>(null);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const onActionRef = useRef(onAction);
  const onEngineReadyRef = useRef(onEngineReady);
  useEffect(() => {
    onActionRef.current = onAction;
    onEngineReadyRef.current = onEngineReady;
  }, [onAction, onEngineReady]);
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
    createRootMixer,
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
      frameTasksRef,
      sceneRadiusRef,
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
  // Décodeurs Meshopt/KTX2 du chargement en cours (Î7) : KTX2Loader libéré au nettoyage de la scène
  const gltfDecodersRef = useRef<GLTFLoaderWithDecoders | null>(null);
  const waitForSceneAudioRef = useRef<(() => Promise<void>) | null>(null);
  const useTouchIcons = isTouchDevice && (isPortrait || isSmallScreen);
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);

  usePOIEffects(sceneRef.current!, currentPoi, textureLoader);

  const { 
    isPlaying, isPaused, isEnded, isWaitingAudio, progress, duration, 
    togglePlayPause, seekScene, stopScene, autoplayNow, autoplayWanted,
    currentSceneSound, // ✅ NOUVEAU
    cleanup: cleanupScenePlayer 
  } = usePOIScenePlayer({
    poi: currentPoi,
    animations: sceneRef.current?.userData?.gltfAnimations || [],
    actionsRef,
    startAnimationWithSkip,
    muted: false, // ✅ On gère mute dans useUnifiedAudio maintenant
    emptyRefs,
    controlsRef,
    findParentPOI,
    moveCameraToPOI,
    moveCameraDuringAnimation,
    frameTasks: frameTasksRef,
    sceneAutoplay: config.autoplay,
    autoplayEnabled,
    experienceStarted, 
    waitForSceneAudioRef,
  });

  // Audio Web Audio (Î11, lib/audioEngine.ts) : son par action du mode `buttons` et ambiance d'une scène v1, volume et
  // sourdine communs (persistés par livre), aussi appliqués à l'audio de la fixture ci-dessous
  const sceneSounds = useMemo<SceneSounds>(
    () => ({
      ambient: config.ambientSound,
      actions: Object.fromEntries(
        (config.buttons?.actions ?? []).flatMap((a) => (a.sound ? [[a.id, { sound: a.sound, loop: a.loop }] as const] : [])),
      ),
    }),
    [config.ambientSound, config.buttons],
  );
  const {
    settings: audioSettings,
    unlock: unlockAudio,
    onAction: playActionSound,
    setVolume: setAudioVolume,
    toggleMute,
    release: releaseBookAudio,
  } = useBookAudio(bookId, sceneSounds);

  // Audio de la fixture (ligne de temps, ambiances par POI : modules réservés), en HTMLAudioElement
  const { 
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
    bookId,
    volume: effectiveVolume(audioSettings),
    muted: audioSettings.muted,
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
      else mm.addListener(mmHandler); // Safari < 14
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
        else mm.removeListener(mmHandler); // Safari < 14
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

  const { isFullscreen, isSupported: fullscreenSupported, toggle: toggleFullscreen } = useFullscreen(containerRef, onFullscreenChange);
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

  function findPOIById(pois: POI[], id: string): POI | null {
    for (const p of pois) {
      if (p.id === id) return p;
      if (p.children) {
        const found = findPOIById(p.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  useEffect(() => {
    if (!currentPOI) return;
    stopAllAnimations();

    const poi = findPOIById(config.pois, currentPOI);
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
    const frameTasks = frameTasksRef.current;
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
    const toneMappingMap: Record<string, THREE.ToneMapping> = {
      ACESFilmic: THREE.ACESFilmicToneMapping,
      Linear: THREE.LinearToneMapping,
      Reinhard: THREE.ReinhardToneMapping,
      Cineon: THREE.CineonToneMapping,
    };

    const ppConfig = config.postProcessing
      ? {
          ...config.postProcessing,
          toneMapping: config.postProcessing.toneMapping
            ? {
                ...config.postProcessing.toneMapping,
                type: config.postProcessing.toneMapping.type
                  ? toneMappingMap[config.postProcessing.toneMapping.type]
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
      // GLB optimisés par le pipeline (Meshopt + KTX2) : décodeurs auto-hébergés (R-33)
      gltfDecodersRef.current?.dispose();
      const decoders = createGLTFLoader(renderer);
      gltfDecodersRef.current = decoders;
      const loader = decoders.loader;

      let glbUrl = config.glb;
      let objectUrl: string | null = null;

      // Î10 (point de clôture Î8) : quand le service worker contrôle la page, le GLB est chargé par son URL ; le
      // service worker le sert depuis le Cache Storage (pas de copie Blob + URL objet en plus du tampon du loader).
      // Sans service worker (premier lancement non contrôlé, navigateur sans SW), lecture directe dans le cache
      // du livre (Î8) ; sans entrée en cache, l'URL part au réseau.
      const swControlled = typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller;
      if (!swControlled) {
        try {
          const cachedBlob = await getAssetFromCache(bookId, config.glb);
          if (cachedBlob) {
            objectUrl = URL.createObjectURL(cachedBlob);
            glbUrl = objectUrl;
            setLoadingProgress(70); // déjà local
          }
        } catch (err) {
          console.warn("⚠️ Erreur accès cache, chargement par URL:", err);
        }
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

          // R-14 (Î10) : correctif « wall » retiré du moteur (matériaux des objets dont le nom contient « wall » forcés
          // opaques). Un défaut de matériau se corrige dans le .blend, pas par un nom codé dans le lecteur.

          // Frustum culling : actif par défaut. Seuls restent exclus les meshes dont la géométrie
          // sort de sa boîte statique : skinnés (sphère figée sur la pose de repos) et morph targets.
          // (three calcule lui-même les bounding volumes à la demande.)
          gltf.scene.traverse((child) => {
            const mesh = child as THREE.Mesh;
            if (mesh.isMesh && ((child as THREE.SkinnedMesh).isSkinnedMesh || mesh.morphTargetInfluences)) {
              child.frustumCulled = false;
            }
          });

          // Index des nœuds par nom Blender (point 5, lib/nodeNames.ts : nom d'origine, puis nom assaini par GLTFLoader)
          indexSceneNodes(gltf.scene, emptyRefs.current);

          // Mixers : propriétaire unique `usePOIAnimations` (R-13, R-27, P-25 ; avant Î10b, des mixers étaient aussi
          // créés ici, pour chaque maillage et chaque os, puis aussitôt remplacés par initMixers).
          buttonsRef.current?.dispose();
          buttonsRef.current = null;
          if (config.buttons) {
            // Scène v1, mode `buttons` : un seul mixer sur la racine de la scène ; `idle` en boucle dès le chargement
            const buttons = new ButtonsPlayer(createRootMixer(gltf.scene), gltf.animations, config.buttons, {
              onAction: (e) => {
                if (process.env.NODE_ENV === "development") console.info(`[buttons] ${e.id} : ${e.phase}`);
                setActionLog((log) => [...log.slice(-9), `${e.id}:${e.phase}`]);
                playActionSound(e.id, e.phase); // son par action (Î11)
                onActionRef.current?.(e);
              },
              onChange: setCurrentAction,
            });
            buttonsRef.current = buttons;
            buttons.start();
            // Première image d'`idle` appliquée avant toute mesure : la pose de repos de l'armature peut différer de la
            // pose affichée (raptor réel : couché sur le flanc au repos, redressé par `idle`)
            buttons.mixer.update(0);
          } else {
            initMixers(gltf.scene);
          }

          // Rayon de la sphère englobante, mesuré sur la pose affichée au chargement (première image d'`idle` pour une
          // scène v1) : valeurs par défaut du cadrage (lib/orbitFraming.ts) et éclairage de secours
          const radius = sceneRadius(gltf.scene);
          sceneRadiusRef.current = radius;

          // ✅ NOUVEAU : Initialiser TOUS les placeholders au chargement
          console.log('🎭 Initialisation de tous les placeholders...');
          const initAllPlaceholders = (pois: POI[]) => {
            pois.forEach(poi => {
              poi.elements?.forEach(el => {
                if (el.placeholderMesh) {
                  const animated = findNode(emptyRefs.current, el.name);
                  const placeholder = findNode(emptyRefs.current, el.placeholderMesh);
                  
                  if (animated && placeholder) {
                    animated.visible = false;
                    placeholder.visible = true;
                    console.log(`👻 Init placeholder: ${el.name} caché, ${el.placeholderMesh} visible`);
                  }
                }
              });
              
              // Récursif pour les children
              if (poi.children) {
                initAllPlaceholders(poi.children);
              }
            });
          };
          
          initAllPlaceholders(config.pois);

          applyLights(gltf.scene, emptyRefs.current, config.lights);
          applyBulbs(gltf.scene, emptyRefs.current, config.bulbs);
          // D-8.10 : lumières du GLB ou de la fixture ; éclairage neutre seulement s'il n'y en a aucune
          addFallbackLightsIfNone(scene, radius, config.glb);

          // Post-processing
          timers.push(setTimeout(() => {
            if (cancelled) return;

            // Module réservé : actif seulement si la scène le déclare (principe console/cartouche, décision du 12/10).
            // Avant Î10, un composer par défaut (bloom + SSAO) tournait sur toute scène d'ordinateur.
            if (!isMobileDevice && config.postProcessing) {
              composerRef.current = setupPostProcessing(renderer, scene, camera, ppConfig);
              updateRendererSizeRef.current(true); // le composer démarre aux dimensions de la fenêtre
            }

            if (config.emissiveObjects) {
              setupEmissiveMaterials(scene, config.emissiveObjects);
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
              config.videos,
              videoElementsRef,
              videoTexturesRef
            );
          };

          setLoadingProgress(70);

          // POI de départ (C-17, V-04) : `start`, seul POI d'une scène v1 (traduction de `modules.camera`).
          const startPOI = config.pois.find((p) => p.id === START_POI_ID);
          setLoadingProgress(100);

          const startObj = startPOI ? findNode(emptyRefs.current, startPOI.emptyName) : undefined;
          if (!startObj) console.warn(`POI « ${START_POI_ID} » : empty « ${startPOI?.emptyName ?? "?"} » introuvable dans le GLB`);
          if (startObj && startPOI) {
            moveCameraToPOI(startObj, startPOI, false, () => setCurrentPOI(START_POI_ID));
            prepareActions(startPOI, gltf.animations);
          }

          logSceneStats(scene, renderer);
          setIsLoaded(true);
          onEngineReadyRef.current?.({
            root: gltf.scene,
            clips: gltf.animations,
            frameTasks: frameTasksRef.current,
            buttons: buttonsRef.current,
            radius,
            camera,
            controls,
          });
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
      // Boucle unique (P-06) : transitions de caméra, ligne de temps, outils ; puis fondus du mode `buttons` et mixers
      frameTasks.run(delta, performance.now());
      buttonsRef.current?.tick(delta);
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

      // Tâches par image, mode `buttons` et mixers de la scène déchargée
      onEngineReadyRef.current?.(null);
      frameTasks.clear();
      buttonsRef.current?.dispose();
      buttonsRef.current = null;
      cleanupMixers();
      sceneRadiusRef.current = null;

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

      gltfDecodersRef.current?.dispose();
      gltfDecodersRef.current = null;
    };
  }, [renderer, webglReady, config.glb, bookId]);

  // DOF selon POI
  useEffect(() => {
    if (!composerRef.current || !currentPOI) return;

    const poi = findPOIById(config.pois, currentPOI);
    if (!poi) return;

    if (poi.dofConfig) {
      composerRef.current.enableDOF(true);
      composerRef.current.updateDOF(poi.dofConfig.focus, poi.dofConfig.aperture, poi.dofConfig.maxblur);
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
      releaseBookAudio();
      cleanupAudio();
      cleanupScenePlayer();

      // 3. Vidéos (éléments + textures) : stopVideos() sait les retrouver, pas besoin de fouiller le DOM
      stopVideos();

      // 4. Animations (cleanupMixers vide aussi mixerRef et le mixer racine du mode `buttons`)
      frameTasksRef.current.clear();
      buttonsRef.current?.dispose();
      buttonsRef.current = null;
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

      // Décodeurs (workers du KTX2Loader)
      gltfDecodersRef.current?.dispose();
      gltfDecodersRef.current = null;

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
  }, [stopAllAnimations, cleanupMixers, cleanupAudio, releaseBookAudio, cleanupScenePlayer, stopVideos, destroyRenderer]);

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
      style={
        embedded
          ? { position: "absolute", inset: 0, overflow: "hidden" }
          : {
              height: "100dvh",
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              overflow: "hidden",
            }
      }
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
                fontClassName="font-handy"
                embedded={embedded}
                onStart={() => {
                  window.scrollTo(0, 0);

                  // Audio : AudioContext créé et débloqué dans le geste (Web Audio, Î11), audio de la fixture autorisé
                  unlockAudio();
                  enableAudio();

                  if (!embedded && !isFullscreen) toggleFullscreen();
                  // Ligne de temps (fixture) : autoplay lancé dans le geste, une seule fois (P-14). Scène v1 : `idle`
                  // joue déjà depuis le chargement ; le geste ne sert qu'à débloquer l'audio.
                  if (autoplayWanted) {
                    autoplayNow(); // lance la scène et son sceneSound
                  }
                  setShowLoaderOverlay(false);
                  setExperienceStarted(true);
                }}
              />
            )}
          </AnimatePresence>

          {showRotateHint && <RotateHint show={true} />}

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
                  volume={audioSettings.volume}
                  muted={audioSettings.muted}
                  onVolumeChange={setAudioVolume}
                  onToggleMute={toggleMute}
                />
              )}
            </AnimatePresence>
            {!embedded && fullscreenSupported && <FullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />}
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

          {DevTools && !embedded && (
            <DevTools
              composer={composerRef.current}
              scene={loadedScene}
              glbUrl={config.glb}
              onOpenChange={setDevToolOpen}
            />
          )}

          {config.buttons && isLoaded && !showLoaderOverlay && (
            <ActionButtons
              actions={config.buttons.actions}
              lang={lang}
              currentId={currentAction}
              log={actionLog}
              onTrigger={(id) => buttonsRef.current?.trigger(id)}
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