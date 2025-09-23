"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import localFont from "next/font/local";

const BullstandRegular = localFont({
  src: "../../public/fonts/Bullstand-Regular.ttf",
  variable: "--font-Bullstand-Regular",
});

export type POI = {
  id: string;
  label: string;
  emptyName: string;
  icon: string;
  zoom?: number;
  lookAxis?: "x" | "y" | "z";
  minDistance?: number;
  maxDistance?: number;
  minPolarAngle?: number;
  maxPolarAngle?: number;
  minAzimuthAngle?: number;
  maxAzimuthAngle?: number;
  enableZoom?: boolean;
  enablePan?: boolean;
  dampingFactor?: number;
  children?: POI[]; // 🔥 AJOUT
  ambientSound?: string; // 🔥 chemin vers le son d'ambiance pour ce POI
};


export type OrbitParams = {
  minDistance?: number;
  maxDistance?: number;
  minPolarAngle?: number;
  maxPolarAngle?: number;
  minAzimuthAngle?: number;
  maxAzimuthAngle?: number;
  enableZoom?: boolean;
  enablePan?: boolean;
  dampingFactor?: number;
};

export type DioramaVideo = {
  name: string;          // Object name in Blender
  src: string;           // Path to the video
  materialIndex?: number; // Optional: which material index to apply it to
  loop?: boolean;        // Default true
  muted?: boolean;       // Default true
  autoplay?: boolean;    // Default true
};

export type DioramaLight = {
  type: "ambient" | "directional" | "spot";
  emptyName?: string; // optionnel, seulement pour les spots
  color?: number;
  intensity?: number;
  distance?: number; // pour spot
  angle?: number;    // pour spot
  penumbra?: number; // pour spot
};

export type DioramaBulb = {
  emptyName: string; // mesh représentant l'ampoule
  color?: number;
  intensity?: number; // intensité de la lumière réelle
  distance?: number; // portée
  emissiveIntensity?: number; // intensité d'émission du matériau
};

export type ToonOutlineConfig = {
  defaultThickness?: number; // épaisseur du contour
  defaultColor?: [number, number, number]; // RGB 0-1 ou 0-255
  defaultAlpha?: number; // opacité
  defaultKeepAlive?: boolean; // garde le contour actif
};

export type DioramaConfig3D = {
  glb: string;
  name: string;
  pois: POI[];
  videos?: DioramaVideo[];
  loaderImage?: string;
  lights?: DioramaLight[];
  bulbs?: DioramaBulb[];
  toonOutline?: ToonOutlineConfig; // 🔥 nouvel objet
};

export type DioramaConfig3DWithVideos = DioramaConfig3D & {
  videos?: DioramaVideo[];
  loaderImage?: string;
};

