import withSerwistInit from '@serwist/next';
import type { NextConfig } from "next";

// Î5 (D-8.4) : un livre = un dossier statique portable, servi à la racine (`https://hôte/`) comme sous un
// sous-chemin (`https://hôte/depot/`). Page unique, scène dans `#/s/<scène>`, chemins relatifs partout.
// Contraintes relevées par le spike Î5 (spike-i5-export-statique.md) :
// - `assetPrefix: '.'` → pas de `next/font` (refuse un préfixe relatif) ;
// - Serwist : enregistrement manuel `./sw.js` (le sien est absolu), pas de `cacheOnNavigation` (swe-worker absolu),
//   pas de precache de `public/` (entrées absolues non transformables).
const isProd = process.env.NODE_ENV === 'production';

// Atelier de configuration (A2, spec-atelier-glbi.md §9) : `npm run atelier` lance `next dev` avec ATELIER=1. La page
// src/app/atelier/page.atelier.tsx n'est une page que si l'extension `atelier.tsx` est déclarée, donc jamais dans le build
// d'un livre (contrôlé en fin de build par scripts/build-book.ts). Dossier de travail distinct : le verrou de `next dev`
// (un seul par dossier) laisse alors `npm run dev` et l'atelier tourner en même temps.
const isAtelier = process.env.ATELIER === '1';

const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  register: false, // enregistré par ServiceWorkerRegister (./sw.js, scope ./)
  cacheOnNavigation: false,
  globPublicPatterns: [],
  reloadOnOnline: false, // O-27 : pas de rechargement forcé au retour du réseau (le livre est installé)
  disable: !isProd,
});

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // Relatif en production seulement : le serveur de dev sert toujours à la racine.
  assetPrefix: isProd ? '.' : undefined,
  compiler: {
    removeConsole: isProd ? { exclude: ['error', 'warn'] } : false,
  },
  // `next dev` (Turbopack) : configuration vide requise à côté de la config webpack de Serwist.
  turbopack: {},
  // A3 : indicateur de développement de Next (« N ») masqué dans l'atelier, il recouvrait le lecteur.
  ...(isAtelier ? { pageExtensions: ['tsx', 'ts', 'jsx', 'js', 'atelier.tsx'], distDir: '.next-atelier', devIndicators: false as const } : {}),
};

export default withSerwist(nextConfig);
