import withSerwistInit from '@serwist/next';
import type { NextConfig } from "next";

// Î5 (D-8.4) : un livre = un dossier statique portable, servi à la racine (`https://hôte/`) comme sous un
// sous-chemin (`https://hôte/depot/`). Page unique, scène dans `#/s/<scène>`, chemins relatifs partout.
// Contraintes relevées par le spike Î5 (spike-i5-export-statique.md) :
// - `assetPrefix: '.'` → pas de `next/font` (refuse un préfixe relatif) ;
// - Serwist : enregistrement manuel `./sw.js` (le sien est absolu), pas de `cacheOnNavigation` (swe-worker absolu),
//   pas de precache de `public/` (entrées absolues non transformables).
const isProd = process.env.NODE_ENV === 'production';

const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  register: false, // enregistré par ServiceWorkerRegister (./sw.js, scope ./)
  cacheOnNavigation: false,
  globPublicPatterns: [],
  reloadOnOnline: true, // inchangé (O-27, Î8)
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
};

export default withSerwist(nextConfig);
