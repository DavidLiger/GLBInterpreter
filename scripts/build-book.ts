// scripts/build-book.ts — assemble le dossier du livre après `next build` (Î6 ; absorbe generate-scene-stubs.mjs).
//
//   npm run build -- --source <dossier du livre>     next build + livre complet (mode livre)
//   npm run build                                    next build + cartouche de test (mode fixture, provisoire)
//   npm run book:check -- --source <dossier>         validation seule, sans next build ni écriture
//   option --textures auto|ktx2|webp|keep            textures des GLB (défaut auto : KTX2 si `ktx` est installé, sinon WebP)
//
// Dossier source d'un livre (chemins d'assets relatifs à sa racine = racine du dossier construit, D-8.1) :
//   book.json                    couche livre (spec-extras-blender.md §5)
//   scenes/<scène>.glb           GLB de la scène ; config dans les extras de l'empty GLBI_ROOT (§2, §4)
//   scenes/<scène>.json          facultatif : config de développement, utilisée seulement si le GLB n'a pas de GLBI_ROOT
//   icon-192.png, icon-512.png   facultatifs : icônes du manifest (Î9)
//   images/, icons/, sounds/…    assets référencés par les configs et book.json (seuls ceux-là sont copiés)
//
// Ordre (Î7) : la config est lue et validée sur le GLB SOURCE, puis le GLB est optimisé (scripts/glb-pipeline.ts : extras
// étrangers retirés, prune, dedup sans MATERIAL, textures KTX2/WebP, Meshopt) vers out/scenes/<scène>.glb ; le GLB écrit est
// relu et comparé (GLBI_ROOT, clips, src_*, nœuds cités par la config). Un GLB source déjà Meshopt est accepté ; Draco, non.
// Limite d'hébergement (25 MiB par fichier) contrôlée sur le dossier construit : erreur en mode livre, pas de découpage.
//
// Mode livre, dans out/ : scenes/<scène>.glb, scenes/<scène>.json (config validée + crédits des modèles),
// assets référencés, manifest.webmanifest, og:image dans index.html, stubs s/<scène>/index.html (D-8.4),
// book.json (livre + liste des fichiers { path, size, sha256 }). QR SVG par scène dans dist/qr/<bookId>/.
// Mode fixture : GLB de out/ optimisés sur place (empties conservés), stubs d'après src/content/book.json et
// out/book.json { bookId, scenes, fixture, files }.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Document, Node as GNode } from '@gltf-transform/core';
import QRCode from 'qrcode';
import {
  formatMiB,
  optimizeGlbFile,
  readGlbFile,
  referencedNodeNames,
  resolveTextureMode,
  TEXTURE_MODES,
  type TextureMode,
} from './glb-pipeline';
import {
  bookSchema,
  builtBookSchema,
  builtSceneSchema,
  formatIssues,
  glbiConfigSchema,
  GLBI_ROOT_NAME,
  GLBI_VERSION,
  SCENE_ID_PATTERN,
  type Book,
  type BookFile,
  type BuiltScene,
  type GlbiConfig,
  type ModelCredit,
} from '../src/schema/glbi';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Limites de Cloudflare Pages (architecture, Déploiement). */
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 20000;

/** Fichiers du dossier construit absents de la liste de téléchargement (Î8) : l'index lui-même et le service worker. */
const EXCLUDED_FROM_FILES = [/^book\.json$/, /^sw\.js(\.map)?$/, /^swe-worker-[^/]*\.js$/, /\.map$/, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/];

// ---------------------------------------------------------------------------------------------------------
// Rapport : erreurs (bloquantes) et avertissements
// ---------------------------------------------------------------------------------------------------------

const errors: string[] = [];
const warnings: string[] = [];
const err = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);

function flushReport(): void {
  for (const w of warnings) console.warn(`  avertissement : ${w}`);
  for (const e of errors) console.error(`  ERREUR : ${e}`);
}

function fail(): never {
  flushReport();
  console.error(`build-book : ${errors.length} erreur(s), ${warnings.length} avertissement(s). Rien n'est publié.`);
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
  textures: TextureMode;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { source: process.env.BOOK_SOURCE || null, out: 'out', qrDir: 'dist/qr', check: false, textures: 'auto' };
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
    else if (a === '--textures') {
      const t = next() as TextureMode;
      if (!TEXTURE_MODES.includes(t)) throw new Error(`--textures : ${TEXTURE_MODES.join(', ')} attendu (trouvé « ${t} »)`);
      opts.textures = t;
    } else throw new Error(`option inconnue « ${a} » (options : --source, --out, --qr-dir, --check, --textures)`);
  }
  return opts;
}

