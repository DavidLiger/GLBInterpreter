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
npm run book:test-source                                # livre de test v1 books/test-dino (une fois)
npm run dev:book -- --source books/test-dino            # prépare public/dev-book/ (non versionné), à relancer après
                                                        # toute modification du dossier source
npm run dev            # http://localhost:3000/#/s/trex        scène v1 lue dans public/dev-book/
                       # http://localhost:3000/#/dev/street    fixture de développement (modules réservés)
                       # (les stubs /s/<scène> n'existent qu'après le build)
```

Le lecteur n'a pas de configuration compilée (Î10) : il lit à l'exécution `book.json` et `scenes/<scène>.json` du
dossier du livre (`src/components/book/bookSource.ts`). Une scène v1 est traduite pour le moteur en un POI unique
`start` (`src/components/book/readerScene.ts`). `npm run dev:book` écrit dans `public/dev-book/` les mêmes scènes et
assets que le build (GLB optimisés, `scenes/<scène>.json` validés), sans l'application ; `next build` recopie ce dossier
dans `out/`, `build-book` l'en retire.

### Lecteur d'une scène v1 (Î10b)

- **Mode `buttons`** (`src/components/diorama/lib/buttonsPlayer.ts`) : `idle` en boucle dès le chargement ; un bouton
  par action, dans l'ordre du GLB ; fondu de 0,25 s ; un clic pendant une action l'interrompt et lance la nouvelle ; un
  clic sur l'action en cours la relance depuis le début (une action `loop: true` s'arrête au contraire) ; retour à
  `idle` à la fin. Un seul mixer, sur la racine de la scène. `WebDioramaLoader` expose `onAction({ id, phase })`
  (`start`, `interrupt`, `end` ; son par action en Î11) et `onEngineReady` (poignée de la scène chargée pour l'atelier ;
  lecture libre d'un clip : `lib/clipPreview.ts`, hors bundle du livre).
- **Boucle unique** (`lib/frameTasks.ts`) : un seul `requestAnimationFrame` ; transitions de caméra, ligne de temps de la
  fixture et outils s'y inscrivent comme tâches.
- **Cadrage** (`lib/orbitFraming.ts`) : convention d'`OrbitControls`, azimut 0 = caméra sur +Z du glTF, c'est-à-dire la
  vue de face de Blender (sujet tourné vers −Y dans Blender) ; `zoom` = position dans la plage de distance, de 0
  (`minDistance`) à 1 (`maxDistance`). Sans cadrage dans `edit.json` : distances 1,5 r à 6 r (r = rayon de la sphère
  englobante de la scène), `zoom` 0,5, polaire de départ 70° dans [0, 90°], azimut libre ; chaque champ déclaré remplace
  sa valeur par défaut.
- **Éclairage** : lampes du GLB (`KHR_lights_punctual`, Lighting Mode Unitless) ; sans aucune lampe, éclairage neutre de
  secours et avertissement en console (D-8.10).

```bash
npm run test:engine                                     # cadrage, mode buttons, boucle unique, éclairage (sans navigateur)
npx tsx scripts/glb-framing.ts <scène.glb> [<scène.edit.json>]   # racines, bornes, cible, lampes, cadrage posé
```

La fixture `test-street` (`src/content/fixtures/`, hors schéma v1) reste la référence des modules réservés (POI
hiérarchiques, `cameraPath`, dialogues, vidéos, spritesheets, lumières, post-processing…). Elle s'ouvre par `#/dev/<scène>`
en `npm run dev`, et par `#/s/<scène>` dans la cartouche de test exportée (`npm run build` sans `--source`, `book.json`
`fixture: true`), toujours par import dynamique. Elle attend ses médias dans `public/`, non versionnés :
`models/street.glb`, `sounds/*.mp3`, `videos/test_street/*.mp4`, `spritesheets/spritesheet_TV-screen.webp`,
`icons/dioramas/test_street/*.png`.

Les outils de développement (analyse de scène, QR, spritesheets,
réglages de post-processing) n'existent qu'en `npm run dev`. En développement, l'écran « Installer le livre » est
contourné (pas de `book.json` ni de service worker) : l'installation se teste dans le dossier exporté (voir plus bas).

## Atelier de configuration (piste A, A2 : lecture seule)

