# GLBInterpreter

Lecteur 3D (Next.js + Three.js) des livres augmentés des Éditions Liger. Une « console » qui lit une
« cartouche » : un GLB et une configuration de scène par page du livre.

Un livre = **une application statique, publique et portable** : un dossier contenant le code, la configuration et
tous les assets, qui fonctionne servi à la racine d'un domaine (`https://hôte/`) comme sous un sous-chemin
(`https://hôte/depot/`). Pas de serveur, pas de compte, pas de contrôle d'accès.

## Routage

- Le livre est une page unique (`index.html`). La scène courante est dans le hash : `#/s/<scène>`.
- Les QR codes imprimés pointent vers `https://<hôte>/s/<scène>` : le fichier `s/<scène>/index.html`, généré après
  le build, redirige vers `<racine du dossier>#/s/<scène>`.
- Tous les chemins sont relatifs (assets, service worker `./sw.js`, manifest `./manifest.json`).

## Développement

```bash
npm install
npm run dev            # http://localhost:3000/#/s/street
```

La cartouche de test (`src/content/fixtures/test-street.ts`, déclarée dans `src/content/book.json` et
`src/content/book.ts`) attend ses médias dans `public/`, non versionnés : `models/street.glb`, `sounds/*.mp3`,
`videos/test_street/*.mp4`, `spritesheets/spritesheet_TV-screen.webp`, `icons/dioramas/test_street/*.png`.

Les outils de développement (analyse de scène, optimiseur GLB, convertisseur de config, QR, spritesheets,
réglages de post-processing) n'existent qu'en `npm run dev`.

## Build

```bash
rm -rf .next out && npm run build   # next build --webpack + stubs s/<scène>/
```

Le dossier `out/` est le livre. Pour le tester à la racine et sous un sous-chemin :

```bash
(cd out && python3 -m http.server 8001)                        # http://localhost:8001/s/street
mkdir -p /tmp/sous && cp -r out /tmp/sous/depot
(cd /tmp/sous && python3 -m http.server 8002)                  # http://localhost:8002/depot/s/street
```

## Déploiement

Hébergement statique (Cloudflare Pages à la racine du sous-domaine du livre ; miroir GitHub Pages sous
sous-chemin). Le dossier `out/` se republie tel quel sur n'importe quel hébergeur de fichiers statiques.