export default function WebDioramaLoader({ config }: { config: DioramaConfig3D }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const emptyRefs = useRef<Record<string, THREE.Object3D>>({});
  const [currentPOI, setCurrentPOI] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [showRotateHint, setShowRotateHint] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    const checkMobile = () => {
      // matchMedia renvoie true si l'écran est petit
      setIsMobile(window.matchMedia("(pointer: coarse)").matches);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // helper pour (ré)ajuster la taille du renderer / camera
  const updateRendererSize = () => {
    const w = containerRef.current?.clientWidth;
    const h = containerRef.current?.clientHeight;
    if (!w || !h || !cameraRef.current || !rendererRef.current) return;
    cameraRef.current.aspect = w / h;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(w, h);
  };

  // écoute les changements de fullscreen (cross-browser)
  useEffect(() => {
    const handleFsChange = () => {
      const fs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(fs);
      // ajuste la taille du canvas quand le fullscreen change
      // (utile si tu as supprimé l'écoute resize)
      setTimeout(updateRendererSize, 50);
    };

    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange as any);
    document.addEventListener("mozfullscreenchange", handleFsChange as any);
    document.addEventListener("MSFullscreenChange", handleFsChange as any);

    // init état
    handleFsChange();

    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange as any);
      document.removeEventListener("mozfullscreenchange", handleFsChange as any);
      document.removeEventListener("MSFullscreenChange", handleFsChange as any);
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      // petit délai pour laisser le navigateur recalculer les dimensions
      setTimeout(() => updateRendererSize(), 100);
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);

    // premier ajustement
    updateRendererSize();

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.matchMedia("(orientation: portrait)").matches);
    };
    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    return () => window.removeEventListener("resize", checkOrientation);
  }, []);

  // surveille l’orientation
  useEffect(() => {
    if (isPortrait) {
      setShowRotateHint(true);
      const timer = setTimeout(() => setShowRotateHint(false), 5000); // cache après 3s
      return () => clearTimeout(timer);
    } else {
      setShowRotateHint(false);
    }
  }, [isPortrait]);

  const animateCameraMove = (
    fromPos: THREE.Vector3,
    toPos: THREE.Vector3,
    fromTarget: THREE.Vector3,
    toTarget: THREE.Vector3,
    fromOrbit?: OrbitParams,
    toPOI?: POI,
    duration = 500,
    onComplete?: () => void
  ) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const startTime = performance.now();
    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const lerp = (from?: number, to?: number, t = 0) =>
      from !== undefined && to !== undefined ? from + (to - from) * t : to ?? from;

    const step = (time: number) => {
      const elapsed = time - startTime;
      const tRaw = Math.min(elapsed / duration, 1);
      const t = easeInOutCubic(tRaw);

      camera.position.lerpVectors(fromPos, toPos, t);
      controls.target.lerpVectors(fromTarget, toTarget, t);

      controls.minDistance = lerp(fromOrbit?.minDistance, toPOI?.minDistance, t) ?? controls.minDistance;
      controls.maxDistance = lerp(fromOrbit?.maxDistance, toPOI?.maxDistance, t) ?? controls.maxDistance;
      controls.minPolarAngle = lerp(fromOrbit?.minPolarAngle, toPOI?.minPolarAngle, t) ?? controls.minPolarAngle;
      controls.maxPolarAngle = lerp(fromOrbit?.maxPolarAngle, toPOI?.maxPolarAngle, t) ?? controls.maxPolarAngle;
      controls.minAzimuthAngle = lerp(fromOrbit?.minAzimuthAngle, toPOI?.minAzimuthAngle, t) ?? controls.minAzimuthAngle;
      controls.maxAzimuthAngle = lerp(fromOrbit?.maxAzimuthAngle, toPOI?.maxAzimuthAngle, t) ?? controls.maxAzimuthAngle;
      controls.dampingFactor = lerp(fromOrbit?.dampingFactor, toPOI?.dampingFactor, t) ?? controls.dampingFactor;

      controls.enableZoom = t < 1 ? fromOrbit?.enableZoom ?? controls.enableZoom : toPOI?.enableZoom ?? controls.enableZoom;
      controls.enablePan = t < 1 ? fromOrbit?.enablePan ?? controls.enablePan : toPOI?.enablePan ?? controls.enablePan;

      controls.update();
      if (tRaw < 1) requestAnimationFrame(step);
      else if (onComplete) onComplete();
    };

    requestAnimationFrame(step);
  };

  const moveCameraTo = (obj: THREE.Object3D, poi: POI, smooth = true, onComplete?: () => void) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const distance = poi.zoom ?? 3;
    const axis = poi.lookAxis ?? "x";
    const offset = new THREE.Vector3(
      axis === "x" ? distance : 0,
      axis === "y" ? distance : 0,
      axis === "z" ? distance : 0
    );

    const targetPos = obj.position.clone();
    const finalPos = targetPos.clone().add(offset);

    if (smooth) {
      const currentOrbit: OrbitParams = {
        minDistance: controls.minDistance,
        maxDistance: controls.maxDistance,
        minPolarAngle: controls.minPolarAngle,
        maxPolarAngle: controls.maxPolarAngle,
        minAzimuthAngle: controls.minAzimuthAngle,
        maxAzimuthAngle: controls.maxAzimuthAngle,
        enableZoom: controls.enableZoom,
        enablePan: controls.enablePan,
        dampingFactor: controls.dampingFactor,
      };

      animateCameraMove(
        camera.position.clone(),
        finalPos,
        controls.target.clone(),
        targetPos,
        currentOrbit,
        poi,
        700,
        onComplete
      );
    } else {
      camera.position.copy(finalPos);
      controls.target.copy(targetPos);
      Object.assign(controls, {
        minDistance: poi.minDistance ?? controls.minDistance,
        maxDistance: poi.maxDistance ?? controls.maxDistance,
        minPolarAngle: poi.minPolarAngle ?? controls.minPolarAngle,
        maxPolarAngle: poi.maxPolarAngle ?? controls.maxPolarAngle,
        minAzimuthAngle: poi.minAzimuthAngle ?? controls.minAzimuthAngle,
        maxAzimuthAngle: poi.maxAzimuthAngle ?? controls.maxAzimuthAngle,
        enableZoom: poi.enableZoom ?? controls.enableZoom,
        enablePan: poi.enablePan ?? controls.enablePan,
        dampingFactor: poi.dampingFactor ?? controls.dampingFactor,
      });
      controls.update();
      if (onComplete) onComplete();
    }
  };

  const goToPOI = (poi: POI) => {
    const targetObj = emptyRefs.current[poi.emptyName];
    if (!targetObj) return;

    const current = currentPOI;
    const parent = current ? findParentPOI(config.pois, current) : null;

    const goingToChild = current && poi && findParentPOI(config.pois, poi.id)?.id === current;
    const goingToParent = parent?.id === poi.id;

    // 🔥 Si on descend vers un enfant OU qu'on remonte, pas de passage par start
    if (goingToChild || goingToParent) {
      moveCameraTo(targetObj, poi, true, () => setCurrentPOI(poi.id));
      return;
    }

    // 🔥 Si on va vers start → direct
    if (poi.id === "start") {
      moveCameraTo(targetObj, poi, true, () => setCurrentPOI(poi.id));
      return;
    }

    // 🔥 Sinon (navigation libre) → passe par start
    const startPOI = config.pois.find((p) => p.id === "start");
    if (startPOI) {
      const startObj = emptyRefs.current[startPOI.emptyName];
      if (startObj) {
        moveCameraTo(startObj, startPOI, true, () => {
          moveCameraTo(targetObj, poi, true, () => setCurrentPOI(poi.id));
        });
      }
    } else {
      moveCameraTo(targetObj, poi, true, () => setCurrentPOI(poi.id));
    }
  };

  const findParentPOI = (
    pois: POI[],
    childId: string
  ): POI | null => {
    for (const poi of pois) {
      if (poi.children?.some((c) => c.id === childId)) {
        return poi; // trouvé
      }
      if (poi.children) {
        const parent = findParentPOI(poi.children, childId);
        if (parent) return parent;
      }
    }
    return null;
  };

  const getVisiblePOIs = () => {
    if (!currentPOI) return config.pois;

    const activePOI =
      config.pois.find((p) => p.id === currentPOI) ||
      findPOIRecursively(config.pois, currentPOI);

    const parent = findParentPOI(config.pois, currentPOI);

    if (parent) {
      // 🔥 Si on est sur un enfant, montrer ses frères et ses enfants éventuels
      const siblings = parent.children?.filter((p) => p.id !== currentPOI) ?? [];
      const children = activePOI?.children ?? [];
      return [...siblings, ...children];
    } else {
      // 🔥 Si on est sur un POI racine
      const siblings = config.pois.filter((p) => p.id !== currentPOI);
      const children = activePOI?.children ?? [];
      return [...siblings, ...children];
    }
  };

  const findPOIRecursively = (pois: POI[], id: string): POI | null => {
    for (const poi of pois) {
      if (poi.id === id) return poi;
      if (poi.children) {
        const found = findPOIRecursively(poi.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const parentPOI = currentPOI ? findParentPOI(config.pois, currentPOI) : null;

  const applyVideoTextures = (videos?: DioramaVideo[]) => {
    if (!videos || !sceneRef.current) return;

    videos.forEach(({ name, src, materialIndex, loop = true, muted = true, autoplay = true }) => {
      const obj = emptyRefs.current[name];
      if (!obj || !(obj as THREE.Mesh).isMesh) return;

      const mesh = obj as THREE.Mesh;
      const video = document.createElement("video");
      video.src = src;
      video.loop = loop;
      video.muted = muted;
      video.playsInline = true;

      // ✅ Attendre que la vidéo ait chargé suffisamment de données
      video.addEventListener("loadeddata", () => {
        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;

        const setMap = (mat: THREE.Material) => {
          const m = mat as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
          if ("map" in m) {
            m.map = texture;
            m.needsUpdate = true;
          }
        };

        if (typeof materialIndex === "number" && Array.isArray(mesh.material)) {
          const mat = mesh.material[materialIndex];
          if (mat) setMap(mat);
        } else if (Array.isArray(mesh.material)) {
          mesh.material.forEach((mat) => setMap(mat));
        } else {
          setMap(mesh.material);
        }

        if (autoplay) {
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              console.warn(`Autoplay bloqué pour la vidéo ${name}:`, err);
            });
          }
        }
      });

      // Charger la vidéo
      video.load();
    });
  };

  const applyLights = (lights?: DioramaLight[]) => {
    if (!lights || !sceneRef.current) return;

    lights.forEach((lightCfg) => {
      let light: THREE.Light;

      if (lightCfg.type === "ambient") {
        light = new THREE.AmbientLight(
          lightCfg.color ?? 0xffffff,
          lightCfg.intensity ?? 0.5
        );
        sceneRef.current!.add(light);

      } else if (lightCfg.type === "spot" && lightCfg.emptyName) {
        const posObj = emptyRefs.current[lightCfg.emptyName];
        if (!posObj) {
          console.warn(`Spot position empty not found: ${lightCfg.emptyName}`);
          return;
        }

        const spot = new THREE.SpotLight(
          lightCfg.color ?? 0xffffff,
          lightCfg.intensity ?? 1,
          lightCfg.distance ?? 15,
          lightCfg.angle ?? Math.PI / 6,
          lightCfg.penumbra ?? 0.1
        );

        spot.position.copy(posObj.position);
        spot.castShadow = true;
        spot.shadow.mapSize.width = 1024;
        spot.shadow.mapSize.height = 1024;

        // Chercher un empty target optionnel
        const targetName = lightCfg.emptyName + "_target"; 
        const targetObj = emptyRefs.current[targetName];

        if (targetObj) {
          spot.target = targetObj;
        } else {
          // fallback : créer un target 1m plus bas
          const lookAt = new THREE.Object3D();
          lookAt.position.set(
            posObj.position.x,
            posObj.position.y - 1,
            posObj.position.z
          );
          sceneRef.current!.add(lookAt);
          spot.target = lookAt;
        }

        sceneRef.current!.add(spot);
        sceneRef.current!.add(spot.target);
      }
    });
  };

  const applyBulbs = (bulbs?: DioramaBulb[]) => {
    if (!bulbs || !sceneRef.current) return;

    bulbs.forEach((b) => {
      const bulbObj = emptyRefs.current[b.emptyName!];
      if (!bulbObj || !(bulbObj as THREE.Mesh).isMesh) return;

      const mesh = bulbObj as THREE.Mesh;

      // 1️⃣ Émission sur le matériau
      const color = new THREE.Color(b.color ?? 0xffffff);
      const emissiveIntensity = b.emissiveIntensity ?? 1;
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => {
          const m = mat as THREE.MeshStandardMaterial;
          m.emissive = color;
          m.emissiveIntensity = emissiveIntensity;
          m.needsUpdate = true;
        });
      } else {
        const m = mesh.material as THREE.MeshStandardMaterial;
        m.emissive = color;
        m.emissiveIntensity = emissiveIntensity;
        m.needsUpdate = true;
      }

      // 2️⃣ Lumière réelle
      // const pointLight = new THREE.PointLight(color, b.intensity ?? 1, b.distance ?? 10);
      // pointLight.position.copy(mesh.position);
      // sceneRef.current!.add(pointLight);
    });
  };

