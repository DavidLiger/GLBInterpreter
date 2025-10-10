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
  const { currentPOI, goToPOI, getVisiblePOIs, findParentPOI, moveCameraTo, setCurrentPOI, findPOIRecursively } = usePOINavigation(
    config,
    cameraRef,
    controlsRef,
    emptyRefs
  );
  const currentPoi = currentPOI ? findPOIRecursively(currentPOI) : null;
  const [muted, setMuted] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(true);
  const { startSoundReady, ambientAudioRefs } = usePOIAudio(config.pois, currentPOI, muted);
  const {
    isPlaying,
    isPaused,
    isEnded,
    progress,
    duration,
    togglePlayPause,
    seekScene,
  } = usePOIScenePlayer({
    poi: currentPoi,
    animations: sceneRef.current?.userData?.gltfAnimations || [],
    mixerRef: mixerRef.current,
    ambientAudioRefs: ambientAudioRefs.current,
  });

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
    <div className="relative w-screen h-screen bg-black" ref={containerRef}>
      <AnimatePresence>
        {!isLoaded && (
          <LoaderOverlay
            isPortrait={isPortrait}
            isMobile={isMobile}
            loadingProgress={loadingProgress}
            sceneName={config.name}
            loaderImage={config.loaderImage}
            fontClassName={BullstandRegular.className}
          />
        )}
      </AnimatePresence>
      <div className="absolute top-4 right-4 z-50 flex flex-col gap-3 items-end">
        { startSoundReady &&
            <SoundButton muted={muted} onToggle={() => setMuted((m) => !m)} />
        }
        <FullscreenButton
          isFullscreen={isFullscreen}
          onToggle={async () => {
            const el = containerRef.current;
            if (!el) return;

            try {
              if (!isFullscreen) {
                const req = (el.requestFullscreen ??
                            (el as any).webkitRequestFullscreen ??
                            (el as any).mozRequestFullScreen ??
                            (el as any).msRequestFullscreen) as any;
                if (req) await req.call(el);
              } else {
                const exit = (document.exitFullscreen ??
                              (document as any).webkitExitFullscreen ??
                              (document as any).mozCancelFullScreen ??
                              (document as any).msExitFullscreen) as any;
                if (exit) await exit.call(document);
              }
            } catch (err) {
              console.warn("Fullscreen API error:", err);
            }
          }}
        />
      </div>

      {/* 🔙 Boutons POIs à gauche */}
      <POIButtons
          parentPOI={parentPOI}
          visiblePOIs={getVisiblePOIs()}
          goToPOI={goToPOI}
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
        />
      )}
    </div>
  );
}