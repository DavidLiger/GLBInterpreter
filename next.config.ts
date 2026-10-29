import fs from 'node:fs';
import path from 'node:path';
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

// Mini-jeu (MJ1, spec-mini-jeu.md §2, §15) : un livre sans `book.json.game` ne porte ni le chunk du moteur ni celui de
// Rapier (MJ2). La compilation du navigateur note dans `.next/glbi-game-chunks.json` les fichiers des chunks qui ne servent
// qu'au jeu ; `scripts/build-book.ts` les retire de `out/` (donc de `book.json.files`) pour un livre sans jeu.
// Règle, lue dans le graphe des chunks de webpack (pas dans les noms de fichiers, qui changent à chaque build) :
//   - groupe du jeu = groupe asynchrone créé par un `import()` dont la cible est un module de `src/components/game/`, ou
//     écrit dans un module de `src/components/game/` (import de Rapier par le moteur, MJ2) ; jamais un groupe d'entrée ;
//   - chunk du jeu = chunk dont tous les groupes sont des groupes du jeu. Un chunk partagé avec le lecteur (une
//     bibliothèque commune découpée à part) n'en est pas : il reste dans le livre.
// Garde-fous dans build-book : la liste ne doit pas être vide, ses fichiers doivent porter le marqueur du jeu, et aucun
// fichier restant d'un livre sans jeu ne doit le porter (code du jeu tombé dans un chunk partagé).
const GAME_CHUNKS_MANIFEST = 'glbi-game-chunks.json'; // dans `.next/` ; nom repris par scripts/build-book.ts
const GAME_SOURCE_DIR = path.resolve('src/components/game') + path.sep;

type WpModule = { resource?: string; rootModule?: WpModule; modules?: WpModule[] };
type WpChunk = { files: Set<string>; groupsIterable: Iterable<WpGroup> };
type WpGroup = {
  isInitial(): boolean;
  origins: { module?: WpModule | null }[];
  getBlocks(): { dependencies: unknown[] }[];
};
type WpCompilation = { chunkGroups: WpGroup[]; chunks: Set<WpChunk>; moduleGraph: { getModule(dep: unknown): WpModule | null } };

const inGameDir = (m: WpModule | null | undefined): boolean =>
  !!m && ((m.resource?.startsWith(GAME_SOURCE_DIR) ?? false) || inGameDir(m.rootModule) || (m.modules?.some(inGameDir) ?? false));

class GameChunksPlugin {
  apply(compiler: { outputPath: string; hooks: { afterEmit: { tap(name: string, fn: (c: WpCompilation) => void): void } } }) {
    compiler.hooks.afterEmit.tap('GlbiGameChunks', (compilation) => {
      const gameGroups = new Set<WpGroup>();
      for (const g of compilation.chunkGroups) {
        if (g.isInitial()) continue;
        const fromGame = g.origins.some((o) => inGameDir(o.module));
        const toGame = g.getBlocks().some((b) => b.dependencies.some((d) => inGameDir(compilation.moduleGraph.getModule(d))));
        if (fromGame || toGame) gameGroups.add(g);
      }
      const files: string[] = [];
      for (const c of compilation.chunks) {
        const groups = [...c.groupsIterable];
        if (groups.length && groups.every((g) => gameGroups.has(g))) files.push(...c.files);
      }
      fs.writeFileSync(path.join(compiler.outputPath, GAME_CHUNKS_MANIFEST), `${JSON.stringify({ files: files.sort() }, null, 2)}\n`);
    });
  }
}

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
  // Î14 : `@zxing/library` ne déclare pas `sideEffects` ; sans cette règle, tout le paquet (lecteurs PDF417, Aztec,
  // encodeurs…) entre dans le chunk du scanner (478 Ko au lieu de 115 Ko pour le seul lecteur QR).
  webpack: (config, { isServer }) => {
    config.module.rules.push({ test: /[\\/]node_modules[\\/]@zxing[\\/]/, sideEffects: false });
    if (!isServer) config.plugins.push(new GameChunksPlugin());
    return config;
  },
  // A3 : indicateur de développement de Next (« N ») masqué dans l'atelier, il recouvrait le lecteur.
  ...(isAtelier ? { pageExtensions: ['tsx', 'ts', 'jsx', 'js', 'atelier.tsx'], distDir: '.next-atelier', devIndicators: false as const } : {}),
};

export default withSerwist(nextConfig);