// ---------------------------------------------------------------------------------------------------------
// Fichiers
// ---------------------------------------------------------------------------------------------------------

const toPosix = (p: string) => p.split(path.sep).join('/');

function listFiles(dir: string): string[] {
  const outList: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) outList.push(toPosix(path.relative(dir, full)));
    }
  };
  walk(dir);
  return outList.sort();
}

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readJson(file: string, label: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    err(`${label} : JSON illisible (${(e as Error).message})`);
    return undefined;
  }
}

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
// Lecture d'une scène (GLB + config)
// ---------------------------------------------------------------------------------------------------------

interface SceneResult {
  id: string;
  config: GlbiConfig;
  source: 'glb' | 'json';
  modelCredits: ModelCredit[];
  /** Assets référencés par la config (chemins relatifs à la racine du livre). */
  assets: Set<string>;
  /** Nœuds cités par la config (cible caméra, objets animés) : protégés de `prune` à l'optimisation. */
  protect: string[];
}

/** Valeur de `glbi_config` : chaîne JSON qui doit donner un objet (`JSON.parse("1.0")` renvoie 1 sans exception). */
function parseConfigString(raw: unknown, label: string): unknown {
  if (typeof raw !== 'string') {
    err(`${label} : glbi_config doit être une chaîne JSON (trouvé : ${raw === undefined ? 'absent' : typeof raw})`);
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    err(`${label} : glbi_config n'est pas du JSON valide (${(e as Error).message})`);
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    err(`${label} : glbi_config doit contenir un objet JSON (trouvé : ${Array.isArray(parsed) ? 'tableau' : JSON.stringify(parsed)})`);
    return undefined;
  }
  return parsed;
}

function descendants(node: GNode): Set<GNode> {
  const set = new Set<GNode>();
  const walk = (n: GNode) => {
    set.add(n);
    n.listChildren().forEach(walk);
  };
  walk(node);
  return set;
}

const SRC_KEYS = { src_name: 'name', src_author: 'author', src_license: 'license', src_url: 'url' } as const;

