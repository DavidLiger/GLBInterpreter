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
- Tous les chemins sont relatifs (assets, service worker `./sw.js`, manifest `./manifest.webmanifest`).

## Développement

```bash
npm install
npm run dev            # http://localhost:3000/#/s/street  (les stubs /s/<scène> n'existent qu'après le build)
```

La cartouche de test (`src/content/fixtures/test-street.ts`, déclarée dans `src/content/book.json` et
`src/content/book.ts`) attend ses médias dans `public/`, non versionnés : `models/street.glb`, `sounds/*.mp3`,
`videos/test_street/*.mp4`, `spritesheets/spritesheet_TV-screen.webp`, `icons/dioramas/test_street/*.png`.

Les outils de développement (analyse de scène, convertisseur de config, QR, spritesheets,
réglages de post-processing) n'existent qu'en `npm run dev`. En développement, l'écran « Installer le livre » est
contourné (pas de `book.json` ni de service worker) : l'installation se teste dans le dossier exporté (voir plus bas).

## Build

Deux modes, même commande (`next build --webpack`, puis `scripts/build-book.ts`) :

```bash
rm -rf .next out && npm run build                              # cartouche de test (fixture) : stubs + liste de fichiers
rm -rf .next out && npm run build -- --source <dossier>        # livre au format v1 (spec-extras-blender.md)
npm run book:check -- --source <dossier>                       # validation seule (sans next build, rien n'est écrit)
```

Dossier source d'un livre (les chemins d'assets des configs sont relatifs à sa racine) :

```
book.json                 couche livre : bookId, title, languages, scenes, origin, ogImage, legal
scenes/<scène>.glb        config dans les extras de l'empty GLBI_ROOT (glbi_version = 1, glbi_config = chaîne JSON)
scenes/<scène>.json       facultatif, développement : config utilisée si le GLB n'a pas de GLBI_ROOT
icon-192.png, icon-512.png  facultatifs : icônes du manifest
images/ icons/ sounds/ …  assets référencés (seuls ceux-là sont copiés)
```

Le schéma unique est `src/schema/glbi.ts` (Zod). En mode livre, `out/` reçoit `scenes/<scène>.glb` (optimisé, voir
ci-dessous),
`scenes/<scène>.json` (config validée + crédits des modèles tirés des propriétés `src_*` du GLB), les assets,
`manifest.webmanifest`, les balises `og:` de `index.html`, les stubs `s/<scène>/index.html` et `book.json` (livre +
liste des fichiers `{ path, size, sha256 }`). Les QR d'impression (SVG, un par scène, `<origin>/s/<scène>`) sont écrits
dans `dist/qr/<bookId>/`. Jusqu'à Î10, le lecteur compilé lit encore la cartouche de test : les scènes d'un livre v1 se
construisent et se valident, mais ne s'ouvrent pas encore.

### Optimisation des GLB (`scripts/glb-pipeline.ts`)

La config est lue et validée sur le GLB **source**, puis le GLB est optimisé vers `out/scenes/<scène>.glb` :
extras de scène hors `glbi_` et de nœud hors `glbi_`/`src_` retirés, `prune` (garde `GLBI_ROOT` et les nœuds cités par la
config : cible caméra, objets animés), `dedup` sans fusion des matériaux, textures, Meshopt (inclut `quantize`). Le GLB
écrit est relu : `GLBI_ROOT`, noms des clips et propriétés `src_*` doivent être intacts, sinon le build échoue. Pas de
Draco. En mode fixture, les GLB de `out/` sont optimisés sur place (empties conservés).

### Fichiers de plus de 25 MiB (D-8.7)

Cloudflare Pages refuse les fichiers de plus de 25 MiB. Le build découpe tout fichier plus gros en parties de 20 MiB
(`<chemin>.part001`, `.part002`…) et retire l'original du dossier. Son entrée dans `book.json.files` garde le chemin,
la taille et l'empreinte du fichier logique et liste ses parties (`parts`) ; le téléchargeur du lecteur les recompose
et range le fichier sous son URL d'origine. Pour les tests, `--part-mib <n>` découpe tout fichier de plus de n MiB.

