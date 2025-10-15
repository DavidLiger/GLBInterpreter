// WebDioramaLoader.tsx - Modifications nécessaires

"use client";

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
// ✅ AJOUT : Import de la fonction de setup
import { setupPostProcessing, setupEmissiveMaterials } from "./rendering/setupPostProcessing"; 
import { usePOIEffects } from "./hooks/usePOIEffects";

const BullstandRegular = localFont({
  src: "../../../public/fonts/Bullstand-Regular.ttf",
  variable: "--font-Bullstand-Regular",
});

export default function WebDioramaLoader({ config }: { config: DioramaConfig3D }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const { isPortrait, showRotateHint } = useOrientation(5000);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const emptyRefs = useRef<Record<string, THREE.Object3D>>({});
  const { mixerRef, initMixers, playPOIAnimations, stopAllAnimations, updateMixers } =
    usePOIAnimations(emptyRefs);
  const clock = useRef(new THREE.Clock());
  
  // ✅ AJOUT : Ref pour le post-processing
  const composerRef = useRef<ReturnType<typeof setupPostProcessing> | null>(null);
  const textureLoader = useMemo(() => new THREE.TextureLoader(), []);

  
  const { currentPOI, goToPOI, findParentPOI, moveCameraToPOI, moveCameraDuringAnimation, setCurrentPOI, findPOIRecursively } = usePOINavigation(
    config,
    cameraRef,
    controlsRef,
    emptyRefs
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
  const useTouchIcons = isTouchDevice && (isPortrait || isSmallScreen);

  usePOIEffects(sceneRef.current!, currentPoi, textureLoader);

  const {
    startSoundReady,
    muted,
    toggleMute,
    scenePlaying,
    ambientAudioRefs,
    handleSceneStart,
    handleSceneEnd,
  } = usePOIAudio({
    pois: config.pois,
    currentPOI,
    onScenePlayingChange: (playing) => {},
  });

  const {
    isPlaying,
    isPaused,
    isEnded,
    progress,
    duration,
    togglePlayPause,
    seekScene,
    sceneMuted,
    toggleSceneMute,
  } = usePOIScenePlayer({
    poi: currentPoi,
    animations: sceneRef.current?.userData?.gltfAnimations || [],
    mixerRef: mixerRef.current,
    ambientAudioRefs: ambientAudioRefs.current,
    muted,
    onSceneStart: handleSceneStart,
    onSceneEnd: handleSceneEnd,
    emptyRefs,
    controlsRef,
    moveCameraToPOI,
    moveCameraDuringAnimation,
    goToPOI
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
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
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

    const detectSmall = () => {
      setIsSmallScreen(window.innerWidth <= 900);
    };

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

  // ✅ MODIFICATION : Mise à jour du resize pour inclure le composer
  const updateRendererSize = () => {
    const w = containerRef.current?.clientWidth;
    const h = containerRef.current?.clientHeight;
    if (!w || !h || !cameraRef.current || !rendererRef.current) return;
    
    cameraRef.current.aspect = w / h;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(w, h);
    
    // ✅ Mettre à jour le post-processing
    if (composerRef.current) {
      composerRef.current.updateSize(w, h);
    }
  };

  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(containerRef, () => setTimeout(updateRendererSize, 50));
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

  const parentPOI = currentPOI ? findParentPOI(currentPOI) : null;

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

  // ✅ AJOUT : useEffect pour mettre à jour le DOF selon le POI
  useEffect(() => {
    if (!composerRef.current || !currentPOI) return;

    const poi = findPOIById(config.pois as POIWithElements[], currentPOI);
    if (!poi) return;

    // Vérifier si le POI a une config DOF personnalisée
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

  // ✅ MODIFICATION : useEffect principal avec post-processing
  useEffect(() => {
    if (!containerRef.current) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
    camera.position.set(0, 2, 5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // ✅ Performance
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ✅ AJOUT : Configuration du post-processing
    const configWithPP = config as any; // Cast pour accéder aux propriétés PP
    const toneMappingMap: Record<string, THREE.ToneMapping> = {
      "ACESFilmic": THREE.ACESFilmicToneMapping,
      "Linear": THREE.LinearToneMapping,
      "Reinhard": THREE.ReinhardToneMapping,
      "Cineon": THREE.CineonToneMapping,
    };

    const ppConfig = configWithPP.postProcessing ? {
      ...configWithPP.postProcessing,
      toneMapping: configWithPP.postProcessing.toneMapping ? {
        ...configWithPP.postProcessing.toneMapping,
        type: configWithPP.postProcessing.toneMapping.type 
          ? toneMappingMap[configWithPP.postProcessing.toneMapping.type] 
          : THREE.ACESFilmicToneMapping,
      } : undefined,
    } : undefined;

    composerRef.current = setupPostProcessing(renderer, scene, camera, ppConfig);

    // OutlineEffect (optionnel)
    let effect: OutlineEffect | null = null;
    if (config.toonOutline) {
      effect = new OutlineEffect(renderer, {
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

    const loader = new GLTFLoader();

    loader.load(
      config.glb,
      (gltf: GLTF) => {
        scene.add(gltf.scene);
        sceneRef.current = scene;
        scene.userData.gltfAnimations = gltf.animations;

        gltf.scene.traverse((child: any) => {
          if (child.isMesh) {
            child.frustumCulled = false;
            if (child.geometry && !child.geometry.boundingBox) {
              child.geometry.computeBoundingBox();
              child.geometry.computeBoundingSphere();
            }
          }
        });

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
        applyVideoTextures(gltf.scene, emptyRefs.current, (config as DioramaConfig3DWithVideos).videos);
        applyLights(gltf.scene, emptyRefs.current, (config as DioramaConfig3DWithVideos).lights);
        applyBulbs(gltf.scene, emptyRefs.current, (config as any).bulbs);

        // ✅ AJOUT : Configurer les objets émissifs pour le bloom
        if (configWithPP.emissiveObjects) {
          setupEmissiveMaterials(scene, configWithPP.emissiveObjects);
        }

        const startPOI = (config.pois as POIWithElements[]).find((p) => p.id === "start");
        if (startPOI) {
          const startObj = emptyRefs.current[startPOI.emptyName];
          if (startObj) moveCameraToPOI(startObj, startPOI, false, () => setCurrentPOI("start"));
          playPOIAnimations(startPOI, gltf.animations);
        }

        setIsLoaded(true);
      },
      (xhr) => {
        if (xhr.lengthComputable) {
          const progress = (xhr.loaded / xhr.total) * 100;
          setLoadingProgress(progress);
        } else {
          setLoadingProgress((prev) => Math.min(prev + 1, 95));
        }
      },
      (error) => {
        console.error("Erreur lors du chargement du GLB :", error);
      }
    );

    // ✅ MODIFICATION : Boucle d'animation avec post-processing
    const animate = () => {
      requestAnimationFrame(animate);
      const delta = clock.current.getDelta();
      updateMixers(delta);
      controlsRef.current?.update();
      
      // Utiliser le composer si disponible, sinon le renderer normal
      if (composerRef.current) {
        composerRef.current.composer.render();
      } else {
        renderer.render(scene, camera);
      }
    };
    animate();

    return () => {
      renderer.dispose();
      controls.dispose();
      scene.clear();
    };
  }, [config.glb]);

  return (
    <div
      ref={containerRef}
      style={{ height: viewportHeight }}
      className="relative w-screen bg-black"
    >
      <AnimatePresence>
        {showLoaderOverlay && (
          <LoaderOverlay
            isPortrait={isPortrait}
            isMobile={isMobile}
            loadingProgress={loadingProgress}
            isLoaded={isLoaded}
            sceneName={config.name}
            loaderImage={config.loaderImage}
            fontClassName={BullstandRegular.className}
            onStart={() => {
              if (muted) toggleMute();
              setShowLoaderOverlay(false);
            }}
          />
        )}
      </AnimatePresence>
      
      <div className="absolute top-2 right-2 z-50 flex flex-row gap-2 items-end">
        <InfoButton onClick={() => setShowInfoModal(true)} />
      </div>
      
      <div className="absolute bottom-3 right-2 z-50 flex flex-row gap-2 items-end">
        {currentPoi && currentPoi.dialogue && (
          <DialogueButton visible={showDialogue} onToggle={() => setShowDialogue((v) => !v)} />
        )}
        <AnimatePresence>
          {(isPlaying || (!isPlaying && !isEnded && isPaused)) && (
            <SoundButton muted={sceneMuted} onToggle={toggleSceneMute} />
          )}
          {!scenePlaying && (startSoundReady && (isEnded || (!isPlaying && !isPaused))) && (
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
      
      {/* ✅ AJOUT : Contrôles de post-processing (uniquement en dev) */}
      {process.env.NODE_ENV === 'development' && composerRef.current && (
        <PostProcessingControls
          composer={composerRef.current}
          onUpdate={(type, values) => {
            if (!composerRef.current) return;
            if (type === 'bloom') composerRef.current.updateBloom(values.strength, values.radius, values.threshold);
            if (type === 'ssao') composerRef.current.updateSSAO(values.kernelRadius, values.minDistance);
            if (type === 'dof') {
              if ('enabled' in values) composerRef.current.enableDOF(values.enabled);
              else composerRef.current.updateDOF(values.focus, values.aperture, values.maxblur);
            }
            if (type === 'toneMapping') composerRef.current?.updateToneMapping(values.type, values.exposure);
          }}
        />
      )}

      {currentPoi && currentPoi.elements && currentPoi.elements.length > 0 && (
        <POIPlayer
          isPlaying={isPlaying}
          isPaused={isPaused}
          isEnded={isEnded}
          progress={progress}
          duration={duration}
          onTogglePlayPause={togglePlayPause}
          onSeek={seekScene}
          isPortrait={isPortrait}
        />
      )}
      
      {currentPoi && currentPoi.dialogue && showDialogue && (
        <DialogueModal
          dialogue={currentPoi.dialogue}
          progress={progress}
          isPlaying={isPlaying}
          isPortrait={isPortrait}
        />
      )}
      
      <InfoModal
        show={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        credits={config.credits}
        isMobile={useTouchIcons}
        poiIcon={activePOIIcon}
      />
    </div>
  );
}