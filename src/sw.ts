import type { PrecacheEntry, RuntimeCaching } from 'serwist';
import { defaultCache } from '@serwist/next/worker';
import { Serwist, CacheFirst, ExpirationPlugin } from 'serwist';

declare global {
  interface WorkerGlobalScope {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const revision = crypto.randomUUID();

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  runtimeCaching: defaultCache,
});

// Ajouter les routes customisées
serwist.registerCapture(
  /\.glb$/,
  new CacheFirst({
    cacheName: 'diorama-models',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  })
);

serwist.registerCapture(
  /\.(mp4|webm)$/,
  new CacheFirst({
    cacheName: 'diorama-videos',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  })
);

serwist.registerCapture(
  /\.(jpg|jpeg|png|webp|gif|svg)$/,
  new CacheFirst({
    cacheName: 'diorama-images',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  })
);

serwist.registerCapture(
  /\.(mp3|wav|ogg)$/,
  new CacheFirst({
    cacheName: 'diorama-audio',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  })
);

serwist.registerCapture(
  /^https:\/\/webdiorama-proxy\.david-liger-pro\.workers\.dev\/.*/,
  new CacheFirst({
    cacheName: 'diorama-r2-assets',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  })
);

serwist.addEventListeners();