Textures (`--textures`, défaut `auto`) : `ktx2` (BasisU, outil `ktx` de [KTX-Software](https://github.com/KhronosGroup/KTX-Software/releases)
≥ 4.4 dans le `PATH`), `webp` (sans outil externe), `keep`. `auto` = KTX2 si `ktx` est installé, sinon WebP avec un
avertissement.

```bash
npm run build -- --source <dossier> --textures webp
npm run glb:report -- <fichier.glb> [--textures webp] [--scenes 15]    # taille, survie, projection d'un livre
```

Au runtime, `GLTFLoader` reçoit `MeshoptDecoder` (embarqué dans le bundle) et un `KTX2Loader` dont le transcodeur
Basis est servi depuis `decoders/basis/` (copié de `three` par `scripts/copy-decoders.ts`, lancé par `predev` et
`prebuild` ; retiré du livre si aucune scène n'a de texture KTX2).

Livre de test synthétique (GLB conforme à la spec, sans valeur visuelle) : `npm run book:test-source` écrit
`books/test-dino/` (non versionné).

Le dossier `out/` est le livre. Pour le tester à la racine et sous un sous-chemin :

```bash
(cd out && npx http-server -p 8001)                            # http://localhost:8001/s/<scène>
mkdir -p /tmp/sous && cp -r out /tmp/sous/depot
(cd /tmp/sous && npx http-server -p 8002)                      # http://localhost:8002/depot/s/<scène>
```

## Installation du livre sur l'appareil (Î8)

Au premier lancement, l'écran « Installer le livre » lit `book.json`, annonce la taille et télécharge **tous** les
fichiers listés (application comprise) dans le Cache Storage `book-<bookId>@<chemin du dossier>`, par lots, avec
vérification de la taille et du SHA-256 de chaque fichier ; rien du livre ne s'affiche avant la fin. Une coupure ou
une pause conserve ce qui est déjà vérifié (reprise fichier par fichier, partie par partie). Le service worker
(`src/sw.ts`) sert ensuite tout depuis ce cache, hors ligne. Après une reconstruction du livre, l'écran propose une mise
à jour : seuls les fichiers dont l'empreinte a changé sont retéléchargés.

### Tester l'installation

Tests automatiques (Chromium et WebKit de Playwright ; WebKit n'est pas Safari iOS) :

```bash
npx playwright install chromium webkit                         # une fois
rm -rf .next out && npm run build -- --part-mib 1              # découpe forcée : des parties à recomposer
npm run test:install
```

Procédure manuelle hors ligne (O-34), sur le dossier exporté servi par `npx http-server` (voir plus haut) :

1. Ouvrir `http://localhost:8001/s/<scène>` : écran « Installer le livre », taille annoncée, bouton « Installer ».
2. Pendant le téléchargement, « Mettre en pause » puis « Reprendre » : la progression repart de ce qui est acquis.
3. Fin du téléchargement : la scène s'ouvre. Outils de développement du navigateur > Application > Cache Storage :
   un cache `book-<bookId>@/` contient tous les fichiers de `book.json`, sans fichier `.partNNN`.
4. Couper le serveur (ou cocher « Offline » dans l'onglet Réseau), recharger, ouvrir `/s/<scène>` : la scène s'ouvre.
5. Reconstruire le livre après avoir modifié un fichier, relancer le serveur, recharger : écran « Mise à jour du
   livre », taille à télécharger = fichiers modifiés seulement.
6. Recommencer sous `/depot/`.

Sur téléphone (sans Mac pour l'iPhone) : ajouter `?debug=1` à l'adresse ou ouvrir `#/debug` pour afficher la console
Eruda (logs, réseau, stockage) ; elle reste active jusqu'à la fermeture de l'onglet. Si l'onglet est tué pendant
l'installation, le relancement affiche la dernière étape atteinte (clé localStorage `glbi:install-trace`). Le Cache
Storage et le service worker exigent HTTPS (ou `localhost`) : tester sur l'adresse publiée ou une prévisualisation
Cloudflare Pages, pas sur `http://<IP locale>`.

## Déploiement

Hébergement statique (Cloudflare Pages à la racine du sous-domaine du livre ; miroir GitHub Pages sous
sous-chemin). Le dossier `out/` se republie tel quel sur n'importe quel hébergeur de fichiers statiques.
