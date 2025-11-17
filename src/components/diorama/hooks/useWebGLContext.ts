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
export function useWebGLContext(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseWebGLContextOptions = {}
): WebGLContextReturn {
  const {
    antialias = true,
    powerPreference = 'high-performance',
    isMobile = false,
    onContextLost,
    onContextRestored,
  } = options;

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [error, setError] = useState<'init' | 'lost' | null>(null);
  const [isReady, setIsReady] = useState(false);
  const hasInitializedRef = useRef(false);

  const initRenderer = () => {
    if (!containerRef.current || hasInitializedRef.current) return;

    // ✅ AJOUT : Vérifier que le container a des dimensions valides
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    if (width === 0 || height === 0) {
      console.warn('⚠️ Container pas encore dimensionné, attente...');
      return;
    }

    console.log('🎬 Init WebGL');

    // Cleanup préventif
    const existingCanvas = containerRef.current.querySelector('canvas');
    if (existingCanvas) {
      console.log('🧹 Suppression canvas existant');
      existingCanvas.remove();
    }

    if (rendererRef.current) {
      console.log('🧹 Dispose renderer existant');
      try {
        rendererRef.current.dispose();
        rendererRef.current.forceContextLoss();
      } catch (e) {
        console.warn('Erreur dispose renderer:', e);
      }
      rendererRef.current = null;
    }

    try {
      const renderer = new THREE.WebGLRenderer({
        antialias: antialias && !isMobile,
        powerPreference,
        failIfMajorPerformanceCaveat: false,
        preserveDrawingBuffer: false,
        alpha: false,
      });

      const pixelRatio = isMobile ? 1 : Math.min(window.devicePixelRatio, 2);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);

      containerRef.current.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      console.log('✅ WebGL context créé');

      // ✅ Handler de contexte perdu - SIMPLE
      renderer.domElement.addEventListener(
        'webglcontextlost',
        (e) => {
          e.preventDefault();
          console.error('❌ Contexte WebGL perdu');
          setError('lost');
          setIsReady(false);
          onContextLost?.();
        },
        { once: true }
      );

      setError(null);
      setIsReady(true);
      hasInitializedRef.current = true;
    } catch (err) {
      console.error('❌ Erreur initialisation WebGL:', err);
      setError('init');
      setIsReady(false);
    }
  };

  useEffect(() => {
    // ✅ Petit délai pour s'assurer que le DOM est prêt
    const timer = setTimeout(() => {
      initRenderer();
    }, 50);

    return () => {
      clearTimeout(timer);
      
      if (rendererRef.current) {
        try {
          rendererRef.current.dispose();
          rendererRef.current.forceContextLoss();
        } catch (e) {
          console.warn('Erreur cleanup renderer:', e);
        }
        rendererRef.current = null;
      }

      const canvas = containerRef.current?.querySelector('canvas');
      if (canvas) canvas.remove();

      hasInitializedRef.current = false;
    };
  }, []);

  const retryInit = () => {
    hasInitializedRef.current = false;
    setError(null);
    setIsReady(false);
    initRenderer();
  };

  return {
    renderer: rendererRef.current,
    error,
    isReady,
    retryInit,
  };
}
