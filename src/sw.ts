/// <reference lib="webworker" />
// Service worker du livre (Î8). Compilé par @serwist/next vers `sw.js`, enregistré à la main (`./sw.js`, scope `./`,
// D-8.4). Il ne télécharge rien lui-même : l'écran « Installer le livre » range tous les fichiers du livre dans le
// cache `book-<bookId>@<chemin du dossier>` (src/components/book/install/), et le SW sert ensuite ces entrées hors
// ligne, application comprise (HTML, JS, CSS, polices, décodeurs : O-31).
//
// - `book.json` (l'index) va toujours au réseau ; hors ligne, la copie installée sert de repli.
// - Requêtes du téléchargeur (en-tête `x-glbi-download`) : réseau direct, jamais le cache (sinon une mise à jour
//   recevrait l'ancienne version d'un fichier modifié).
// - Autres requêtes du dossier : cache du livre d'abord, réseau sinon (avant l'installation, ou fichier hors liste).
// - Requêtes `Range` (vidéo, Safari) : réponse 206 découpée dans l'entrée en cache.
// - Pas de `skipWaiting` automatique (O-28) : la page propose « nouvelle version » et envoie `SKIP_WAITING`.
// - À l'activation : suppression des caches d'avant Î8 (Serwist : `pages-v2`, `assets-v2`, `images-v2`, precache).
// - Pas de rechargement au retour du réseau (O-27, `reloadOnOnline: false` dans next.config.ts).
export {}; // module : `self` ci-dessous masque le `self` global (DOM) pour le typage
declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: unknown };

// Point d'injection exigé par @serwist/next ; la liste n'est pas utilisée (le cache du livre contient tout le
// dossier, avec des empreintes vérifiées ; un precache séparé ferait double emploi, O-30).
void self.__SW_MANIFEST;

const CACHE_PREFIX = 'book-';
const SHA_HEADER = 'x-glbi-sha256';
const scope = new URL(self.registration.scope);
const ownSuffix = `@${scope.pathname}`;

self.addEventListener('install', () => {
  // Rien à précharger : voir l'en-tête. Pas de skipWaiting ici (O-28).
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (!name.startsWith(CACHE_PREFIX)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

/** Entrée du cache du livre de ce dossier pour `url` (avec les variantes `…/` → `…/index.html`). */
async function matchBook(url: URL): Promise<Response | undefined> {
  const clean = new URL(url.href);
  clean.search = '';
  clean.hash = '';
  const candidates = clean.pathname.endsWith('/') ? [`${clean.href}index.html`] : [clean.href, `${clean.href}/index.html`];
  for (const name of await caches.keys()) {
    if (!name.startsWith(CACHE_PREFIX) || !name.endsWith(ownSuffix)) continue;
    const cache = await caches.open(name);
    for (const c of candidates) {
      const res = await cache.match(c);
      if (res) return res;
    }
  }
  return undefined;
}

/** Réponse 206 pour une requête `Range: bytes=a-b` (lecteur vidéo de Safari). */
async function partial(range: string, res: Response): Promise<Response> {
  const blob = await res.blob();
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  const size = blob.size;
  let start = m && m[1] !== '' ? Number(m[1]) : NaN;
  let end = m && m[2] !== '' ? Number(m[2]) : size - 1;
  if (m && m[1] === '' && m[2] !== '') {
    start = Math.max(0, size - Number(m[2])); // suffixe : les N derniers octets
    end = size - 1;
  }
  if (!m || Number.isNaN(start) || start >= size || start > end) {
    return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
  }
  end = Math.min(end, size - 1);
  const headers = new Headers(res.headers);
  headers.set('content-range', `bytes ${start}-${end}/${size}`);
  headers.set('content-length', String(end - start + 1));
  headers.set('accept-ranges', 'bytes');
  headers.delete(SHA_HEADER);
  return new Response(blob.slice(start, end + 1), { status: 206, headers });
}

async function serve(request: Request, url: URL): Promise<Response> {
  const cached = await matchBook(url);
  if (cached) {
    const range = request.headers.get('range');
    return range ? partial(range, cached) : cached;
  }
  try {
    return await fetch(request);
  } catch (e) {
    // Navigation hors ligne vers une adresse inconnue du livre : la page unique prend le relais (D-8.4).
    if (request.mode === 'navigate') {
      const index = await matchBook(new URL('index.html', scope));
      if (index) return index;
    }
    throw e;
  }
}

async function indexFromNetwork(request: Request, url: URL, networkOnly: boolean): Promise<Response> {
  try {
    return await fetch(request, { cache: 'no-store' });
  } catch (e) {
    if (networkOnly) throw e;
    const cached = await matchBook(url);
    if (cached) return cached;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const rel = url.pathname.slice(scope.pathname.length);
  if (rel === 'sw.js' || request.headers.has('x-glbi-download')) return; // réseau direct
  if (rel === 'book.json') {
    event.respondWith(indexFromNetwork(request, url, request.headers.get('x-glbi-index') === 'network'));
    return;
  }
  event.respondWith(serve(request, url));
});
