// WebDioramaLoader.tsx - Version nettoyée et corrigée

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
import { setupPostProcessing, setupEmissiveMaterials } from "./rendering/setupPostProcessing"; 
import { usePOIEffects } from "./hooks/usePOIEffects";
import RotateHint from "./ui/RotateHint";
import ConfigConverterTool from "./tools/ConfigConverterTool";
import QRCodeModal from "./tools/QRCodeModal";

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
  const animationFrameRef = useRef<number | undefined>(undefined);
  const hasInitializedRef = useRef(false);
  const { mixerRef, initMixers, playPOIAnimations, stopAllAnimations, updateMixers } = usePOIAnimations(emptyRefs);
  const clock = useRef(new THREE.Clock());
  const hasAutoUnmutedRef = useRef(false);
  const composerRef = useRef<ReturnType<typeof setupPostProcessing> | null>(null);
  const textureLoader = useMemo(() => new THREE.TextureLoader(), []);
  const lastProgressUpdateRef = useRef(0);

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
  const autoplay = config.autoplay ?? false;
  const [isContextLost, setIsContextLost] = useState(false);
  const [shouldAutoReload, setShouldAutoReload] = useState(false);

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

  // ✅ Au début du composant, vérifier si on revient d'un reload
  useEffect(() => {
    if (isLoaded) {
      sessionStorage.removeItem('webgl_context_lost');
    }
  }, [isLoaded]);

  // ✅ Gestion du reload automatique - VERSION AMÉLIORÉE
  useEffect(() => {
    if (!isContextLost) return;

    const wasContextLost = sessionStorage.getItem('webgl_context_lost') === 'true';
    const attemptCount = parseInt(sessionStorage.getItem('webgl_reload_attempts') || '0');
    
    if (wasContextLost && attemptCount >= 2) {
      // Trop de tentatives, arrêter
      console.error("❌ Erreur WebGL persistante après plusieurs tentatives");
      sessionStorage.removeItem('webgl_context_lost');
      sessionStorage.removeItem('webgl_reload_attempts');
      setShouldAutoReload(false);
      return;
    }

    // Incrémenter le compteur
    sessionStorage.setItem('webgl_reload_attempts', String(attemptCount + 1));
    setShouldAutoReload(true);
    
    const handleReload = async () => {
      sessionStorage.setItem('webgl_context_lost', 'true');
      console.log(`🔄 Rechargement automatique (tentative ${attemptCount + 1})...`);
      
      // Nettoyer le cache
      try {
        if ('caches' in window) {
          const names = await caches.keys();
          await Promise.all(names.map(name => caches.delete(name)));
        }
      } catch (error) {
        console.error("Erreur cache:", error);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      window.location.reload();
    };

    const timer = setTimeout(handleReload, 2000);
    return () => clearTimeout(timer);
  }, [isContextLost]);

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

  const updateRendererSize = () => {
    const w = containerRef.current?.clientWidth;
    const h = containerRef.current?.clientHeight;
    if (!w || !h || !cameraRef.current || !rendererRef.current) return;
    
    cameraRef.current.aspect = w / h;
    cameraRef.current.updateProjectionMatrix();
    rendererRef.current.setSize(w, h);
    
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

  // ✅ useEffect principal - VERSION SÉCURISÉE ANTI-BOUCLE
  useEffect(() => {
    // 🔴 GUARDS CRITIQUES - ARRÊTER IMMÉDIATEMENT SI :
    if (!containerRef.current) {
      console.log("⏸️ Pas de container");
      return;
    }
    
    if (hasInitializedRef.current) {
      console.log("⏸️ Déjà initialisé");
      return;
    }
    
    if (isContextLost) {
      console.log("⏸️ Contexte perdu, pas de réinitialisation");
      return;
    }

    // 🔴 VÉRIFIER SI LE NAVIGATEUR A DÉJÀ BLOQUÉ WEBGL
    const testCanvas = document.createElement('canvas');
    const testContext = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
    if (!testContext) {
      console.error("❌ WebGL déjà bloqué par le navigateur");
      setIsContextLost(true);
      testCanvas.remove();
      return;
    }
    testCanvas.remove();

    // 🔴 MARQUER COMME INITIALISÉ **IMMÉDIATEMENT**
    hasInitializedRef.current = true;
    console.log("✅ Initialisation de la scène WebGL");

    // Cleanup préventif
    const existingCanvas = containerRef.current.querySelector('canvas');
    if (existingCanvas) {
      console.log("🧹 Suppression canvas existant");
      existingCanvas.remove();
    }

    if (rendererRef.current) {
      console.log("🧹 Dispose renderer existant");
      rendererRef.current.dispose();
      rendererRef.current.forceContextLoss();
      rendererRef.current = null;
    }

    if (controlsRef.current) {
      controlsRef.current.dispose();
      controlsRef.current = null;
    }

    if (animationFrameRef.current !== undefined) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
    camera.position.set(0, 2, 5);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: false,
        preserveDrawingBuffer: false,
        alpha: false,
      });

      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const pixelRatio = isMobileDevice ? Math.min(window.devicePixelRatio, 2) : window.devicePixelRatio;
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height);
      
      containerRef.current.appendChild(renderer.domElement);
      rendererRef.current = renderer;
      console.log("✅ WebGL context créé");

    } catch (error) {
      console.error("❌ Erreur création WebGL:", error);
      // hasInitializedRef.current = false; // 🔴 Permettre retry si erreur pendant la création
      setIsContextLost(true);
      return;
    }

    // Post-processing
    const configWithPP = config as any;
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
    const loader = new GLTFLoader();
    loader.load(
      config.glb,
      (gltf: GLTF) => {
        scene.add(gltf.scene);
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
        // 🆕 Throttler les updates (max 1 update par 100ms)
        const now = Date.now();
        if (now - lastProgressUpdateRef.current < 100) {
          return; // Skip cet update
        }
        lastProgressUpdateRef.current = now;

        if (xhr.lengthComputable) {
          const progress = (xhr.loaded / xhr.total) * 100;
          setLoadingProgress(Math.floor(progress)); // 🆕 Arrondir pour éviter micro-updates
        } else {
          // 🆕 Incrémenter seulement si changement significatif
          setLoadingProgress((prev) => {
            const next = prev + 2; // Incrément plus grand
            return Math.min(next, 95);
          });
        }
      },
      (error) => {
        console.error("Erreur chargement GLB:", error);
      }
    );

    // ✅ Boucle d'animation - CORRECTION
    const animate = () => {
      // 🔴 Vérifier AVANT de continuer
      if (document.hidden) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return; // Ne rien faire, juste maintenir la boucle
      }

      if (rendererRef.current) {
        const gl = rendererRef.current.getContext();
        if (gl.isContextLost()) {
          console.error("❌ Contexte perdu dans animate()");
          setIsContextLost(true);
          return; // Arrêter la boucle
        }
      }

      const delta = clock.current.getDelta();
      updateMixers(delta);
      controlsRef.current?.update();
      
      if (composerRef.current) {
        composerRef.current.composer.render();
      } else if (rendererRef.current && cameraRef.current) {
        rendererRef.current.render(scene, camera);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      console.log("🧹 Cleanup");
      
      if (animationFrameRef.current !== undefined) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current.forceContextLoss();
        rendererRef.current = null;
      }

      if (controlsRef.current) {
        controlsRef.current.dispose();
        controlsRef.current = null;
      }

      if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry?.dispose();
            if (Array.isArray(object.material)) {
              object.material.forEach(mat => mat.dispose());
            } else {
              object.material?.dispose();
            }
          }
        });
        sceneRef.current.clear();
        sceneRef.current = null;
      }

      const canvas = containerRef.current?.querySelector('canvas');
      if (canvas) canvas.remove();
      
      // hasInitializedRef.current = false;
    };
  }, [config.glb, isContextLost]);

  // ✅ DOF selon POI
  useEffect(() => {
    if (!composerRef.current || !currentPOI) return;

    const poi = findPOIById(config.pois as POIWithElements[], currentPOI);
    if (!poi) return;

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

  // ✅ Gestion visibilité page - VERSION ULTRA-SÉCURISÉE
  useEffect(() => {
    let checkTimer: NodeJS.Timeout;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log("📱 App en arrière-plan - PAUSE COMPLÈTE");
        
        // Pause tous les sons
        Object.values(ambientAudioRefs.current).forEach(audio => {
          if (!audio.paused) audio.pause();
        });
        
      } else {
        console.log("📱 App au premier plan - VÉRIFICATION");
        
        // 🔴 SI PAS DE RENDERER, NE RIEN FAIRE
        if (!rendererRef.current) {
          console.error("❌ Renderer absent après retour");
          setIsContextLost(true);
          return; // 🔴 Arrêter ici, ne pas reloader
        }

        // Attendre un peu que le navigateur restaure les ressources
        checkTimer = setTimeout(() => {
          if (!rendererRef.current) {
            console.error("❌ Renderer toujours absent");
            setIsContextLost(true);
            return;
          }

          const gl = rendererRef.current.getContext();
          if (gl.isContextLost()) {
            console.error("❌ Contexte WebGL perdu détecté");
            setIsContextLost(true);
            
            // 🔴 Reload seulement si première fois ET si on n'est pas déjà en train de reload
            const wasContextLost = sessionStorage.getItem('webgl_context_lost') === 'true';
            const isReloading = sessionStorage.getItem('webgl_reloading') === 'true';
            
            if (!wasContextLost && !isReloading) {
              sessionStorage.setItem('webgl_context_lost', 'true');
              sessionStorage.setItem('webgl_reloading', 'true');
              setTimeout(() => {
                window.location.reload();
              }, 1000);
            }
          } else {
            console.log("✅ Contexte WebGL OK - Reprise");
            
            // Reprendre les sons
            if (!muted && currentPOI) {
              const ambient = ambientAudioRefs.current[currentPOI];
              if (ambient) {
                ambient.play().catch((e) => {
                  console.warn("Impossible de reprendre l'audio:", e);
                });
              }
            }
          }
        }, 500);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    return () => {
      clearTimeout(checkTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [muted, currentPOI]);

  // ✅ Context loss handler
  useEffect(() => {
    if (!isLoaded) return; // Attendre que la scène soit chargée

    const timer = setTimeout(() => {
      const canvas = containerRef.current?.querySelector('canvas');
      if (!canvas) return;

      const handleContextLost = (event: Event) => {
        event.preventDefault();
        console.error("❌ WebGL context lost");
        setIsContextLost(true);
        
        if (animationFrameRef.current !== undefined) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };

      const handleContextRestored = () => {
        console.log("✅ WebGL context restored");
        window.location.reload();
      };

      canvas.addEventListener('webglcontextlost', handleContextLost);
      canvas.addEventListener('webglcontextrestored', handleContextRestored);

      return () => {
        canvas.removeEventListener('webglcontextlost', handleContextLost);
        canvas.removeEventListener('webglcontextrestored', handleContextRestored);
      };
    }, 100);

    return () => clearTimeout(timer);
  }, [isLoaded]);

  // ✅ Vidéos pause/play
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!sceneRef.current) return;

      sceneRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat) => {
            if (mat.map && mat.map instanceof THREE.VideoTexture) {
              const video = mat.map.image as HTMLVideoElement;
              if (document.hidden) {
                video.pause();
              } else {
                video.play().catch(() => {});
              }
            }
          });
        }
      });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // ✅ Auto-unmute reset
  useEffect(() => {
    if (isPlaying && !isEnded) {
      hasAutoUnmutedRef.current = false;
    }
  }, [isPlaying, isEnded]);

  // ✅ Auto-unmute ambiance
  useEffect(() => {
    if (isEnded && !scenePlaying && muted && !hasAutoUnmutedRef.current) {
      const timeout = setTimeout(() => {
        toggleMute();
        hasAutoUnmutedRef.current = true;
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [isEnded, scenePlaying, muted, toggleMute]);

  // ✅ Nettoyer tous les flags quand ça marche
  useEffect(() => {
    if (isLoaded) {
      sessionStorage.removeItem('webgl_context_lost');
      sessionStorage.removeItem('webgl_reload_attempts');
      sessionStorage.removeItem('webgl_reloading'); // 🔴 Nouveau flag
      console.log("✅ Scène chargée avec succès - Flags nettoyés");
    }
  }, [isLoaded]);

  useEffect(() => {
    if (showLoaderOverlay) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
      window.scrollTo(0, 0);
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    }
    
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    };
  }, [showLoaderOverlay]);

  // ✅ Écran d'erreur WebGL - VERSION AMÉLIORÉE
  if (isContextLost) {
    const wasContextLost = sessionStorage.getItem('webgl_context_lost') === 'true';
    const attemptCount = parseInt(sessionStorage.getItem('webgl_reload_attempts') || '0');

    return (
      <div 
        ref={containerRef}
        style={{ height: viewportHeight || '100vh' }}
        className="w-screen flex items-center justify-center bg-black text-white"
      >
        <div className="text-center p-8 max-w-md">
          {wasContextLost && attemptCount >= 2 ? (
            <>
              <p className="mb-2 text-lg">❌ Impossible de charger WebGL</p>
              <p className="mb-4 text-sm text-gray-400">
                Votre navigateur ne peut pas créer le contexte 3D.
              </p>
              <p className="mb-6 text-xs text-gray-500">
                Solutions possibles :<br/>
                • Fermez complètement le navigateur et les autres onglets<br/>
                • Redémarrez votre appareil<br/>
                • Essayez un autre navigateur (Chrome/Safari)
              </p>
              <button
                onClick={() => {
                  sessionStorage.clear();
                  window.location.reload();
                }}
                className="px-6 py-3 bg-green-500 text-black font-semibold rounded-full"
              >
                Réessayer
              </button>
            </>
          ) : shouldAutoReload ? (
            <>
              <p className="mb-2 text-lg">⚠️ Contexte WebGL perdu</p>
              <p className="mb-4 text-sm text-gray-400">
                Rechargement automatique... (tentative {attemptCount + 1})
              </p>
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
              </div>
            </>
          ) : (
            <>
              <p className="mb-2 text-lg">⚠️ Contexte WebGL perdu</p>
              <p className="mb-4 text-sm text-gray-400">
                Préparation du rechargement...
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
        style={{ 
        // height: '100vh',
        height: '100dvh', // 🆕 Dynamic viewport height (mobile)
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        overflow: 'hidden'
      }}
      className="bg-black"
      // className="relative w-screen bg-black"
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
            autoplay={autoplay}
            onStart={() => {
            // Reset scroll au cas où
            window.scrollTo(0, 0);
              if (autoplay) {
                if (!isFullscreen) toggleFullscreen();
                if (sceneMuted) toggleSceneMute();
                if (!isPlaying) togglePlayPause();
                setShowLoaderOverlay(false);
                return;
              }

              if (!isFullscreen) toggleFullscreen();
              if (muted) toggleMute();
              setShowLoaderOverlay(false);
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

      {process.env.NODE_ENV === 'development' && (
        <ConfigConverterTool
          defaultProxyUrl="https://webdiorama-proxy.david-liger-pro.workers.dev/assets/1"
          defaultSceneId="street"
        />
      )}

      {process.env.NODE_ENV === "development" && (
        <QRCodeModal/>
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