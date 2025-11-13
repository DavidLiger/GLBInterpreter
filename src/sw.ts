import type { PrecacheEntry } from 'serwist';
import { defaultCache } from '@serwist/next/worker';
import { Serwist, CacheFirst, ExpirationPlugin } from 'serwist';

declare global {
  interface WorkerGlobalScope {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  runtimeCaching: defaultCache,
});

// ✅ Fonction helper pour nettoyer les URLs
const cleanUrl = (url: string): string => {
  const urlObj = new URL(url);
  // Retirer query params pour le matching
  return `${urlObj.origin}${urlObj.pathname}`;
};

// ✅ Handler custom qui ignore query params
const cacheFirstIgnoreQuery = (cacheName: string, maxEntries: number, maxAge: number) => {
  return async ({ request }: { request: Request }) => {
    const cleanedUrl = cleanUrl(request.url);
    const cache = await caches.open(cacheName);
    
    // Chercher dans le cache avec URL nettoyée
    const cached = await cache.match(cleanedUrl);
    if (cached) {
      console.log('✅ Servi depuis cache:', cleanedUrl);
      return cached;
    }
    
    // Sinon, fetch
    console.log('⬇️ Téléchargement:', request.url);
    const response = await fetch(request);
    
    // Mettre en cache avec URL nettoyée
    if (response.ok) {
      await cache.put(cleanedUrl, response.clone());
    }
    
    return response;
  };
};

// Routes avec ignore query params
serwist.registerCapture(
  /\.glb$/,
  cacheFirstIgnoreQuery('diorama-models', 50, 60 * 60 * 24 * 30)
);

serwist.registerCapture(
  /\.(mp4|webm)$/,
  cacheFirstIgnoreQuery('diorama-videos', 100, 60 * 60 * 24 * 30)
);

serwist.registerCapture(
  /\.(jpg|jpeg|png|webp|gif|svg)$/,
  cacheFirstIgnoreQuery('diorama-images', 200, 60 * 60 * 24 * 30)
);

serwist.registerCapture(
  /\.(mp3|wav|ogg)$/,
  cacheFirstIgnoreQuery('diorama-audio', 100, 60 * 60 * 24 * 30)
);

serwist.registerCapture(
  /^https:\/\/webdiorama-proxy\.david-liger-pro\.workers\.dev\/.*/,
  cacheFirstIgnoreQuery('diorama-r2-assets', 200, 60 * 60 * 24 * 30)
);

serwist.addEventListeners();