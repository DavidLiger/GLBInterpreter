// scripts/build-book.ts — assemble le dossier du livre après `next build` (Î6 ; absorbe generate-scene-stubs.mjs).
//
//   npm run build -- --source <dossier du livre>     next build + livre complet (mode livre)
//   npm run build                                    next build + cartouche de test (mode fixture, provisoire)
//   npm run book:check -- --source <dossier>         validation seule, sans next build ni écriture
//   npm run dev:book -- --source <dossier>           livre de développement dans public/dev-book/ (Î10), lu par `npm run dev`
//   option --textures auto|ktx2|webp|keep            textures des GLB (défaut auto : KTX2 si `ktx` est installé, sinon WebP)
//   option --part-mib <n>                            tests seulement : découpe tout fichier > n MiB en parties de n MiB
//
// Dossier source d'un livre (chemins d'assets relatifs à sa racine = racine du dossier construit, D-8.1) :
//   book.json                    couche livre (spec-extras-blender.md §5)
//   scenes/<scène>.glb           GLB de la scène ; couche 3D dans les extras de l'empty GLBI_ROOT (addon, glbi_version 2)
//   scenes/<scène>.edit.json     couche éditoriale (atelier ou à la main) ; fusionnée avec la couche 3D (D-8.9, src/schema/merge.ts)
//                                Un scenes/<scène>.json dans le dossier source est une erreur (ancien repli, supprimé en A1).
//   icon.png                     obligatoire (Î9) : icône du livre, PNG carré ≥ 512 px (transparence permise)
//   icon-maskable.png            facultatif (Î9) : icône « maskable » pleine page (motif dans le cercle central de 80 %) ;
//                                sans elle, le build inscrit icon.png dans ce cercle (carré de 56 %) sur un fond blanc
//   images/, icons/, sounds/…    assets référencés par les configs et book.json (seuls ceux-là sont copiés)
//
// Ordre (Î7, A1) : les deux couches sont lues (GLB SOURCE et edit.json), fusionnées et validées, puis le GLB est optimisé (scripts/glb-pipeline.ts : extras
// étrangers retirés, prune, dedup sans MATERIAL, textures KTX2/WebP, Meshopt) vers out/scenes/<scène>.glb ; le GLB écrit est
// relu et comparé (GLBI_ROOT, clips, src_*, nœuds cités par la config). Un GLB source déjà Meshopt est accepté ; Draco, non.
// Limite d'hébergement (25 MiB par fichier, D-8.7, Î8) : tout fichier de plus de 25 MiB est découpé en parties de 20 MiB
// (`<chemin>.part001`, …) ; l'original n'est pas déployé. Son entrée dans book.json.files garde le chemin, la taille et
// l'empreinte du fichier logique et liste ses parties (`parts`) ; le téléchargeur les recompose (src/components/book/install).
// La limite de 25 MiB est ensuite contrôlée sur les fichiers déployés (les parties).
//
// Mode livre, dans out/ : scenes/<scène>.glb, scenes/<scène>.json (config validée + crédits des modèles),
// assets référencés, manifest.webmanifest et icônes (Î9), og:image et titre d'application dans index.html,
// stubs s/<scène>/index.html (D-8.4),
// book.json (livre + liste des fichiers { path, size, sha256, parts? }). QR SVG par scène dans dist/qr/<bookId>/.
// Mode fixture : GLB de out/ optimisés sur place (empties conservés), manifest et icônes d'après public/icon.png, stubs
// d'après src/content/book.json et out/book.json { bookId, scenes, fixture, files }. Le lecteur lit les scènes de la fixture
// dans src/content/fixtures/ quand book.json porte `fixture: true` (Î10).
// Mode développement (--dev, Î10), dans public/dev-book/ (non versionné) : book.json (livre, `files` vide), scenes/<scène>.glb
// optimisés, scenes/<scène>.json et assets référencés ; ni export Next, ni icônes, manifest, stubs, QR ni découpage.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import sharp from 'sharp';
import {
  formatMiB,
  optimizeGlbFile,
  resolveTextureMode,
  TEXTURE_MODES,
  type TextureMode,
} from './glb-pipeline';
import {
  builtBookSchema,
  builtSceneSchema,
  formatIssues,
  SCENE_ID_PATTERN,
  type Book,
  type BookFile,
  type BookFilePart,
  type BuiltScene,
} from '../src/schema/glbi';
import { checkSchemaFresh } from './export-schema';
import {
  checkBookSource,
  ICON_MIN_PX,
  iconSourceOk,
  listFiles,
  readJson as readJsonReport,
  Report,
  ROOT,
  toPosix,
  type SceneResult,
} from './book-check';

