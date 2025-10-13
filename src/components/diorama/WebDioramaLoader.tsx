"use client";

import React, { useEffect, useRef, useState } from "react";
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
import POIButtons from "./ui/POIButtons";
import RotateHint from "./ui/RotateHint";
import { applyVideoTextures } from "./rendering/applyVideos";
import { applyLights } from "./rendering/applyLights"; 
import { applyBulbs } from "./rendering/applyBulbs";
import { useOrientation } from "./hooks/useOrientation";
import { useFullscreen } from "./hooks/useFullscreen";
import { useResize } from "./hooks/useResize";
import { usePOIAnimations } from "./hooks/usePOIAnimations";
import { POI, POIWithElements } from "@/types/diorama"; 
import POIPlayer from "@/components/diorama/ui/POIPlayer";
import { usePOIScenePlayer } from "@/components/diorama/hooks/usePOIScenePlayer";
import DialogueModal from "./ui/DialogueModal";
import DialogueButton from "./ui/DialogueButton";
import InfoButton from "./ui/InfoButton";
import InfoModal from "./ui/InfoModal";
import POIBreadcrumbs from "./ui/POIBreadcrumbs";


const BullstandRegular = localFont({
  src: "../../../public/fonts/Bullstand-Regular.ttf",
  variable: "--font-Bullstand-Regular",
});

export default function WebDioramaLoader({ config }: { config: DioramaConfig3D }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const { isPortrait, showRotateHint } = useOrientation(5000);
  const [loadingProgress, setLoadingProgress] = useState(0);
  // const [scenePlaying, setScenePlaying] = useState(false);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const emptyRefs = useRef<Record<string, THREE.Object3D>>({});
  const { mixerRef, initMixers, playPOIAnimations, stopAllAnimations, updateMixers } =
  usePOIAnimations(emptyRefs);
  const clock = useRef(new THREE.Clock());
  const { currentPOI, goToPOI, getVisiblePOIs, findParentPOI, moveCameraTo, setCurrentPOI, findPOIRecursively } = usePOINavigation(
    config,
    cameraRef,
    controlsRef,
    emptyRefs
  );
  const currentPoi = currentPOI ? findPOIRecursively(currentPOI) : null;
  // const [muted, setMuted] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(true);
  const [playerState, setPlayerState] = useState<"idle" | "playing" | "paused" | "ended">("idle");
  const [showLoaderOverlay, setShowLoaderOverlay] = useState(true);
  const [viewportHeight, setViewportHeight] = useState<number>(0);
  const [windowHeight, setWindowHeight] = useState<number>(0);
  const [showDialogue, setShowDialogue] = useState(true);
  const [showInfoModal, setShowInfoModal] = useState(false);


  // const { startSoundReady, ambientAudioRefs } = usePOIAudio(config.pois, currentPOI, muted);
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
  onScenePlayingChange: (playing) => {
    // tu peux mettre à jour un state local si besoin
  },
});

const {
    isPlaying,
    isPaused,
    isEnded,
    progress,   // ← c’est ça qu’il faut utiliser
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
});

