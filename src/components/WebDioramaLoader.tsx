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
  lookAxis?: "x" | "y" | "z"; // axe de visée configurable
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

  // --- UTILS ---
  const easeInOutCubic = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const getWorldAxis = (obj: THREE.Object3D, axis: "x" | "y" | "z" = "x") => {
    const v = new THREE.Vector3();
    obj.updateMatrixWorld(true);
    const colIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    v.setFromMatrixColumn(obj.matrixWorld, colIndex);
    return v.normalize();
  };

  const moveCameraTo = (
    targetObj: THREE.Object3D,
    distance = 3,
    lookAxis: "x" | "y" | "z" = "x",
    animate = true
  ) => {
    if (!cameraRef.current || !controlsRef.current) return;

    const camera = cameraRef.current;
    const controls = controlsRef.current;

    targetObj.updateMatrixWorld(true);
    const axis = getWorldAxis(targetObj, lookAxis);

    const finalPos = targetObj.position
      .clone()
      .add(axis.clone().multiplyScalar(-distance));
    const finalTarget = targetObj.position.clone();

    if (!animate) {
      camera.position.copy(finalPos);
      controls.target.copy(finalTarget);
      controls.update();
      return;
    }

    // Animate
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const duration = 1200;
    const startTime = performance.now();

    const animateStep = (time: number) => {
      const tRaw = Math.min((time - startTime) / duration, 1);
      const t = easeInOutCubic(tRaw);

      camera.position.lerpVectors(startPos, finalPos, t);
      controls.target.lerpVectors(startTarget, finalTarget, t);
      controls.update();

      if (tRaw < 1) requestAnimationFrame(animateStep);
    };
    requestAnimationFrame(animateStep);
  };

  const goToPOI = (poi: POI) => {
    const obj = emptyRefs.current[poi.emptyName];
    if (obj) {
      moveCameraTo(obj, poi.zoom ?? 3, poi.lookAxis ?? "x", true);
    }
  };

  // --- INIT THREE ---
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
    controls.minDistance = 1;
    controls.maxDistance = 20;
    controlsRef.current = controls;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    // Load GLB
    const loader = new GLTFLoader();
    loader.load(
      config.glb,
      (gltf) => {
        scene.add(gltf.scene);

        // Collect empties
        gltf.scene.traverse((child) => {
          if (child.name) {
            emptyRefs.current[child.name] = child;
          }
        });

        // Initial camera view (start)
        const startPOI = config.pois.find((p) => p.id === "start");
        if (startPOI) {
          const obj = emptyRefs.current[startPOI.emptyName];
          if (obj) {
            moveCameraTo(obj, startPOI.zoom ?? 3, startPOI.lookAxis ?? "x", false);
          }
        }
      },
      undefined,
      (err) => console.error(err)
    );

    // Render loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const onResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
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
      {/* Menu POI */}
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
