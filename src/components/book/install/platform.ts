// Plateforme du lecteur (Î9) : navigateurs intégrés (U-20, D-6.2 C), iOS (écran « version iPhone à venir », D-8.8),
// Firefox de bureau, application déjà installée (`display-mode`). Détection par l'agent utilisateur : il n'existe pas
// d'API fiable pour reconnaître un navigateur intégré. Remplace la détection de l'îlot 0.5.a (faite dans faerium-site).
//
// Limites connues : un navigateur intégré qui se fait passer pour Chrome ou Safari sans marqueur n'est pas reconnu ;
// un iPad en « site pour ordinateur » se présente comme un Mac (`Macintosh`) et n'est reconnu que par ses points de
// contact (`maxTouchPoints > 1`, aucun Mac n'a d'écran tactile) ; Playwright WebKit (« Desktop Safari ») a 0 point de
// contact et reste donc un Mac.

/**
 * Î16 : build d'essai iOS (`NEXT_PUBLIC_GLBI_IOS_TRIAL=1 npm run build -- …`), réservé au déploiement d'essai. Un
 * iPhone ou un iPad n'y voit pas l'écran « version iPhone à venir » et suit le parcours commun. Fixé au build (et non
 * par l'URL) : l'app ouverte depuis l'écran d'accueil démarre sur `start_url` sans paramètre, avec un stockage séparé
 * de Safari. Un build sans la variable garde l'écran (D-8.8). Retiré à la fin d'Î16.
 */
export const IOS_TRIAL = process.env.NEXT_PUBLIC_GLBI_IOS_TRIAL === '1';

/** Marqueurs d'agent utilisateur des applications qui ouvrent les liens dans leur propre navigateur. */
const IN_APP: readonly (readonly [RegExp, string])[] = [
  [/Instagram/i, 'Instagram'],
  [/FBAN\/Messenger|MessengerForiOS|FB_IAB\/Orca/i, 'Messenger'],
  [/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i, 'Facebook'],
  [/Barcelona/i, 'Threads'],
  [/musical_ly|BytedanceWebview|TikTok|trill_/i, 'TikTok'],
  [/Snapchat/i, 'Snapchat'],
  [/LinkedInApp/i, 'LinkedIn'],
  [/Pinterest/i, 'Pinterest'],
  [/Twitter/i, 'X'],
  [/MicroMessenger/i, 'WeChat'],
  [/\bLine\//i, 'LINE'],
];

export interface Platform {
  android: boolean;
  /** iPhone, iPod, iPad, y compris un iPad qui se présente comme un Mac. */
  ios: boolean;
  /** iPad reconnu seulement par ses points de contact (agent utilisateur de Mac). */
  ipadAsMac: boolean;
  /** Nom de l'application hôte (« Instagram »…), « WebView » pour une vue web Android sans marqueur, sinon null. */
  inApp: string | null;
  /** Firefox sur ordinateur : pas d'installation comme application. */
  firefoxDesktop: boolean;
}

export function detectPlatform(ua = navigator.userAgent, maxTouchPoints = navigator.maxTouchPoints ?? 0): Platform {
  const android = /Android/i.test(ua);
  const ipadAsMac = !android && /Macintosh/i.test(ua) && maxTouchPoints > 1;
  const ios = /iPhone|iPad|iPod/i.test(ua) || ipadAsMac;
  let inApp: string | null = IN_APP.find(([re]) => re.test(ua))?.[1] ?? null;
  // Vue web Android (`; wv)`) : application quelconque qui affiche la page sans Chrome.
  if (!inApp && android && /;\s*wv\)/i.test(ua)) inApp = 'WebView';
  const firefoxDesktop = /Firefox\//i.test(ua) && !android && !ios && !/Mobile|Tablet/i.test(ua);
  return { android, ios, ipadAsMac, inApp, firefoxDesktop };
}

/** Un élément est affiché par l'API Fullscreen (Chrome passe alors aussi en `display-mode: fullscreen`). */
function apiFullscreen(): boolean {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

/** L'application est ouverte depuis l'icône de l'écran d'accueil (ou une fenêtre d'application sur ordinateur). */
export function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  if (['standalone', 'minimal-ui'].some((m) => window.matchMedia?.(`(display-mode: ${m})`).matches)) return true;
  return isDisplayFullscreen();
}

/**
 * Ouverte en `display-mode: fullscreen` par le manifest du livre : l'API Fullscreen est alors inutile. Le plein écran
 * demandé par l'API (bouton du lecteur) donne aussi `display-mode: fullscreen` dans Chrome : il est exclu ici.
 *
 * Î12 : sur ordinateur, `display-mode: fullscreen` vient du plein écran F11 du navigateur, pas du manifest (Chrome de
 * bureau ouvre une application installée en `standalone` même si le manifest demande `fullscreen`) : seul un appareil
 * mobile (Android, ou agent utilisateur `Mobile`) est considéré comme ouvert depuis son icône en plein écran. Le bouton
 * plein écran du lecteur reste donc proposé sous F11, et l'écran d'installation n'y croit plus le livre installé.
 * iOS ignore `display: fullscreen` (D-8.8, Î16).
 */
export function isDisplayFullscreen(): boolean {
  if (typeof window === 'undefined' || apiFullscreen()) return false;
  if (!/Android|Mobile/i.test(navigator.userAgent)) return false;
  return !!window.matchMedia?.('(display-mode: fullscreen)').matches;
}

/**
 * Adresse à ouvrir dans un vrai navigateur depuis un navigateur intégré : la page courante, ou le stub `s/<scène>/`
 * (D-8.4) quand une scène est demandée, pour que le lien garde la scène sans dépendre du hash.
 */
export function shareableUrl(sceneId: string | null): string {
  const base = new URL('./', window.location.href);
  return sceneId ? new URL(`s/${encodeURIComponent(sceneId)}/`, base).href : base.href;
}

/** Lien `intent:` d'Android qui ouvre l'adresse dans Chrome ; repli sur l'adresse elle-même si Chrome est absent. */
export function chromeIntentUrl(url: string): string {
  const u = new URL(url);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}