/** Limites de Cloudflare Pages (architecture, Déploiement). */
const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Dossier du livre lu par `npm run dev` (src/components/book/bookSource.ts, `DEV_BOOK_DIR`, Î10). */
const DEV_BOOK_OUT = 'public/dev-book';
const MAX_FILES = 20000;
/** D-8.7 : taille des parties d'un fichier découpé (marge sous la limite de 25 MiB). */
const PART_BYTES = 20 * 1024 * 1024;

/** Fichiers du dossier construit absents de la liste de téléchargement (Î8) : l'index lui-même et le service worker. */
const EXCLUDED_FROM_FILES = [/^book\.json$/, /^sw\.js(\.map)?$/, /^swe-worker-[^/]*\.js$/, /\.map$/, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/];

// ---------------------------------------------------------------------------------------------------------
// Rapport : erreurs (bloquantes) et avertissements
// ---------------------------------------------------------------------------------------------------------

// Contrôles partagés avec l'atelier (scripts/book-check.ts, A2) : même rapport, mêmes textes.
const report = new Report();
const { errors, warnings } = report;
const err = (m: string) => report.error(m);
const warn = (m: string) => report.warning(m);
/** Dossier construit en cours d'écriture (après `requireExport`) : un échec le laisse incomplet. */
let writingOut: string | null = null;

function flushReport(): void {
  for (const w of warnings) console.warn(`  avertissement : ${w}`);
  for (const e of errors) console.error(`  ERREUR : ${e}`);
}

function fail(): never {
  flushReport();
  if (writingOut) {
    // Sans book.json, le dossier ne peut pas être installé par le lecteur : un dossier incomplet ne sert pas par erreur.
    fs.rmSync(path.join(writingOut, 'book.json'), { force: true });
    console.error(
      `build-book : ${errors.length} erreur(s), ${warnings.length} avertissement(s). ` +
        `Le dossier ${toPosix(path.relative(ROOT, writingOut)) || writingOut}/ est incomplet (book.json retiré) : ne pas le publier.`,
    );
  } else {
    console.error(`build-book : ${errors.length} erreur(s), ${warnings.length} avertissement(s). Rien n'a été écrit.`);
  }
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------------------

interface Options {
  source: string | null;
  out: string;
  qrDir: string;
  check: boolean;
  /** Î10 : livre de développement écrit dans public/dev-book/ pour `npm run dev`. */
  dev: boolean;
  textures: TextureMode;
  /** D-8.7 : seuil de découpage et taille des parties (octets). Défaut : > 25 MiB, parties de 20 MiB. */
  splitAbove: number;
  partBytes: number;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    source: process.env.BOOK_SOURCE || null,
    out: 'out',
    qrDir: 'dist/qr',
    check: false,
    dev: false,
    textures: 'auto',
    splitAbove: MAX_FILE_BYTES,
    partBytes: PART_BYTES,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (!v) throw new Error(`option ${a} : valeur manquante`);
      return v;
    };
    if (a === '--source') opts.source = next();
    else if (a === '--out') opts.out = next();
    else if (a === '--qr-dir') opts.qrDir = next();
    else if (a === '--check') opts.check = true;
    else if (a === '--dev') opts.dev = true;
    else if (a === '--textures') {
      const t = next() as TextureMode;
      if (!TEXTURE_MODES.includes(t)) throw new Error(`--textures : ${TEXTURE_MODES.join(', ')} attendu (trouvé « ${t} »)`);
      opts.textures = t;
    } else if (a === '--part-mib') {
      const n = Number(next());
      if (!(n >= 1 && n <= 20)) throw new Error('--part-mib : nombre de MiB entre 1 et 20 attendu');
      opts.splitAbove = opts.partBytes = Math.floor(n * 1024 * 1024);
    } else throw new Error(`option inconnue « ${a} » (options : --source, --out, --qr-dir, --check, --dev, --textures, --part-mib)`);
  }
  return opts;
}

// ---------------------------------------------------------------------------------------------------------
// Fichiers
// ---------------------------------------------------------------------------------------------------------