// 🔥 Charger le son d'ambiance du POI courant
  useEffect(() => {
    if (!currentPOI) return;
    const poi = findPOIRecursively(config.pois, currentPOI);
    if (!poi || !poi.ambientSound) return;

    if (!ambientAudioRef.current) {
      ambientAudioRef.current = new Audio(poi.ambientSound);
      ambientAudioRef.current.loop = true;
      ambientAudioRef.current.muted = true; // démarre en mute
      ambientAudioRef.current.play().catch(() => {});
    } else {
      ambientAudioRef.current.src = poi.ambientSound;
      ambientAudioRef.current.muted = muted;
      ambientAudioRef.current.play().catch(() => {});
    }
  }, [currentPOI]);

  // 🔊 Mettre à jour le son quand mute change
  useEffect(() => {
    if (ambientAudioRef.current) {
      ambientAudioRef.current.muted = muted;
      if (!muted) ambientAudioRef.current.play().catch(() => {});
    }
  }, [muted]);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // ────────────── Init scene, camera, renderer ──────────────
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

    // ────────────── Load GLB avec loader progress ──────────────
    const loader = new GLTFLoader();
    const loadStartTime = performance.now(); // pour temps minimum 3s

    loader.load(
      config.glb,
      (gltf) => {
        scene.add(gltf.scene);
        gltf.scene.traverse((child) => {
          if (child.name) emptyRefs.current[child.name] = child;
        });

        // Appliquer vidéos, lights et bulbs
        applyVideoTextures((config as DioramaConfig3DWithVideos).videos);
        applyLights((config as DioramaConfig3DWithVideos).lights);
        applyBulbs((config as any).bulbs);

        const startPOI = config.pois.find((p) => p.id === "start");
        if (startPOI) {
          const startObj = emptyRefs.current[startPOI.emptyName];
          if (startObj) moveCameraTo(startObj, startPOI, false, () => setCurrentPOI("start"));
        }

        // 🔹 Temps minimum de 3s avant de cacher le loader
        const elapsed = performance.now() - loadStartTime;
        const remaining = Math.max(3000 - elapsed, 0);
        setTimeout(() => setIsLoaded(true), remaining);
      },
      (xhr) => {
        let progress = 0;
        if (xhr.total) {
          progress = (xhr.loaded / xhr.total) * 100;
        }

        // clamp à 0-100
        progress = Math.min(Math.max(progress, 0), 100);

        setLoadingProgress(Math.round(progress));
      },
      (err) => console.error(err)
    );

    // ────────────── Animation loop ──────────────
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
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
      {/* ────────────── Screen loader overlay ────────────── */}
    <AnimatePresence>
      {!isLoaded && (
        <motion.div
          className="absolute inset-0 flex flex-col items-center justify-center bg-black z-100 px-4"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Title en haut */}
          <h1
            className={`${BullstandRegular.className} text-white text-5xl mb-8`}
          >
            {config.name ?? "Scene Diorama"}
          </h1>

          {/* Belle image au centre, plus grande */}
          <img
            src={config.loaderImage ?? "/icons/dioramas/UI/scene-preview.png"}
            alt="Scene Preview"
            className="w-64 h-64 mb-8 object-contain"
          />

          {/* Instructions côte à côte */}
          <div className="flex items-center justify-center gap-12 mb-6">
            <div className="flex flex-col items-center gap-2 text-white">
              <img
                src={
                  isMobile
                    ? "/icons/dioramas/UI/one-finger.png"
                    : "/icons/dioramas/UI/mouse-left-click.png"
                }
                className="w-10 h-10"
              />
              <span>{isMobile ? "Tourner" : "Cliquer / Glisser"}</span>
            </div>
            <div className="flex flex-col items-center gap-2 text-white">
              <img
                src={
                  isMobile
                    ? "/icons/dioramas/UI/two-fingers.png"
                    : "/icons/dioramas/UI/mouse-scroll.png"
                }
                className="w-10 h-10"
              />
              <span>{isMobile ? "Zoomer" : "Zoomer"}</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-80 h-4 bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-green-500"
              initial={{ width: 0 }}
              animate={{ width: `${loadingProgress}%` }}
              transition={{ ease: "easeOut", duration: 0.2 }}
            />
          </div>
          <span className="text-white mt-2">{Math.round(loadingProgress)}%</span>
        </motion.div>
      )}
    </AnimatePresence>

    {/* ────────────── Boutons et POIs ────────────── */}
      {/* 🔊 Boutons top-right */}
      <div className="absolute top-4 right-4 z-50 flex flex-col gap-3 items-end">
        <button
          onClick={() => setMuted(!muted)}
          className="bg-white text-white rounded-full w-12 h-12 flex items-center justify-center"
          title={muted ? "Activer le son" : "Couper le son"}
        >
          {/* {muted ? "🔇" : "🔊"} */}
          <img
            src={muted ? "/icons/dioramas/UI/muted.png" : "/icons/dioramas/UI/sound.png"}
            alt={muted ? "Muet" : "Son"}
            className="w-8 h-8 object-contain"
          />
        </button>

        <motion.button
          key="fullscreen"
          onClick={async () => {
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
            title="Plein écran"
          className="bg-white text-white rounded-full w-12 h-12 flex items-center justify-center"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* {isFullscreen ? "🡼" : "⛶"} */}
          <img
            src={isFullscreen ? "/icons/dioramas/UI/fullscreen-exit.png" : "/icons/dioramas/UI/fullscreen.png"}
            alt={isFullscreen ? "Quitter plein écran" : "Plein écran"}
            className="w-8 h-8 object-contain"
          />
        </motion.button>
      </div>

      {/* 🔙 Boutons POIs à gauche */}
      <div className="absolute top-4 left-4 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {parentPOI && (
            <motion.button
              key="back"
              onClick={() => goToPOI(parentPOI)}
              title="Retour"
              className="bg-white text-white rounded-full w-12 h-12 flex items-center justify-center"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* 🔙 */}
              <img
                src={"/icons/dioramas/UI/back.png"}
                alt={"Retour"}
                className="w-8 h-8 object-contain"
              />
            </motion.button>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {getVisiblePOIs().map((poi) => (
            <motion.button
              key={poi.id}
              onClick={() => goToPOI(poi)}
              title={poi.label}
              className="bg-white rounded-full w-12 h-12 flex items-center justify-center"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <motion.img
                src={poi.icon}
                alt={poi.label}
                className="w-8 h-8 object-contain"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ duration: 0.3 }}
              />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {showRotateHint && (
          <motion.div
            className="absolute top-4 inset-x-0 z-50 flex justify-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }} // 0.5s fade
          >
            <img
              src="/icons/dioramas/UI/rotate-phone.png"
              alt="Tournez le téléphone"
              className="w-32 h-20 opacity-80"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );


}