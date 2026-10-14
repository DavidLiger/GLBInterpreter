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
import { fileURLToPath } from 'node:url';
import type { Document, Node as GNode } from '@gltf-transform/core';
import QRCode from 'qrcode';
import sharp from 'sharp';
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
  GLBI_ROOT_NAME,
  SCENE_ID_PATTERN,
  type Book,
  type BookFile,
  type BookFilePart,
  type BuiltScene,
  type GlbiConfig,
  type ModelCredit,
} from '../src/schema/glbi';
import { mergeLayers } from '../src/schema/merge';
import { checkSchemaFresh } from './export-schema';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const errors: string[] = [];
const warnings: string[] = [];
const err = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);
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
  const editRel = `scenes/${id}.edit.json`;
  const oldJsonRel = `scenes/${id}.json`;
  const glbFile = path.join(sourceDir, glbRel);
  const editFile = path.join(sourceDir, editRel);

  // D-8.9 (A1) : l'ancienne config de développement à côté du GLB n'est plus lue ; sa présence est une erreur.
  if (fs.existsSync(path.join(sourceDir, oldJsonRel))) {
    err(`${oldJsonRel} : ancienne config de développement, plus lue depuis D-8.9 ; à supprimer (couche 3D dans le GLB, couche éditoriale dans ${editRel})`);
  }
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

  // --- Couche 3D : GLBI_ROOT du GLB (seule source) ---
  const glbiRoots = byName.get(GLBI_ROOT_NAME) ?? [];
  if (glbiRoots.length === 0) {
    err(`${glbRel} : pas de nœud ${GLBI_ROOT_NAME} ; exporter la scène avec l'addon GLBGenerator`);
    return null;
  }
  if (glbiRoots.length > 1) {
    err(`${label} : ${glbiRoots.length} nœuds ${GLBI_ROOT_NAME} dans le GLB (un seul attendu)`);
    return null;
  }
  const extras = glbiRoots[0].getExtras() ?? {};
  const raw3d = parseConfigString(extras.glbi_config, `${glbRel} (couche 3D)`);
  if (raw3d === undefined) return null;

  // --- Couche éditoriale : scenes/<id>.edit.json (absente : erreur donnée par la fusion) ---
  let rawEdit: unknown;
  if (fs.existsSync(editFile)) {
    rawEdit = readJson(editFile, editRel);
    if (rawEdit === undefined) return null;
    if (rawEdit === null || typeof rawEdit !== 'object' || Array.isArray(rawEdit)) {
      err(`${editRel} : doit contenir un objet JSON`);
      return null;
    }
  }

  // --- Fusion et schéma (V-01 et règles de forme : V-02, V-05, V-09, quiz, modules réservés ; spec-atelier-glbi.md §5) ---
  const merged = mergeLayers(raw3d, rawEdit, { mode: 'strict', sceneId: id, glbiVersion: extras.glbi_version });
  merged.warnings.forEach(warn);
  merged.errors.forEach(err);
  if (!merged.config) return null;
  const config = merged.config;

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

  return { id, config, modelCredits, assets, protect: referencedNodeNames(config) };
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
const ICON_MIN_PX = 512;

/** Source d'icône utilisable : PNG (ou autre format lu par sharp) carré d'au moins ICON_MIN_PX px. */
async function iconSourceOk(file: string, report: (m: string) => void): Promise<boolean> {
  const name = toPosix(path.relative(ROOT, file)) || file;
  try {
    const m = await sharp(file).metadata();
    if (m.width !== m.height || (m.width ?? 0) < ICON_MIN_PX) {
      report(`${name} : ${m.width}×${m.height} px, carré ≥ ${ICON_MIN_PX} px attendu`);
      return false;
    }
    return true;
  } catch (e) {
    report(`${name} : image illisible (${(e as Error).message})`);
    return false;
  }
}

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

function requireExport(outDir: string): void {
  if (!fs.existsSync(path.join(outDir, 'index.html'))) {
    err(`${toPosix(path.relative(ROOT, outDir)) || outDir}/index.html absent : lancer \`next build\` avant (ou \`npm run build\`)`);
    fail();
  }
  writingOut = outDir;
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
  const known = new Set<string>(['book.json', 'icon.png', 'icon-maskable.png', ...assets]);
  if (!fs.existsSync(path.join(sourceDir, 'icon.png'))) err(`icon.png absent du dossier source : icône du livre obligatoire (PNG carré ≥ ${ICON_MIN_PX} px, Î9)`);
  else await iconSourceOk(path.join(sourceDir, 'icon.png'), err);
  if (fs.existsSync(path.join(sourceDir, 'icon-maskable.png'))) await iconSourceOk(path.join(sourceDir, 'icon-maskable.png'), err);
  for (const id of book.scenes) known.add(`scenes/${id}.glb`).add(`scenes/${id}.edit.json`);
  const unused = listFiles(sourceDir).filter((f) => !known.has(f));
  if (unused.length && !errors.length) warn(`fichier(s) source non référencé(s), non copié(s) : ${unused.join(', ')}`);

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