/** Empreinte lue par blocs (un GLB découpé peut peser plusieurs centaines de Mo). */
function sha256(file: string): string {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.allocUnsafe(4 * 1024 * 1024);
    for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0; ) h.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}

const readJson = (file: string, label: string): unknown => readJsonReport(file, label, err);

/** Copie `rel` de la source vers le dossier construit ; refuse d'écraser un fichier différent de l'application. */
function copyIntoOut(sourceDir: string, outDir: string, rel: string): void {
  const from = path.join(sourceDir, rel);
  const to = path.join(outDir, rel);
  if (fs.existsSync(to)) {
    if (sha256(to) === sha256(from)) return;
    err(`${rel} : un fichier différent existe déjà dans le dossier construit (collision avec l'application)`);
    return;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------------------------------------
// Sorties
// ---------------------------------------------------------------------------------------------------------

function stubHtml(sceneId: string, title: string): string {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<script>location.replace(location.pathname.replace(/s\\/[^/]+\\/?(index\\.html)?$/, '') + '#/s/${sceneId}');</script>
<noscript><meta http-equiv="refresh" content="0;url=../../#/s/${sceneId}"></noscript>
</head><body style="background:#000"></body></html>
`;
}

/** Stubs `s/<scène>/index.html` (D-8.4) : redirection vers `<racine du dossier>#/s/<scène>`, sous `/` comme sous `/<dépôt>/`. */
function writeStubs(outDir: string, sceneIds: readonly string[], title: string): void {
  for (const id of sceneIds) {
    if (!SCENE_ID_PATTERN.test(id)) {
      err(`identifiant de scène invalide « ${id} »`);
      continue;
    }
    const dir = path.join(outDir, 's', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), stubHtml(id, title));
  }
}

/**
 * D-8.7 : découpe `rel` en parties de `partBytes` octets (`<rel>.part001`, …) à côté de lui, puis retire l'original
 * (le fichier logique n'est pas déployé). Renvoie les parties dans l'ordre.
 */
function splitFile(outDir: string, rel: string, partBytes: number): BookFilePart[] {
  const full = path.join(outDir, rel);
  const parts: BookFilePart[] = [];
  const fd = fs.openSync(full, 'r');
  try {
    const buf = Buffer.allocUnsafe(partBytes);
    for (let i = 1; ; i++) {
      let n = 0;
      while (n < partBytes) {
        const r = fs.readSync(fd, buf, n, partBytes - n, null);
        if (r === 0) break;
        n += r;
      }
      if (n === 0) break;
      const partRel = `${rel}.part${String(i).padStart(3, '0')}`;
      const partFull = path.join(outDir, partRel);
      if (fs.existsSync(partFull)) throw new Error(`${partRel} existe déjà dans le dossier construit`);
      const data = buf.subarray(0, n);
      fs.writeFileSync(partFull, data);
      parts.push({ path: partRel, size: n, sha256: crypto.createHash('sha256').update(data).digest('hex') });
      if (n < partBytes) break;
    }
  } finally {
    fs.closeSync(fd);
  }
  fs.rmSync(full);
  return parts;
}

/**
 * Liste des fichiers du dossier construit (O-13, C-34), découpage des gros fichiers (D-8.7) + contrôle des limites de
 * l'hébergeur sur les fichiers déployés. `strict` : dépassement = erreur (livre publié) ; sinon avertissement
 * (cartouche de test, jamais publiée).
 */
function collectFiles(outDir: string, opts: Pick<Options, 'splitAbove' | 'partBytes'>, strict = true): BookFile[] {
  const limit = (m: string) => (strict ? err(m) : warn(`${m} ; toléré pour la cartouche de test, refusé pour un livre`));
  const files: BookFile[] = [];
  for (const rel of listFiles(outDir)) {
    if (EXCLUDED_FROM_FILES.some((re) => re.test(rel))) continue;
    const full = path.join(outDir, rel);
    const size = fs.statSync(full).size;
    const sha = sha256(full);
    if (size > opts.splitAbove) {
      try {
        const parts = splitFile(outDir, rel, opts.partBytes);
        files.push({ path: rel, size, sha256: sha, parts });
        console.log(`build-book : ${rel} (${(size / 1048576).toFixed(1)} MiB) découpé en ${parts.length} parties (D-8.7)`);
      } catch (e) {
        err(`${rel} : découpage impossible (${(e as Error).message})`);
      }
      continue;
    }
    files.push({ path: rel, size, sha256: sha });
  }
  // Limites contrôlées sur ce qui sera réellement déployé (parties comprises, fichier logique exclu).
  const deployed = listFiles(outDir);
  if (deployed.length > MAX_FILES) limit(`${deployed.length} fichiers dans le dossier construit (limite ${MAX_FILES})`);
  for (const rel of deployed) {
    const size = fs.statSync(path.join(outDir, rel)).size;
    if (size > MAX_FILE_BYTES) limit(`${rel} : ${(size / 1048576).toFixed(1)} MiB (limite ${MAX_FILE_BYTES / 1048576} MiB par fichier déployé)`);
  }
  return files;
}

function injectOg(outDir: string, book: Book): void {
  const indexFile = path.join(outDir, 'index.html');
  let html = fs.readFileSync(indexFile, 'utf8');
  if (html.includes('property="og:')) {
    warn('index.html contient déjà des balises og:, injection ignorée');
    return;
  }
  const lang = book.languages[0];
  const tags = [`<meta property="og:title" content="${escapeHtml(book.title[lang])}"/>`];
  if (book.ogImage) tags.push(`<meta property="og:image" content="${escapeHtml(`${book.origin}/${book.ogImage}`)}"/>`);
  if (!html.includes('</head>')) {
    err('index.html : balise </head> introuvable, og: non injectées');
    return;
  }
  html = html.replace('</head>', `${tags.join('')}</head>`);
  fs.writeFileSync(indexFile, html);
}

// Installation (Î9, O-33, S-21). Couleurs et orientation communes à tous les livres tant que la couche livre
// (spec-extras-blender.md §5) ne les porte pas.
const PWA_THEME_COLOR = '#000000';
const PWA_BACKGROUND_COLOR = '#000000';
/** Fond des icônes opaques (maskable, apple-touch-icon) : une icône transparente y reste lisible. */
const ICON_BACKGROUND = '#ffffff';
const PWA_ORIENTATION = 'any';

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: 'any' | 'maskable';
}

/**
 * Icônes du livre dans `outDir`, depuis une source carrée ≥ 512 px : `icon.png` (512, favicon), `icon-192.png` et
 * `icon-512.png` (`any`, transparence conservée), `icon-maskable-192.png` et `icon-maskable-512.png` (`maskable`,
 * opaques), `apple-touch-icon.png` (180, opaque, iOS remplit la transparence en noir). `maskableSource` : icône
 * maskable fournie par l'auteur ; sinon `iconSource` inscrite dans la zone sûre (cercle de 80 % de diamètre, donc carré
 * de 0,8/√2 ≈ 56 % : les coins d'un motif carré restent visibles) sur `ICON_BACKGROUND`.
 * `strict` : erreur (mode livre) ou avertissement (mode fixture) si la source ne convient pas.
 */
async function writeIcons(iconSource: string, maskableSource: string | null, outDir: string, strict: boolean): Promise<ManifestIcon[]> {
  const report = strict ? err : warn;
  const label = toPosix(path.relative(ROOT, iconSource)) || iconSource;
  if (!fs.existsSync(iconSource)) {
    report(`${label} absent : le livre ne peut pas être ajouté à l'écran d'accueil (icône PNG carrée ≥ ${ICON_MIN_PX} px)`);
    return [];
  }
  if (!(await iconSourceOk(iconSource, report))) return [];
  if (maskableSource && !(await iconSourceOk(maskableSource, report))) return [];

  const png = (img: ReturnType<typeof sharp>, file: string) => img.png({ compressionLevel: 9 }).toFile(path.join(outDir, file));
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  const any = (size: number) => sharp(iconSource).resize(size, size, { fit: 'contain', background: transparent });
  const maskable = async (size: number) => {
    if (maskableSource) return sharp(maskableSource).resize(size, size).flatten({ background: ICON_BACKGROUND });
    const inner = Math.floor((size * 0.8) / Math.SQRT2);
    const pad = Math.floor((size - inner) / 2);
    const motif = await any(inner).toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: ICON_BACKGROUND } })
      .composite([{ input: motif, left: pad, top: pad }])
      .flatten({ background: ICON_BACKGROUND });
  };

  await png(any(512), 'icon.png');
  const icons: ManifestIcon[] = [];
  for (const size of [192, 512]) {
    await png(any(size), `icon-${size}.png`);
    icons.push({ src: `icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' });
  }
  for (const size of [192, 512]) {
    await png(await maskable(size), `icon-maskable-${size}.png`);
    icons.push({ src: `icon-maskable-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'maskable' });
  }
  await png(any(180).flatten({ background: ICON_BACKGROUND }), 'apple-touch-icon.png');
  return icons;
}

