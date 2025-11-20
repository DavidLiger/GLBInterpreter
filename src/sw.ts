import type { PrecacheEntry } from "serwist";
import { Serwist } from "serwist";
import { NetworkFirst, CacheFirst, NetworkOnly  } from "serwist";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[];
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // ✅ Assets R2 → Toujours réseau (pas de cache SW)
    // {
    //   matcher: ({ url }) => url.hostname.includes('workers.dev'),
    //   handler: new NetworkOnly(),
    // },
    
    // Pages HTML → Network First
    {
      matcher: ({ request }) => request.destination === 'document',
      handler: new NetworkFirst({
        cacheName: 'pages',
      }),
    },
    
    // JS/CSS → Cache First
    {
      matcher: ({ request }) => 
        request.destination === 'script' || request.destination === 'style',
      handler: new CacheFirst({
        cacheName: 'assets',
      }),
    },
    
    // Images locales → Cache First
    {
      matcher: ({ request, url }) => 
        request.destination === 'image' && !url.hostname.includes('workers.dev'),
      handler: new CacheFirst({
        cacheName: 'images',
      }),
    },
  ],
});

serwist.addEventListeners();