async function readScene(sourceDir: string, id: string): Promise<SceneResult | null> {
  const label = `scène « ${id} »`;
  const glbRel = `scenes/${id}.glb`;
  const jsonRel = `scenes/${id}.json`;
  const glbFile = path.join(sourceDir, glbRel);
  const jsonFile = path.join(sourceDir, jsonRel);

  if (!fs.existsSync(glbFile)) {
    err(`${label} : ${glbRel} absent du dossier source`);
    return null;
  }

  let doc: Document;
  try {
    doc = await readGlbFile(glbFile);
  } catch (e) {
    err(`${label} : ${glbRel} illisible (${(e as Error).message})`);
    return null;
  }

  const root = doc.getRoot();
  const nodes = root.listNodes();
  const byName = new Map<string, GNode[]>();
  for (const n of nodes) byName.set(n.getName(), [...(byName.get(n.getName()) ?? []), n]);

  // --- Source de la config : GLBI_ROOT (principale) ou JSON à côté du GLB (développement) ---
  const glbiRoots = byName.get(GLBI_ROOT_NAME) ?? [];
  let raw: unknown;
  let source: 'glb' | 'json';
  if (glbiRoots.length > 1) {
    err(`${label} : ${glbiRoots.length} nœuds ${GLBI_ROOT_NAME} dans le GLB (un seul attendu)`);
    return null;
  }
  if (glbiRoots.length === 1) {
    source = 'glb';
    const extras = glbiRoots[0].getExtras() ?? {};
    const v = extras.glbi_version;
    if (!(typeof v === 'number' && Number.isInteger(v) && v === GLBI_VERSION)) {
      err(`${label} : glbi_version doit être l'entier ${GLBI_VERSION} (trouvé : ${JSON.stringify(v)})`);
    }
    raw = parseConfigString(extras.glbi_config, label);
    if (fs.existsSync(jsonFile)) warn(`${label} : ${jsonRel} ignoré, le GLB porte ${GLBI_ROOT_NAME} (source principale)`);
  } else if (fs.existsSync(jsonFile)) {
    source = 'json';
    warn(`${label} : pas de ${GLBI_ROOT_NAME} dans le GLB, config lue dans ${jsonRel} (source de développement)`);
    raw = readJson(jsonFile, `${label} (${jsonRel})`);
    if (raw !== undefined && (raw === null || typeof raw !== 'object' || Array.isArray(raw))) {
      err(`${label} : ${jsonRel} doit contenir un objet JSON`);
      raw = undefined;
    }
  } else {
    err(`${label} : pas de nœud ${GLBI_ROOT_NAME} dans ${glbRel} (export « Custom Properties » coché ?) ni de ${jsonRel}`);
    return null;
  }
  if (raw === undefined) return null;

  // --- Schéma (V-01 et règles de forme : V-02, V-05, V-09, quiz, modules réservés) ---
  const parsed = glbiConfigSchema.safeParse(raw);
  if (!parsed.success) {
    formatIssues(parsed.error, `${label} : `).forEach(err);
    return null;
  }
  const config = parsed.data;

  if (config.scene.id !== id) err(`${label} : scene.id vaut « ${config.scene.id} », attendu « ${id} » (nom du fichier et book.json)`);

  // --- V-08 : références d'objets ; V-04 : cible caméra (empty du POI unique) ---
  const findNode = (name: string, what: string): GNode | null => {
    const found = byName.get(name) ?? [];
    if (found.length === 0) {
      err(`${label} : ${what} « ${name} » introuvable dans le GLB (V-08)`);
      return null;
    }
    if (found.length > 1) warn(`${label} : ${found.length} nœuds nommés « ${name} » (noms uniques attendus, spec §3)`);
    return found[0];
  };

  const { camera, animations } = config.modules;
  if (camera) {
    const t = findNode(camera.target, 'camera.target');
    if (t?.getMesh()) warn(`${label} : camera.target « ${camera.target} » porte un maillage (un empty est attendu, V-04)`);
  }

  // --- Clips : contrôle dans les deux sens (spec §3) ---
  const glbAnims = root.listAnimations();
  const glbClipNames = glbAnims.map((a) => a.getName());
  for (const d of new Set(glbClipNames.filter((n, i) => glbClipNames.indexOf(n) !== i))) err(`${label} : clip « ${d} » en double dans le GLB`);

  if (animations) {
    const skinJoints = new Set(root.listSkins().flatMap((s) => s.listJoints()));
    const refs: { object: string; clip: string; type: 'armature' | 'mesh' | null; where: string }[] = [
      { object: animations.idle.object, clip: animations.idle.clip, type: null, where: 'animations.idle' },
      ...animations.actions.map((a, i) => ({ object: a.object, clip: a.clip, type: a.type, where: `animations.actions.${i} (« ${a.id} »)` })),
    ];
    for (const r of refs) {
      const node = findNode(r.object, `${r.where}.object`);
      const anim = glbAnims.find((a) => a.getName() === r.clip);
      if (!anim) {
        err(`${label} : ${r.where} : clip « ${r.clip} » absent du GLB`);
        continue;
      }
      if (!node) continue;
      const sub = descendants(node);
      if (r.type === 'armature' && ![...sub].some((n) => skinJoints.has(n))) {
        warn(`${label} : ${r.where} : « ${r.object} » déclaré armature mais aucun os de skin sous ce nœud`);
      }
      if (r.type === 'mesh' && !node.getMesh()) warn(`${label} : ${r.where} : « ${r.object} » déclaré mesh mais sans maillage`);
      const animated = anim.listChannels().some((c) => {
        const t = c.getTargetNode();
        return t !== null && sub.has(t);
      });
      if (!animated) warn(`${label} : ${r.where} : le clip « ${r.clip} » n'anime ni « ${r.object} » ni ses descendants`);
    }
    const declared = new Set(refs.map((r) => r.clip));
    const undeclared = glbClipNames.filter((n) => !declared.has(n));
    if (undeclared.length) warn(`${label} : clip(s) du GLB non déclaré(s) : ${undeclared.join(', ')}`);
    if (glbClipNames.length === 1 && glbClipNames[0] === 'Animation' && !declared.has('Animation')) {
      err(`${label} : le GLB n'a qu'un clip « Animation » : export Blender avec Animation Mode = Actions obligatoire (spec §2)`);
    }
  } else if (glbClipNames.length) {
    warn(`${label} : ${glbClipNames.length} clip(s) dans le GLB mais pas de module animations`);
  }

  // --- Hygiène : les extras de scène hors glbi_ et de nœud hors glbi_/src_ sont retirés à l'optimisation (Î7),
  //     listés dans le journal d'écriture de la scène.

  // --- Crédits des modèles : propriétés src_* des nœuds (D-8.5), dédoublonnées ---
  const credits = new Map<string, ModelCredit>();
  for (const n of nodes) {
    const ex = n.getExtras() ?? {};
    const c: ModelCredit = {};
    for (const [k, field] of Object.entries(SRC_KEYS)) {
      const v = ex[k];
      if (typeof v === 'string' && v.trim()) c[field] = v.trim();
    }
    if (!Object.keys(c).length) continue;
    const key = JSON.stringify([c.name, c.author, c.license, c.url]);
    if (!credits.has(key)) credits.set(key, c);
  }
  const modelCredits = [...credits.values()];
  if (!modelCredits.length) warn(`${label} : aucun crédit de modèle (propriétés src_*) dans le GLB`);
  for (const c of modelCredits) {
    if (!c.author || !c.license) warn(`${label} : crédit de modèle incomplet ${JSON.stringify(c)} (src_author et src_license attendus)`);
  }

  // --- Assets référencés ---
  const assets = new Set<string>();
  if (config.scene.loaderImage) assets.add(config.scene.loaderImage);
  const sounds = new Set<string>();
  for (const a of animations?.actions ?? []) {
    if (a.icon) assets.add(a.icon);
    if (a.sound) {
      assets.add(a.sound);
      sounds.add(a.sound);
    }
  }
  if (config.modules.audio?.ambientSound) {
    assets.add(config.modules.audio.ambientSound);
    sounds.add(config.modules.audio.ambientSound);
  }
  const creditList = config.modules.credits?.assets ?? [];
  for (const c of creditList) assets.add(c.asset);

  // V-10 : chaque son a un crédit ; crédit sans usage = avertissement
  const credited = new Set(creditList.map((c) => c.asset));
  for (const s of sounds) if (!credited.has(s)) err(`${label} : son « ${s} » sans entrée dans modules.credits.assets (V-10)`);
  const used = new Set([...sounds, ...(animations?.actions ?? []).map((a) => a.icon), config.scene.loaderImage].filter(Boolean));
  for (const c of creditList) if (!used.has(c.asset)) warn(`${label} : crédit pour « ${c.asset} », asset non utilisé par la scène`);

  return { id, config, source, modelCredits, assets, protect: referencedNodeNames(config) };
}

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
 * Liste des fichiers du dossier construit (O-13, C-34) + contrôle des limites de l'hébergeur.
 * `strict` : dépassement = erreur (livre publié) ; sinon avertissement (cartouche de test, jamais publiée).
 */
