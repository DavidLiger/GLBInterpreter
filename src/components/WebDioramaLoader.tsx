"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

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

export type DioramaConfig3D = {
  glb: string;
  pois: POI[];
};

export default function WebDioramaLoader({ config }: { config: DioramaConfig3D }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const emptyRefs = useRef<Record<string, THREE.Object3D>>({});
  const [currentPOI, setCurrentPOI] = useState<string | null>(null);

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
    const startPOI = config.pois.find((p) => p.id === "start");
    const current = currentPOI;
    const targetObj = emptyRefs.current[poi.emptyName];
    if (!targetObj) return;

    if (current && current !== "start" && poi.id !== "start" && startPOI) {
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

  // Init THREE.js
  useEffect(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 2, 5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI / 2;
    controls.minDistance = 0.5;
    controls.maxDistance = 20;
    controlsRef.current = controls;

    scene.add(new THREE.AmbientLight(0xffffff, 1));

    const loader = new GLTFLoader();
    loader.load(
      config.glb,
      (gltf) => {
        scene.add(gltf.scene);
        gltf.scene.traverse((child) => {
          if (child.name) emptyRefs.current[child.name] = child;
        });

        const startPOI = config.pois.find((p) => p.id === "start");
        if (startPOI) {
          const startObj = emptyRefs.current[startPOI.emptyName];
          if (startObj) {
            moveCameraTo(startObj, startPOI, false, () => setCurrentPOI("start"));
          }
        }
      },
      undefined,
      (err) => console.error(err)
    );

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!cameraRef.current || !rendererRef.current || !containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      renderer.dispose();
    };
  }, [config.glb]);

  return (
    <div className="relative w-screen h-screen bg-black" ref={containerRef}>
      <div className="absolute top-4 left-4 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {config.pois
            .filter((poi) => poi.id !== currentPOI)
            .map((poi) => (
              <motion.button
                key={poi.id}
                onClick={() => goToPOI(poi)}
                title={poi.label}
                className="bg-white rounded-full p-2"
                initial={{ scale: 0, opacity: 0 }}       // 🔥 Commence invisible et petit
                animate={{ scale: 1, opacity: 1 }}       // 🔥 S'agrandit et devient visible
                exit={{ scale: 0, opacity: 0 }}          // 🔥 Se rétrécit et disparaît
                transition={{ duration: 0.3 }}
              >
                <motion.img
                  src={poi.icon}
                  alt={poi.label}
                  className="w-8 h-8"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ duration: 0.3 }}
                />
              </motion.button>
            ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