```bash
npm run atelier -- --source books/test-dino            # http://127.0.0.1:4100/atelier/, ouvert dans le navigateur
npm run atelier -- --source <dossier> --port 4300 --no-open
```

Outil local de fabrication d'un livre, jamais déployé (`spec-atelier-glbi.md` §9). Le serveur
(`scripts/atelier/server.ts`, écoute sur `127.0.0.1` seulement) lance `next dev` avec `ATELIER=1` sur le port suivant libre et
sert le dossier source sous `/atelier/` : un chemin relatif de la configuration (`scenes/trex.glb`, `sounds/…`) s'y résout comme
dans le livre publié. La page (`src/app/atelier/page.atelier.tsx`, code dans `src/atelier/`) n'existe que si `ATELIER=1` déclare
l'extension `atelier.tsx` (`next.config.ts`) ; le build échoue si un fichier de `out/` contient du code de l'atelier.

- Barre du haut : livre, scène (ordre de `book.json` ; les GLB de `scenes/` absents de `book.json` sont ouverts en diagnostic
  seul), langue d'aperçu FR/EN/ES.
- Centre : le lecteur réel (`WebDioramaLoader`, prop `embedded`) sur l'objet fusionné `draft` (`mergeLayers`, A1) : libellé
  manquant remplacé par l'identifiant de l'action ; `edit.json` refusé par son schéma = aperçu avec la couche 3D seule ; GLB sans
  `GLBI_ROOT` (ou couche 3D inutilisable) = scène affichée sans module, pour le diagnostic.
- Rapport : erreurs et avertissements du livre entier, par origine (GLB, `edit.json`, fusion, contrôles du build), avec les
  mêmes contrôles et les mêmes textes que `npm run book:check` (code partagé : `scripts/book-check.ts`).
- Diagnostic : poids, générateur, extensions, `GLBI_ROOT` et `glbi_version`, clips (durée, pistes, déclarés ou non) avec
  lecture libre (boucle, vitesse 0 à 2×, mode boutons suspendu), skins et nombre d'os, nœuds porteurs d'extras, crédits `src_*`.
- Réexport depuis Blender : le dossier source est relu toutes les 500 ms ; un fichier modifié est pris en compte quand il n'a
  plus bougé pendant deux relevés (un GLB, quand son en-tête annonce sa taille : écriture terminée) ; le rapport est recalculé
  et le lecteur remonté si la scène affichée dépend du fichier.

Lecture seule en A2 : aucun fichier n'est écrit (l'enregistrement de `scenes/<id>.edit.json` arrive en A3). `next dev` de
l'atelier travaille dans `.next-atelier/` : `npm run dev` peut tourner en même temps ; un seul atelier à la fois par copie du
repo. La fixture `test-street` n'est pas un livre v1 : l'atelier ne l'ouvre pas.

## Build

Deux modes, même commande (`next build --webpack`, puis `scripts/build-book.ts`) :

```bash
rm -rf .next out && npm run build                              # cartouche de test (fixture) : stubs + liste de fichiers
rm -rf .next out && npm run build -- --source <dossier>        # livre au format v1 (spec-extras-blender.md)
npm run book:check -- --source <dossier>                       # validation seule (sans next build, rien n'est écrit)
npm run schema:export [-- --addon <dossier glb_generator>]     # JSON Schema de la couche 3D (fichier commité, copie addon)
npm run test:schema                                            # tests de la fusion des couches (sans navigateur)
```

Dossier source d'un livre (les chemins d'assets des configs sont relatifs à sa racine) :

```
book.json                 couche livre : bookId, title, languages, scenes, origin, ogImage, legal
scenes/<scène>.glb        couche 3D dans les extras de l'empty GLBI_ROOT (addon : glbi_version = 2, glbi_config = chaîne JSON)
scenes/<scène>.edit.json  couche éditoriale : textes, icônes, sons, cadrage, quiz, crédits (atelier ou à la main)
icon.png                  obligatoire : icône du livre, PNG carré ≥ 512 px (transparence permise)
icon-maskable.png         facultatif : icône « maskable » pleine page (motif dans le cercle central de 80 %)
images/ icons/ sounds/ …  assets référencés (seuls ceux-là sont copiés)
```

