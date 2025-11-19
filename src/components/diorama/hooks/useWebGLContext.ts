import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface UseWebGLContextOptions {
  antialias?: boolean;
  powerPreference?: 'default' | 'high-performance' | 'low-power';
  isMobile?: boolean;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

interface WebGLContextReturn {
  renderer: THREE.WebGLRenderer | null;
  error: 'init' | 'lost' | null;
  isReady: boolean;
  retryInit: () => void;
}

/**
 * Hook pour gérer le contexte WebGL de manière robuste
 * - Pas de tentative de restauration automatique
 * - État d'erreur clair
 * - Cleanup propre
 */
// Dans hooks/useWebGLContext.ts

export function useWebGLContext(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: WebGLContextOptions = {}
) {
  const [renderer, setRenderer] = useState<THREE.WebGLRenderer | null>(null);
  const [error, setError] = useState<"lost" | "unsupported" | null>(null);
  const [isReady, setIsReady] = useState(false);
  const contextRestoredRef = useRef(false); // ✅ NOUVEAU

  useEffect(() => {
    if (!containerRef.current) return;

    try {
      console.log("🎬 Init WebGL");
      
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");

      if (!gl) {
        console.error("❌ WebGL non supporté");
        setError("unsupported");
        return;
      }

      const newRenderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !options.isMobile,
        alpha: false,
        powerPreference: options.isMobile ? "low-power" : "high-performance",
        stencil: false,
        depth: true,
      });

      newRenderer.setPixelRatio(Math.min(window.devicePixelRatio, options.isMobile ? 2 : 2));
      containerRef.current.appendChild(newRenderer.domElement);

      // ✅ Gestion perte de contexte
      newRenderer.domElement.addEventListener(
        "webglcontextlost",
        (event) => {
          event.preventDefault();
          console.log("❌ Contexte WebGL perdu");
          setError("lost");
          options.onContextLost?.();
        },
        { once: true }
      );

      // ✅ NOUVEAU : Gestion restauration automatique
      newRenderer.domElement.addEventListener(
        "webglcontextrestored",
        () => {
          console.log("✅ Contexte WebGL RESTAURÉ automatiquement");
          contextRestoredRef.current = true;
          setError(null); // ✅ Clear l'erreur
          
          // ✅ Callback de restauration
          options.onContextRestored?.();
        },
        { once: false } // ✅ Peut se produire plusieurs fois
      );

      setRenderer(newRenderer);
      setIsReady(true);
      console.log("✅ WebGL context créé");

    } catch (err) {
      console.error("❌ Erreur init WebGL:", err);
      setError("unsupported");
    }

    return () => {
      if (renderer) {
        renderer.dispose();
        renderer.domElement?.remove();
      }
    };
  }, [containerRef.current]);

  return { renderer, error, isReady, contextRestoredRef };
}

// ✅ Mettre à jour le type
interface WebGLContextOptions {
  isMobile?: boolean;
  onContextLost?: () => void;
  onContextRestored?: () => void; // ✅ NOUVEAU
}