function writeWebManifest(outDir: string, name: string, lang: string, icons: ManifestIcon[]): void {
  const manifest = {
    id: './',
    name,
    short_name: name,
    lang,
    start_url: './',
    scope: './',
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone'],
    orientation: PWA_ORIENTATION,
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    icons,
  };
  fs.writeFileSync(path.join(outDir, 'manifest.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Nom de l'application sous l'icône iOS (`apple-mobile-web-app-title`) ; les autres balises viennent de layout.tsx. */
function injectAppTitle(outDir: string, name: string): void {
  const indexFile = path.join(outDir, 'index.html');
  let html = fs.readFileSync(indexFile, 'utf8');
  if (html.includes('name="apple-mobile-web-app-title"')) {
    html = html.replace(/<meta name="apple-mobile-web-app-title"[^>]*\/?>/, '');
  }
  if (!html.includes('</head>')) {
    err('index.html : balise </head> introuvable, titre d\'application non injecté');
    return;
  }
  html = html.replace('</head>', `<meta name="apple-mobile-web-app-title" content="${escapeHtml(name)}"/></head>`);
  fs.writeFileSync(indexFile, html);
}

async function writeQrCodes(qrDir: string, book: Book): Promise<string[]> {
  const dir = path.join(qrDir, book.bookId);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const lines: string[] = [];
  for (const [i, id] of book.scenes.entries()) {
    const url = `${book.origin}/s/${id}`;
    const svg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 });
    const file = `${String(i + 1).padStart(2, '0')}-${id}.svg`;
    fs.writeFileSync(path.join(dir, file), svg);
    lines.push(`${file}\t${url}`);
  }
  fs.writeFileSync(path.join(dir, 'urls.txt'), `${lines.join('\n')}\n`);
  return lines;
}

// ---------------------------------------------------------------------------------------------------------
// Optimisation des GLB (Î7, scripts/glb-pipeline.ts)
// ---------------------------------------------------------------------------------------------------------

function resolveTextureModeOrFail(mode: TextureMode): TextureMode {
  try {
    const r = resolveTextureMode(mode);
    if (r.note) warn(r.note);
    return r.mode;
  } catch (e) {
    err((e as Error).message);
    fail();
  }
}

/** Optimise `rel` du dossier source vers le dossier construit ; contrôle de survie (erreur si un élément est perdu). */
async function writeOptimizedScene(sourceDir: string, outDir: string, rel: string, protect: string[], textures: TextureMode): Promise<boolean> {
  try {
    const r = await optimizeGlbFile(path.join(sourceDir, rel), path.join(outDir, rel), { protect, textures });
    for (const s of r.survival) err(`${rel} : optimisation : ${s}`);
    const stripped = [...r.stripped.scene.map((k) => `scène.${k}`), ...r.stripped.node.map((k) => `nœud.${k}`)];
    console.log(
      `build-book : ${rel} ${formatMiB(r.inBytes)} → ${formatMiB(r.outBytes)} (textures ${r.textures})` +
        (stripped.length ? ` ; extras retirés : ${stripped.join(', ')}` : ''),
    );
    return r.survival.length === 0;
  } catch (e) {
    err(`${rel} : optimisation impossible (${(e as Error).message})`);
    return false;
  }
}

/**
 * Cartouche de test : GLB recopiés de public/ par next build, optimisés sur place. Empties feuilles conservés (la config
 * TS de la fixture cite POI et éléments par nom) ; un échec laisse le fichier d'origine (avertissement).
 */
async function optimizeFixtureGlbs(outDir: string, mode: TextureMode): Promise<void> {
  const glbs = listFiles(outDir).filter((f) => f.toLowerCase().endsWith('.glb'));
  if (!glbs.length) return;
  const textures = resolveTextureModeOrFail(mode);
  for (const rel of glbs) {
    const file = path.join(outDir, rel);
    const tmp = `${file}.opt`;
    try {
      const r = await optimizeGlbFile(file, tmp, { keepLeaves: true, protect: [], textures });
      if (r.survival.length) {
        fs.rmSync(tmp, { force: true });
        warn(`${rel} : optimisation écartée (${r.survival.join(' ; ')}), fichier d'origine conservé`);
        continue;
      }
      fs.renameSync(tmp, file);
      console.log(`build-book : ${rel} ${formatMiB(r.inBytes)} → ${formatMiB(r.outBytes)} (textures ${r.textures})`);
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      warn(`${rel} : optimisation impossible (${(e as Error).message}), fichier d'origine conservé`);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------------------------------------

/**
 * Médias de la cartouche de test, recopiés de `public/` par `next build` (voir .gitignore) : retirés du dossier d'un
 * livre v1, qui ne doit contenir que ses propres assets. `icons/dioramas/UI` est l'interface du lecteur : conservé.
 */
const FIXTURE_MEDIA = ['models', 'videos', 'sounds', 'spritesheets', 'jsons', 'image/dioramas', 'images/dioramas', 'images/hdr', 'images/textures'];

function removeFixtureMedia(outDir: string): void {
  const removed: string[] = [];
  for (const rel of FIXTURE_MEDIA) {
    const full = path.join(outDir, rel);
    if (fs.existsSync(full)) {
      fs.rmSync(full, { recursive: true, force: true });
      removed.push(`${rel}/`);
    }
  }
  const iconsDir = path.join(outDir, 'icons/dioramas');
  if (fs.existsSync(iconsDir)) {
    for (const e of fs.readdirSync(iconsDir)) {
      if (e === 'UI') continue;
      fs.rmSync(path.join(iconsDir, e), { recursive: true, force: true });
      removed.push(`icons/dioramas/${e}`);
    }
  }
  if (removed.length) console.log(`build-book : médias de la cartouche de test retirés du dossier du livre : ${removed.join(', ')}`);
}

/**
 * Atelier exclu du livre (A2, D-8.9) : aucun fichier du dossier construit ne contient de code de l'atelier
 * (src/app/atelier/page.atelier.tsx, src/atelier/**, scripts/atelier/). Recherche de la route et des marqueurs dans tous les
 * fichiers texte. `ATELIER_MARKER` est la constante de src/atelier/api.ts.
 */
const ATELIER_MARKER = 'glbi-atelier-a2';
const ATELIER_TRACES = [ATELIER_MARKER, '/atelier/__api/', '__api/events', 'page.atelier'];
const TEXT_FILE = /\.(html?|js|mjs|cjs|css|json|txt|webmanifest|map|svg|xml)$/i;

function checkNoAtelier(outDir: string): void {
  const found: string[] = [];
  for (const rel of listFiles(outDir)) {
    if (/^atelier(\/|\.html$)/.test(rel)) {
      found.push(rel);
      continue;
    }
    if (!TEXT_FILE.test(rel)) continue;
    const text = fs.readFileSync(path.join(outDir, rel), 'utf8');
    if (ATELIER_TRACES.some((t) => text.includes(t))) found.push(rel);
  }
  if (found.length) {
    err(
      `code de l'atelier dans le dossier construit (${found.slice(0, 5).join(', ')}${found.length > 5 ? ', …' : ''}) : ` +
        'ne jamais lancer next build avec ATELIER=1 ; supprimer out/ et relancer npm run build',
    );
  }
}

function requireExport(outDir: string): void {
  if (process.env.ATELIER === '1') {
    // Avec ATELIER=1, next.config.ts déclare la page de l'atelier et exporte dans .next-atelier/ (dossier de l'atelier).
    err("ATELIER=1 défini : variable réservée à npm run atelier ; la retirer, supprimer out/ et .next-atelier/, puis relancer npm run build");
    fail();
  }
  if (!fs.existsSync(path.join(outDir, 'index.html'))) {
    err(`${toPosix(path.relative(ROOT, outDir)) || outDir}/index.html absent : lancer \`next build\` avant (ou \`npm run build\`)`);
    fail();
  }
  writingOut = outDir;
  checkNoAtelier(outDir);
  if (errors.length) fail();
  // `next build` recopie tout public/, y compris le livre de développement (npm run dev:book, Î10) : jamais publié.
  const devBook = path.join(outDir, path.basename(DEV_BOOK_OUT));
  if (fs.existsSync(devBook)) {
    fs.rmSync(devBook, { recursive: true, force: true });
    console.log(`build-book : ${DEV_BOOK_OUT}/ (livre de développement) retiré du dossier construit`);
  }
}

/** Cartouche de test (fixture `test-street`, lue par le lecteur actuel) : GLB optimisés, stubs et liste de fichiers. */
async function buildFixture(opts: Options): Promise<void> {
  const outDir = path.resolve(ROOT, opts.out);
  console.log('build-book : mode fixture (pas de --source) : cartouche de test src/content/book.json');
  const index = readJson(path.join(ROOT, 'src/content/book.json'), 'src/content/book.json') as { bookId?: unknown; scenes?: unknown } | undefined;
  const bookId = index?.bookId;
  const scenes = index?.scenes;
  if (typeof bookId !== 'string' || !Array.isArray(scenes) || !scenes.every((s) => typeof s === 'string')) {
    err('src/content/book.json : { bookId: string, scenes: string[] } attendu');
  }
  if (errors.length || opts.check) {
    if (errors.length) fail();
    console.log('build-book : --check sans --source : src/content/book.json et schema/glbi-layer3d.schema.json à jour');
    return;
  }
  requireExport(outDir);
  await optimizeFixtureGlbs(outDir, opts.textures);
  writeWebManifest(outDir, 'GLBInterpreter', 'fr', await writeIcons(path.join(ROOT, 'public/icon.png'), null, outDir, false));
  injectAppTitle(outDir, 'GLBInterpreter');
  writeStubs(outDir, scenes as string[], 'GLBInterpreter');
  const files = collectFiles(outDir, opts, false);
  if (errors.length) fail();
  fs.writeFileSync(path.join(outDir, 'book.json'), `${JSON.stringify({ bookId, scenes, fixture: true, files }, null, 2)}\n`);
  flushReport();
  const total = files.reduce((s, f) => s + f.size, 0);
  console.log(`build-book : ${(scenes as string[]).length} stub(s), ${files.length} fichiers (${(total / 1048576).toFixed(1)} MiB) listés dans out/book.json`);
}

async function buildBook(opts: Options, sourceArg: string): Promise<void> {
  const sourceDir = path.resolve(process.cwd(), sourceArg);
  const outDir = path.resolve(ROOT, opts.out);
  console.log(`build-book : livre ${toPosix(sourceDir)}${opts.check ? ' (validation seule)' : ''}`);
  // Contrôles partagés avec l'atelier (scripts/book-check.ts) : book.json, scènes, V-03, icônes, fichiers non référencés.
  const checked = await checkBookSource(sourceDir, report);
  if (!checked) fail();
  const { book, scenes, assets } = checked;

  if (errors.length) fail();
  if (opts.check) {
    flushReport();
    console.log(`build-book : livre « ${book.bookId} » valide (${scenes.length} scène(s), ${warnings.length} avertissement(s))`);
    for (const s of scenes) console.log(`  ${s.id} : couche 3D (GLBI_ROOT) + scenes/${s.id}.edit.json, ${s.modelCredits.length} crédit(s) de modèle`);
    return;
  }

  if (opts.dev) {
    await writeDevBook(opts, sourceDir, book, scenes, assets);
    return;
  }

  // --- Écriture du dossier construit ---
  requireExport(outDir);
  removeFixtureMedia(outDir);
  const textures = resolveTextureModeOrFail(opts.textures);
  let usesKtx2 = false;
  for (const s of scenes) {
    const glbRel = `scenes/${s.id}.glb`;
    if (!(await writeOptimizedScene(sourceDir, outDir, glbRel, s.protect, textures))) continue;
    usesKtx2 ||= fs.readFileSync(path.join(outDir, glbRel)).includes('KHR_texture_basisu');
    const built: BuiltScene = { ...s.config, build: { glb: glbRel, modelCredits: s.modelCredits } };
    const check = builtSceneSchema.safeParse(built);
    if (!check.success) formatIssues(check.error, `scenes/${s.id}.json (sortie) : `).forEach(err);
    fs.writeFileSync(path.join(outDir, `scenes/${s.id}.json`), `${JSON.stringify(built, null, 2)}\n`);
  }
  for (const a of [...assets].sort()) copyIntoOut(sourceDir, outDir, a);
  // Transcodeur Basis (≈ 0,6 MiB) inutile si aucune scène n'a de texture KTX2 : retiré du livre (jamais chargé dans ce cas).
  if (!usesKtx2 && fs.existsSync(path.join(outDir, 'decoders/basis'))) {
    fs.rmSync(path.join(outDir, 'decoders/basis'), { recursive: true, force: true });
    console.log('build-book : aucune texture KTX2, transcodeur Basis retiré du livre');
  }
  const maskableSource = path.join(sourceDir, 'icon-maskable.png');
  const icons = await writeIcons(path.join(sourceDir, 'icon.png'), fs.existsSync(maskableSource) ? maskableSource : null, outDir, true);
  writeWebManifest(outDir, book.title[book.languages[0]], book.languages[0], icons);
  injectAppTitle(outDir, book.title[book.languages[0]]);
  injectOg(outDir, book);
  writeStubs(outDir, book.scenes, book.title[book.languages[0]]);
  if (errors.length) fail();

  const files = collectFiles(outDir, opts);
  const builtBook = { ...book, files };
  const checkBook = builtBookSchema.safeParse(builtBook);
  if (!checkBook.success) formatIssues(checkBook.error, 'book.json (sortie) : ').forEach(err);
  if (errors.length) fail();
  fs.writeFileSync(path.join(outDir, 'book.json'), `${JSON.stringify(builtBook, null, 2)}\n`);

  const qr = await writeQrCodes(path.resolve(ROOT, opts.qrDir), book);
  flushReport();
  const total = files.reduce((sum, f) => sum + f.size, 0);
  console.log(`build-book : livre « ${book.bookId} » : ${scenes.length} scène(s), ${files.length} fichiers (${(total / 1048576).toFixed(1)} MiB) listés dans out/book.json`);
  console.log(`build-book : ${qr.length} QR dans ${toPosix(path.join(opts.qrDir, book.bookId))}/ (${book.origin}/s/<scène>)`);
}

/**
 * Livre de développement (Î10) : mêmes scènes et assets que le dossier construit (GLB optimisés, `scenes/<id>.json`
 * validés), sans l'application. `files` est vide : rien n'est installé ni mis en cache en développement.
 */
async function writeDevBook(opts: Options, sourceDir: string, book: Book, scenes: SceneResult[], assets: Set<string>): Promise<void> {
  const outDir = path.resolve(ROOT, DEV_BOOK_OUT);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'scenes'), { recursive: true });
  writingOut = outDir;
  const textures = resolveTextureModeOrFail(opts.textures);
  for (const s of scenes) {
    const glbRel = `scenes/${s.id}.glb`;
    if (!(await writeOptimizedScene(sourceDir, outDir, glbRel, s.protect, textures))) continue;
    const built: BuiltScene = { ...s.config, build: { glb: glbRel, modelCredits: s.modelCredits } };
    const check = builtSceneSchema.safeParse(built);
    if (!check.success) formatIssues(check.error, `scenes/${s.id}.json (sortie) : `).forEach(err);
    fs.writeFileSync(path.join(outDir, `scenes/${s.id}.json`), `${JSON.stringify(built, null, 2)}\n`);
  }
  for (const a of [...assets].sort()) copyIntoOut(sourceDir, outDir, a);
  if (errors.length) fail();
  fs.writeFileSync(path.join(outDir, 'book.json'), `${JSON.stringify({ ...book, files: [] }, null, 2)}\n`);
  flushReport();
  console.log(`build-book : livre de développement « ${book.bookId} » (${scenes.length} scène(s)) dans ${DEV_BOOK_OUT}/ : lancer \`npm run dev\` puis ouvrir #/s/<scène>`);
}

async function main(): Promise<void> {
  let opts: Options;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`build-book : ${(e as Error).message}`);
    process.exit(2);
  }
  // A1 : le JSON Schema de la couche 3D commité (copié dans l'addon) doit correspondre au Zod.
  if (opts.check) {
    const stale = checkSchemaFresh();
    if (stale) err(stale);
  }
  if (opts.source) await buildBook(opts, opts.source);
  else await buildFixture(opts);
}

main().catch((e) => {
  console.error('build-book : échec inattendu', e);
  process.exit(1);
});