La configuration d'une scène est partagée en deux couches (D-8.9, `spec-atelier-glbi.md`) : le build les fusionne
(`src/schema/merge.ts`) et valide l'objet fusionné. Un GLB sans `GLBI_ROOT`, un GLB de l'addon v0.1 (`glbi_version` 1),
un `edit.json` absent ou une ancienne config `scenes/<scène>.json` dans le dossier source sont des erreurs.
`book:check` vérifie aussi que `schema/glbi-layer3d.schema.json` (lu par l'addon) correspond au Zod.

Le schéma unique est `src/schema/glbi.ts` (Zod). En mode livre, `out/` reçoit `scenes/<scène>.glb` (optimisé, voir
ci-dessous),
`scenes/<scène>.json` (config validée + crédits des modèles tirés des propriétés `src_*` du GLB), les assets,
`manifest.webmanifest` et les icônes (`icon.png`, `icon-192/512.png`, `icon-maskable-192/512.png`,
`apple-touch-icon.png`, générées par sharp depuis `icon.png` ; sans `icon-maskable.png`, l'icône est inscrite dans le
cercle de la zone sûre (carré de 56 %) sur fond blanc), les balises `og:` et `apple-mobile-web-app-title` de `index.html`, les stubs `s/<scène>/index.html` et `book.json` (livre +
liste des fichiers `{ path, size, sha256 }`). Les QR d'impression (SVG, un par scène, `<origin>/s/<scène>`) sont écrits
dans `dist/qr/<bookId>/`. Le lecteur lit ces fichiers à l'exécution (Î10) : un même build de l'application sert n'importe
quel dossier de livre.

### Optimisation des GLB (`scripts/glb-pipeline.ts`)

La config est lue sur le GLB **source** et dans `edit.json`, fusionnée et validée, puis le GLB est optimisé vers `out/scenes/<scène>.glb` :
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
npm run book:test-source                                       # livre de test v1 (books/test-dino)
rm -rf .next out && npm run build -- --source books/test-dino --part-mib 1   # découpe forcée : des parties à recomposer
npm run test:install                                           # installation, plateformes et mode buttons
```

`tests/buttons.spec.ts` (mode `buttons` sur le livre installé : ordre et libellés des boutons, fin d'action, interruption,
relance, éclairage de secours) demande WebGL 2 ; il est sauté par un navigateur de test qui n'en a pas.

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

## Installation sur l'écran d'accueil et plateformes (Î9)

- Manifest du livre : `display: fullscreen` avec repli `standalone`, `start_url` et `scope` relatifs, icônes `any` et
  `maskable`. Le mode fixture produit les mêmes fichiers depuis `public/icon.png`.
- Chrome (Android, ordinateur) : `beforeinstallprompt` est capturé (`install/installPrompt.ts`) ; le bouton « Ajouter à
  l'écran d'accueil » apparaît sur l'écran d'installation et, après une première installation, sur l'écran « Livre
  installé ». Rien n'est proposé dans l'app ouverte depuis son icône (`display-mode`).
- Navigateurs intégrés (Instagram, Facebook, Messenger, TikTok, Snapchat, LinkedIn, Pinterest, X, Threads, WeChat,
  LINE, vue web Android `; wv`) : aucun téléchargement ; écran « Ouvrez le livre dans Chrome » avec lien `intent:` vers
  Chrome (Android) qui garde la scène (`s/<scène>/`) et bouton « Copier le lien ».
- iPhone et iPad (y compris un iPad qui se présente comme un Mac, reconnu par `maxTouchPoints > 1`) : écran « Version
  iPhone et iPad à venir », aucun téléchargement (D-8.8, à retirer en Î16).
- Firefox de bureau : mention non bloquante sur l'écran d'installation.
- Bouton plein écran masqué si l'API Fullscreen n'existe pas (iPhone) ou si le livre est ouvert en
  `display-mode: fullscreen`.

Tests : `tests/platform.spec.ts` (inclus dans `npm run test:install`) simule les agents utilisateurs ; ils ne
remplacent ni un téléphone Android réel (jalon J2) ni un iPhone (Î16). Simulation manuelle : outils de développement
de Chrome > Network conditions > User agent, sur le dossier exporté (en `npm run dev`, l'écran d'installation est
contourné).

## Déploiement

Hébergement statique (Cloudflare Pages à la racine du sous-domaine du livre ; miroir GitHub Pages sous
sous-chemin). Le dossier `out/` se republie tel quel sur n'importe quel hébergeur de fichiers statiques.
