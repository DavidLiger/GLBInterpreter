import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface UseWebGLContextOptions {
  antialias?: boolean;
  powerPreference?: 'default' | 'high-performance' | 'low-power';
  isMobile?: boolean;
  onContextLost?: () => void;
}

interface WebGLContextReturn {
  renderer: THREE.WebGLRenderer | null;
  error: 'init' | 'lost' | null;
  isReady: boolean;
  /** Libère le renderer (dispose + perte de contexte + retrait du canvas). Idempotent. */
  destroy: () => void;
}

// Durée max d'attente d'un conteneur dimensionné avant de déclarer l'init en échec
const CONTAINER_SIZE_TIMEOUT_MS = 5000;

type InitStatus = 'ready' | 'waiting' | 'failed';

/**
 * Hook pour gérer le contexte WebGL de manière robuste
 * - Pas de tentative de restauration automatique
 * - État d'erreur clair
 * - Possède le renderer : cleanup au démontage ou via destroy()
 * - Si le conteneur mesure 0 px au démarrage, attend qu'il soit dimensionné (ResizeObserver)
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
  } = options;

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [error, setError] = useState<'init' | 'lost' | null>(null);
  const [isReady, setIsReady] = useState(false);
  const hasInitializedRef = useRef(false);
  const contextLostHandlerRef = useRef<((e: Event) => void) | null>(null);

  const initRenderer = (): InitStatus => {
    if (hasInitializedRef.current) return 'ready';
    if (!containerRef.current) return 'waiting';

    // ✅ AJOUT : Vérifier que le container a des dimensions valides
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    
    if (width === 0 || height === 0) {
      console.warn('⚠️ Container pas encore dimensionné, attente...');
      return 'waiting';
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

      // ✅ Handler de contexte perdu - SIMPLE (gardé en ref pour pouvoir le retirer dans destroy())
      const handleContextLost = (e: Event) => {
        e.preventDefault();
        console.error('❌ Contexte WebGL perdu');
        setError('lost');
        setIsReady(false);
        onContextLost?.();
      };
      contextLostHandlerRef.current = handleContextLost;
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost, { once: true });

      setError(null);
      setIsReady(true);
      hasInitializedRef.current = true;
      return 'ready';
    } catch (err) {
      console.error('❌ Erreur initialisation WebGL:', err);
      setError('init');
      setIsReady(false);
      return 'failed';
    }
  };

  // Libération volontaire : retire d'abord le handler pour ne pas déclencher l'erreur « lost »
  const destroy = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    rendererRef.current = null;

    if (contextLostHandlerRef.current) {
      renderer.domElement.removeEventListener('webglcontextlost', contextLostHandlerRef.current);
      contextLostHandlerRef.current = null;
    }

    try {
      renderer.dispose();
      renderer.forceContextLoss();
    } catch (e) {
      console.warn('Erreur destroy renderer:', e);
    }
    renderer.domElement.remove();
  }, []);

  useEffect(() => {
    let observer: ResizeObserver | null = null;
    let safetyTimer: ReturnType<typeof setTimeout> | undefined;

    const stopWaiting = () => {
      observer?.disconnect();
      observer = null;
      if (safetyTimer !== undefined) {
        clearTimeout(safetyTimer);
        safetyTimer = undefined;
      }
    };

    // ✅ Petit délai pour s'assurer que le DOM est prêt
    const timer = setTimeout(() => {
      if (initRenderer() !== 'waiting') return;

      // Conteneur pas encore dimensionné : réessayer dès qu'il l'est, avec un délai de sécurité
      const container = containerRef.current;
      if (container && typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => {
          if (initRenderer() !== 'waiting') stopWaiting();
        });
        observer.observe(container);
      }

      safetyTimer = setTimeout(() => {
        safetyTimer = undefined;
        stopWaiting();
        if (!hasInitializedRef.current) {
          console.error(`❌ Conteneur WebGL jamais dimensionné après ${CONTAINER_SIZE_TIMEOUT_MS} ms`);
          setError('init');
          setIsReady(false);
        }
      }, CONTAINER_SIZE_TIMEOUT_MS);
    }, 50);

    return () => {
      clearTimeout(timer);
      stopWaiting();
      destroy();

      const canvas = containerRef.current?.querySelector('canvas');
      if (canvas) canvas.remove();

      hasInitializedRef.current = false;
    };
  }, []);

  return {
    renderer: rendererRef.current,
    error,
    isReady,
    destroy,
  };
}
