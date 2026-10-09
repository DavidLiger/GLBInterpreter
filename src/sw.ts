import type { PrecacheEntry } from "serwist";
import { Serwist } from "serwist";
import { NetworkFirst, CacheFirst } from "serwist";
import { ExpirationPlugin } from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[];
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // On retire 'cleanupOutdatedCaches' car il cause l'erreur TS 
  // et Serwist gère généralement le nettoyage du precache automatiquement.

  runtimeCaching: [
    // 2. Pages HTML
    {
      matcher: ({ request }) => request.destination === 'document',
      handler: new NetworkFirst({
        // IMPORTANT : 'pages-v2' force la création d'un nouveau cache propre
        cacheName: 'pages-v2', 
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 24 * 60 * 60, // 24h
          }),
        ],
      }),
    },
    
    // 3. JS/CSS/Fonts
    {
      matcher: ({ request }) => 
        request.destination === 'script' || 
        request.destination === 'style' ||
        request.destination === 'font',
      handler: new CacheFirst({
        cacheName: 'assets-v2', // v2 pour invalider les vieux assets
        plugins: [
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 jours
          }),
        ],
      }),
    },
    
    // 4. Images locales (Î5 : plus d'assets distants ; le cache du livre arrive en Î8)
    {
      matcher: ({ request }) => request.destination === 'image',
      handler: new CacheFirst({
        cacheName: 'images-v2', // C'est ICI que ton bug actuel sera résolu
        plugins: [
          new ExpirationPlugin({
            maxEntries: 60,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 jours
          }),
        ],
      }),
    },
  ],
});

serwist.addEventListeners();