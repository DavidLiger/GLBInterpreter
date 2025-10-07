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
import { POI, POIWithElements } from "@/types/diorama"; 

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
  // 🔹 Types utiles

  interface Mixers {
    mixerArmature?: THREE.AnimationMixer;
    mixerEmpty?: THREE.AnimationMixer;
  }
  const mixerRef = useRef<Record<string, THREE.AnimationMixer>>({});
  const clock = useRef(new THREE.Clock());
  const { currentPOI, goToPOI, getVisiblePOIs, findParentPOI, moveCameraTo, setCurrentPOI } = usePOINavigation(
    config,
    cameraRef,
    controlsRef,
    emptyRefs
  );
  const [muted, setMuted] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(true);
  const { startSoundReady, ambientAudioRefs } = usePOIAudio(config.pois, currentPOI, muted);

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

  function findArmature(obj: THREE.Object3D): THREE.Object3D | undefined {
    if (obj.type === "Skeleton" || obj.type === "Bone" || obj.type === "SkinnedMesh" || obj.name.toLowerCase().includes("armature")) {
      return obj;
    }
    for (const child of obj.children) {
      const result = findArmature(child);
      if (result) {
        console.log(result)
        return result;
      }
    }
    return undefined;
  }

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
    const mixers: Record<string, THREE.AnimationMixer> = {};

    loader.load(config.glb, (gltf: GLTF) => {
    scene.add(gltf.scene);

    // Stocker toutes les références nommées
    gltf.scene.traverse((child) => {
      if (child.name) emptyRefs.current[child.name] = child;

      // Créer un mixer pour chaque armature trouvée
      if (child.type === "SkinnedMesh" && child.parent) {
        const armature = child.parent;
        if (!mixerRef.current[armature.name]) {
          mixerRef.current[armature.name] = new THREE.AnimationMixer(armature);
        }
      }
    });

    // Appliquer les assets de la scène
    applyVideoTextures(gltf.scene, emptyRefs.current, (config as DioramaConfig3DWithVideos).videos);
    applyLights(gltf.scene, emptyRefs.current, (config as DioramaConfig3DWithVideos).lights);
    applyBulbs(gltf.scene, emptyRefs.current, (config as any).bulbs);

    // Positionner la caméra sur le POI start
    const startPOI = (config.pois as POIWithElements[]).find(p => p.id === "start");
    if (startPOI) {
      const startObj = emptyRefs.current[startPOI.emptyName];
      if (startObj) moveCameraTo(startObj, startPOI, false, () => setCurrentPOI("start"));

      // Jouer les animations associées à ce POI
      startPOI.elements?.forEach(el => {
        const target = emptyRefs.current[el.name];
        const mixer = mixerRef.current[target?.name || ""] || new THREE.AnimationMixer(target);
        const clip = gltf.animations.find(a => a.name.toLowerCase() === el.clipName.toLowerCase());
        if (clip) {
          const action = mixer.clipAction(clip);
          action.setLoop(el.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
          if (el.autoplay) action.play();
          mixerRef.current[target?.name || ""] = mixer;
        }
      });
    }

    setIsLoaded(true);
  });


  const animate = () => {
    requestAnimationFrame(animate);
    const delta = clock.current.getDelta();

    Object.values(mixerRef.current).forEach(m => m.update(delta));
    controlsRef.current?.update();

    if (effect) {
      effect.render(scene, camera);
    } else {
      renderer.render(scene, camera);
    }
  };
  animate();



    return () => renderer.dispose();
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
    </div>
  );
}