function collectFiles(outDir: string, strict = true): BookFile[] {
  const limit = (m: string) => (strict ? err(m) : warn(`${m} ; toléré pour la cartouche de test, refusé pour un livre`));
  const all = listFiles(outDir);
  if (all.length > MAX_FILES) limit(`${all.length} fichiers dans le dossier construit (limite ${MAX_FILES})`);
  const files: BookFile[] = [];
  for (const rel of all) {
    const full = path.join(outDir, rel);
    const size = fs.statSync(full).size;
    if (size > MAX_FILE_BYTES) limit(`${rel} : ${(size / 1048576).toFixed(1)} MiB (limite ${MAX_FILE_BYTES / 1048576} MiB par fichier)`);
    if (EXCLUDED_FROM_FILES.some((re) => re.test(rel))) continue;
    files.push({ path: rel, size, sha256: sha256(full) });
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

function writeWebManifest(sourceDir: string, outDir: string, book: Book): void {
  const lang = book.languages[0];
  const icons: { src: string; sizes: string; type: string; purpose: string }[] = [];
  for (const size of [192, 512]) {
    const rel = `icon-${size}.png`;
    if (fs.existsSync(path.join(sourceDir, rel))) {
      copyIntoOut(sourceDir, outDir, rel);
      icons.push({ src: rel, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' });
    } else {
      warn(`${rel} absent du dossier source : manifest sans cette icône (icônes du livre : Î9)`);
    }
  }
  const manifest = {
    id: './',
    name: book.title[lang],
    short_name: book.title[lang],
    lang,
    start_url: './',
    scope: './',
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone'],
    orientation: 'any',
    background_color: '#000000',
    theme_color: '#000000',
    icons,
  };
  fs.writeFileSync(path.join(outDir, 'manifest.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);
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
const FIXTURE_MEDIA = ['models', 'videos', 'sounds', 'spritesheets', 'jsons', 'image/dioramas', 'images/dioramas'];

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

function requireExport(outDir: string): void {
  if (!fs.existsSync(path.join(outDir, 'index.html'))) {
    err(`${toPosix(path.relative(ROOT, outDir)) || outDir}/index.html absent : lancer \`next build\` avant (ou \`npm run build\`)`);
    fail();
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
    console.log('build-book : --check sans --source : rien à valider au-delà de src/content/book.json');
    return;
  }
  requireExport(outDir);
  await optimizeFixtureGlbs(outDir, opts.textures);
  writeStubs(outDir, scenes as string[], 'GLBInterpreter');
  const files = collectFiles(outDir, false);
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
  if (!fs.existsSync(path.join(sourceDir, 'book.json'))) {
    err(`${toPosix(sourceDir)}/book.json absent`);
    fail();
  }

  // --- Couche livre ---
  const rawBook = readJson(path.join(sourceDir, 'book.json'), 'book.json');
  if (rawBook === undefined) fail();
  const parsedBook = bookSchema.safeParse(rawBook);
  if (!parsedBook.success) {
    formatIssues(parsedBook.error, 'book.json : ').forEach(err);
    fail();
  }
  const book = parsedBook.data;

  // --- Scènes ---
  const scenes: SceneResult[] = [];
  for (const id of book.scenes) {
    const r = await readScene(sourceDir, id);
    if (r) scenes.push(r);
  }

  // --- V-03 : existence des assets ; contrôle de taille des sources ---
  const assets = new Set<string>(scenes.flatMap((s) => [...s.assets]));
  if (book.ogImage) assets.add(book.ogImage);
  else warn('book.json : pas de ogImage (aperçu de partage)');
  for (const a of [...assets].sort()) {
    const f = path.join(sourceDir, a);
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) err(`asset « ${a} » introuvable dans le dossier source (V-03)`);
  }

  // --- Fichiers sources non utilisés ---
  const known = new Set<string>(['book.json', 'icon-192.png', 'icon-512.png', ...assets]);
  for (const id of book.scenes) known.add(`scenes/${id}.glb`).add(`scenes/${id}.json`);
  const unused = listFiles(sourceDir).filter((f) => !known.has(f));
  if (unused.length && !errors.length) warn(`fichier(s) source non référencé(s), non copié(s) : ${unused.join(', ')}`);

  // --- Lecteur compilé (cartouche de test jusqu'à Î10) ---
  const compiled = readJson(path.join(ROOT, 'src/content/book.json'), 'src/content/book.json') as { scenes?: string[] } | undefined;
  if (compiled?.scenes && compiled.scenes.join() !== book.scenes.join()) {
    warn(`le lecteur compilé lit encore la cartouche de test (scènes : ${compiled.scenes.join(', ')}) : les scènes du livre ne s'ouvrent pas avant Î10`);
  }

  if (errors.length) fail();
  if (opts.check) {
    flushReport();
    console.log(`build-book : livre « ${book.bookId} » valide (${scenes.length} scène(s), ${warnings.length} avertissement(s))`);
    for (const s of scenes) console.log(`  ${s.id} : config ${s.source === 'glb' ? 'GLBI_ROOT' : 'JSON de développement'}, ${s.modelCredits.length} crédit(s) de modèle`);
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
    const built: BuiltScene = { ...s.config, build: { glb: glbRel, source: s.source, modelCredits: s.modelCredits } };
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
  writeWebManifest(sourceDir, outDir, book);
  injectOg(outDir, book);
  writeStubs(outDir, book.scenes, book.title[book.languages[0]]);
  if (errors.length) fail();

  const files = collectFiles(outDir);
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

async function main(): Promise<void> {
  let opts: Options;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`build-book : ${(e as Error).message}`);
    process.exit(2);
  }
  if (opts.source) await buildBook(opts, opts.source);
  else await buildFixture(opts);
}

main().catch((e) => {
  console.error('build-book : échec inattendu', e);
  process.exit(1);
});