const activePOIIcon = React.useMemo(() => {
  if (!currentPOI) return undefined;

  const active = findPOIRecursively(currentPOI);
  if (!active) return undefined;

  // Dernier enfant ? -> prendre icône du parent
  const parent = findParentPOI(active.id);
  if (parent && (!active.children || active.children.length === 0)) {
    return parent.icon ?? active.icon;
  }

  return active.icon;
}, [currentPOI, findPOIRecursively, findParentPOI]);


  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768); // seuil à ajuster selon ton design
    };

    checkIsMobile(); // première détection immédiate
    window.addEventListener("resize", checkIsMobile);
    return () => window.removeEventListener("resize", checkIsMobile);
  }, []);

  // Resize helper
  const updateRendererSize = () => {
    const w = containerRef.current?.clientWidth;
    const h = containerRef.current?.clientHeight;
    if (!w || !h || !cameraRef.current || !rendererRef.current) return;
    cameraRef.current.aspect = w / h;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(w, h);
  };
  // ✅ hooks
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(containerRef, () => setTimeout(updateRendererSize, 50));
  useResize(updateRendererSize);

  useEffect(() => {
    const updateVH = () => {
      const vh = window.visualViewport?.height || window.innerHeight;
      setViewportHeight(vh);
      setWindowHeight(window.innerHeight);
      updateRendererSize();
    };

    // initial call
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
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

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

    loader.load(config.glb, (gltf: GLTF) => {
      scene.add(gltf.scene);
      sceneRef.current = scene;

      // 🔹 Stocker les animations dans scene.userData pour les POI suivants
      scene.userData.gltfAnimations = gltf.animations;
      gltf.scene.traverse((child) => {
        if (!child.name) return;

        // ✅ on stocke tout ce qui a un nom
        emptyRefs.current[child.name] = child;

        // 🦴 Si c’est un SkinnedMesh → on crée un mixer sur son armature
        if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
          const skinned = child as THREE.SkinnedMesh;
          const armature = skinned.skeleton?.bones?.[0]?.parent;

          if (armature && !mixerRef.current[armature.name]) {
            mixerRef.current[armature.name] = new THREE.AnimationMixer(armature);
          } else if (!mixerRef.current[skinned.name]) {
            mixerRef.current[skinned.name] = new THREE.AnimationMixer(skinned);
          }
        }

        // 💠 Si c’est un Mesh simple (ex : pour morph targets)
        else if ((child as THREE.Mesh).isMesh && !mixerRef.current[child.name]) {
          mixerRef.current[child.name] = new THREE.AnimationMixer(child);
        }

        // 🩻 Si c’est un Bone ou un objet nommé “Armature”
        else if (child.type === "Bone" || child.name.toLowerCase().includes("armature")) {
          if (!mixerRef.current[child.name]) {
            mixerRef.current[child.name] = new THREE.AnimationMixer(child);
          }
        }
      });
      // console.log("🧩 emptyRefs:", Object.keys(emptyRefs.current));
      // console.log("🎬 Animations:", gltf.animations.map(a => a.name));  
      initMixers(gltf.scene);

      // 🔹 Appliquer vidéos, lumières, bulbs
      applyVideoTextures(gltf.scene, emptyRefs.current, (config as DioramaConfig3DWithVideos).videos);
      applyLights(gltf.scene, emptyRefs.current, (config as DioramaConfig3DWithVideos).lights);
      applyBulbs(gltf.scene, emptyRefs.current, (config as any).bulbs);

      // 🔹 Démarrage sur le POI start
      const startPOI = (config.pois as POIWithElements[]).find(p => p.id === "start");
      if (startPOI) {
        const startObj = emptyRefs.current[startPOI.emptyName];
        if (startObj) moveCameraTo(startObj, startPOI, false, () => setCurrentPOI("start"));
        playPOIAnimations(startPOI, gltf.animations);
      }

      setIsLoaded(true);
    },
    (xhr) => {
      // ➤ Pendant le chargement (progression)
      if (xhr.lengthComputable) {
        const progress = (xhr.loaded / xhr.total) * 100;
        setLoadingProgress(progress);
      } else {
        // Fallback si le serveur ne fournit pas Content-Length
        setLoadingProgress((prev) => Math.min(prev + 1, 95));
      }
    },
    (error) => {
      console.error("Erreur lors du chargement du GLB :", error);
    });

    const animate = () => {
      requestAnimationFrame(animate);
      const delta = clock.current.getDelta();
      updateMixers(delta);
      controlsRef.current?.update();
      renderer.render(scene, camera);
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
              // 🔈 Unmute général (débloquer audio)
              if (muted) toggleMute();
              // cacher l'overlay pour révéler la scène
              setShowLoaderOverlay(false);
            }}
          />
        )}
      </AnimatePresence>
      <div
        className="absolute top-2 right-2 z-50 flex flex-row gap-2 items-end"
      >
        <InfoButton onClick={() => setShowInfoModal(true)} />
      </div>


      {/* Boutons bas à droite */}
      <div
        className="absolute bottom-3 right-2 z-50 flex flex-row gap-2 items-end"
      >
        {/* 👇 Bouton pour afficher / cacher la modale de dialogue */}
        {currentPoi && currentPoi.dialogue &&
          <DialogueButton visible={showDialogue} onToggle={() => setShowDialogue(v => !v)} />
        }
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
      />
      <RotateHint show={showRotateHint} />

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
        />
      )}
      <InfoModal
        show={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        credits={config.credits}
        isMobile={isMobile}
        poiIcon={activePOIIcon}
      />
    </div>
  );
}