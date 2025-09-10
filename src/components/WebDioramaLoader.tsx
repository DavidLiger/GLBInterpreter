"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

export type POI = {
  id: string;
  label: string;
  emptyName: string;
  icon: string;
  zoom?: number; // distance caméra
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

  const animateCameraMove = (
    fromPos: THREE.Vector3,
    toPos: THREE.Vector3,
    fromTarget: THREE.Vector3,
    toTarget: THREE.Vector3,
    duration = 500
  ) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const startTime = performance.now();
    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const step = (time: number) => {
      const elapsed = time - startTime;
      const t = Math.min(elapsed / duration, 1);
      const tEased = easeInOutCubic(t);

      camera.position.lerpVectors(fromPos, toPos, tEased);
      controls.target.lerpVectors(fromTarget, toTarget, tEased);
      controls.update();

      if (t < 1) requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  };

  const moveCameraTo = (obj: THREE.Object3D, poi: POI, smooth = true) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    // Mise à jour des paramètres OrbitControls selon le POI
    if (poi.minDistance !== undefined) controls.minDistance = poi.minDistance;
    if (poi.maxDistance !== undefined) controls.maxDistance = poi.maxDistance;
    if (poi.minPolarAngle !== undefined) controls.minPolarAngle = poi.minPolarAngle;
    if (poi.maxPolarAngle !== undefined) controls.maxPolarAngle = poi.maxPolarAngle;
    if (poi.minAzimuthAngle !== undefined) controls.minAzimuthAngle = poi.minAzimuthAngle;
    if (poi.maxAzimuthAngle !== undefined) controls.maxAzimuthAngle = poi.maxAzimuthAngle;
    if (poi.enableZoom !== undefined) controls.enableZoom = poi.enableZoom;
    if (poi.enablePan !== undefined) controls.enablePan = poi.enablePan;
    if (poi.dampingFactor !== undefined) controls.dampingFactor = poi.dampingFactor;

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
      animateCameraMove(camera.position.clone(), finalPos, controls.target.clone(), targetPos);
    } else {
      camera.position.copy(finalPos);
      controls.target.copy(targetPos);
      controls.update();
    }
  };

  const goToPOI = (poi: POI) => {
    const targetObj = emptyRefs.current[poi.emptyName];
    if (targetObj) moveCameraTo(targetObj, poi, true);
  };

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
          if (startObj) moveCameraTo(startObj, startPOI, false);
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
        {config.pois.map((poi) => (
          <button
            key={poi.id}
            onClick={() => goToPOI(poi)}
            className="bg-white rounded-full p-2 hover:scale-110 transition"
            title={poi.label}
          >
            <img src={poi.icon} alt={poi.label} className="w-8 h-8" />
          </button>
        ))}
      </div>
    </div>
  );
}
