import { useState, useCallback } from 'react';

interface AssetToLoad {
  type: 'audio' | 'video' | 'image';
  url: string;
}

interface UseAssetPreloaderReturn {
  loadAssets: (assets: AssetToLoad[]) => Promise<void>;
  progress: number;
  loadedCount: number;
  totalCount: number;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook pour précharger des assets avec retry et timeout
 */
export function useAssetPreloader(): UseAssetPreloaderReturn {
  const [progress, setProgress] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Charger un asset avec retry et timeout
   */
  const loadAssetWithRetry = async (
    asset: AssetToLoad,
    maxRetries = 3,
    timeoutMs = 30000
  ): Promise<void> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await Promise.race([
          loadSingleAsset(asset),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeoutMs)
          ),
        ]);
        return; // ✅ Succès
      } catch (err) {
        console.warn(
          `⚠️ Tentative ${attempt}/${maxRetries} échouée pour ${asset.url}:`,
          err
        );

        if (attempt === maxRetries) {
          console.error(`❌ Échec définitif pour ${asset.url}`);
          throw err;
        }

        // Backoff exponentiel : 1s, 2s, 4s
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };

  /**
   * Charger un seul asset
   */
  const loadSingleAsset = (asset: AssetToLoad): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (asset.type === 'audio') {
        const audio = new Audio(asset.url);
        audio.addEventListener('canplaythrough', () => resolve(), { once: true });
        audio.addEventListener('error', (err) => reject(err), { once: true });
        audio.load();
      } else if (asset.type === 'video') {
        const video = document.createElement('video');
        video.src = asset.url;
        video.addEventListener('canplaythrough', () => resolve(), { once: true });
        video.addEventListener('error', (err) => reject(err), { once: true });
        video.load();
      } else if (asset.type === 'image') {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = (err) => reject(err);
        img.src = asset.url;
      } else {
        reject(new Error(`Type d'asset inconnu: ${asset.type}`));
      }
    });
  };

  /**
   * Charger tous les assets en parallèle (avec limite de concurrence)
   */
  const loadAssets = useCallback(async (assets: AssetToLoad[]) => {
    if (assets.length === 0) {
      setProgress(100);
      return;
    }

    setIsLoading(true);
    setError(null);
    setTotalCount(assets.length);
    setLoadedCount(0);
    setProgress(0);

    const CONCURRENT_LIMIT = 5; // Max 5 assets en parallèle
    let loaded = 0;
    let failed = 0;

    const updateProgress = () => {
      loaded++;
      setLoadedCount(loaded);
      const prog = Math.floor((loaded / assets.length) * 100);
      setProgress(prog);
      console.log(`📦 Asset ${loaded}/${assets.length} chargé (${prog}%)`);
    };

    // Charger par batch de CONCURRENT_LIMIT
    for (let i = 0; i < assets.length; i += CONCURRENT_LIMIT) {
      const batch = assets.slice(i, i + CONCURRENT_LIMIT);

      await Promise.allSettled(
        batch.map(async (asset) => {
          try {
            await loadAssetWithRetry(asset);
            updateProgress();
          } catch (err) {
            failed++;
            console.error(`❌ Échec définitif: ${asset.url}`);
            updateProgress(); // ✅ Compter quand même
          }
        })
      );
    }

    if (failed > 0) {
      console.warn(`⚠️ ${failed}/${assets.length} assets n'ont pas pu être chargés`);
      setError(`${failed} fichiers n'ont pas pu être chargés`);
    } else {
      console.log('✅ Tous les assets chargés avec succès');
    }

    setIsLoading(false);
  }, []);

  return {
    loadAssets,
    progress,
    loadedCount,
    totalCount,
    isLoading,
    error,
  };
}
