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
  zoom?: number;
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
  const gltfRef = useRef<THREE.Object3D | null>(null);
  const emptyRefs = useRef<Record<string, THREE.Object3D>>({});

  // Initialisation Three.js
  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 2, 5);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.maxPolarAngle = Math.PI / 2;
    controls.minDistance = 1;
    controls.maxDistance = 10;
    controlsRef.current = controls;

    // Lumière
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    // GLTF Loader
    const loader = new GLTFLoader();
    loader.load(
      config.glb,
      (gltf) => {
        gltfRef.current = gltf.scene;
        scene.add(gltf.scene);

        // Récupération des empties
        gltf.scene.traverse((child) => {
          if (child.type === "Object3D" && child.name) {
            emptyRefs.current[child.name] = child;
          }
        });

        // Position initiale caméra sur "start" si existant
        const start = emptyRefs.current["start"];
        if (start) {
          camera.position.copy(start.position);
          controls.target.copy(start.position);
          controls.update();
        }
      },
      undefined,
      (error) => console.error(error)
    );

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const handleResize = () => {
      if (containerRef.current && cameraRef.current && rendererRef.current) {
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(w, h);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
    };
  }, [config.glb]);

  // Fonction pour aller vers un POI
  const goToPOI = (poi: POI) => {
    const target = emptyRefs.current[poi.emptyName];
    if (target && cameraRef.current && controlsRef.current) {
      cameraRef.current.position.copy(target.position.clone().add(new THREE.Vector3(0, 1, 3)));
      controlsRef.current.target.copy(target.position);
      controlsRef.current.update();
    }
  };

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
