// scripts/glb-pipeline.ts — optimisation des GLB d'un livre (Î7). Utilisé par build-book.ts et glb-report.ts.
//
// Ordre : extras étrangers retirés → prune (protégé) → dedup sans MATERIAL → textures (KTX2 ou WebP) → meshopt.
// - `meshopt()` de gltf-transform appelle lui-même `reorder` + `quantize` : pas de passe `quantize` séparée
//   (le doublon signalé au test du 09/10 est confirmé ; une passe `quantize` après `meshopt` en CLI réécrit le fichier
//   sans EXT_meshopt_compression, d'où la hausse 3,21 → 3,27 Mo constatée).
// - `prune` : en bibliothèque, `keepExtras` vaut `false` par défaut et un empty feuille est supprimé même s'il porte des
//   extras (au test, GLBI_ROOT a survécu parce qu'il était le parent du rig, pas grâce à ses extras). D'où
//   `keepExtras: true`, appliqué APRÈS le retrait des extras étrangers, et la protection des nœuds nommés dans la config
//   (cible caméra `start`, objets animés) par un marqueur temporaire.
// - Pas de Draco (Meshopt retenu) : un GLB source compressé en Draco est refusé avec un message explicite.
// - Textures : KTX2 (BasisU, outil `ktx` de KTX-Software ≥ 4.4 dans le PATH) ou WebP (sharp). `auto` = KTX2 si `ktx` est
//   disponible, sinon WebP. ETC1S pour la couleur et les données, UASTC + zstd pour les cartes de normales.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ImageUtils,
  Logger,
  NodeIO,
  PropertyType,
  TextureChannel,
  type Document,
} from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import {
  dedup,
  getTextureChannelMask,
  getTextureColorSpace,
  listTextureSlots,
  meshopt,
  prune,
  textureCompress,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

export type TextureMode = 'auto' | 'ktx2' | 'webp' | 'keep';
export const TEXTURE_MODES: readonly TextureMode[] = ['auto', 'ktx2', 'webp', 'keep'];

/** Préfixes d'extras conservés : scène → `glbi_` ; nœuds → `glbi_` et `src_` (spec-extras-blender.md §3). */
const SCENE_KEEP = /^glbi_/;
const NODE_KEEP = /^(glbi_|src_)/;
/** Marqueur temporaire posé sur les nœuds protégés pendant `prune` (retiré ensuite). */
const KEEP_MARK = 'glbi__keep';

const KTX_MIN = [4, 4, 0];

// ---------------------------------------------------------------------------------------------------------
// Lecture / écriture
// ---------------------------------------------------------------------------------------------------------

let ioPromise: Promise<NodeIO> | null = null;

/** NodeIO avec toutes les extensions et le codec Meshopt (lecture d'un GLB déjà compressé, écriture compressée). */
export function getIO(): Promise<NodeIO> {
  ioPromise ??= (async () => {
    await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
    return new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  })();
  return ioPromise;
}

/** Extensions déclarées dans le chunk JSON d'un GLB (lecture de l'en-tête seulement). */
function glbExtensionsUsed(file: string): string[] {
  const b = fs.readFileSync(file);
  if (b.length < 20 || b.readUInt32LE(0) !== 0x46546c67 || b.readUInt32LE(16) !== 0x4e4f534a) return [];
  try {
    const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')) as { extensionsUsed?: string[] };
    return json.extensionsUsed ?? [];
  } catch {
    return [];
  }
}

/** Lit un GLB ; un GLB Draco est refusé (pas de décodeur Draco : Meshopt retenu). */
export async function readGlbFile(file: string): Promise<Document> {
  if (glbExtensionsUsed(file).includes('KHR_draco_mesh_compression')) {
    throw new Error('compression Draco (KHR_draco_mesh_compression) non prise en charge, Meshopt retenu : réexporter le GLB sans compression');
  }
  const io = await getIO();
  return (await io.read(file)).setLogger(new Logger(Logger.Verbosity.WARN));
}

export async function writeGlbFile(file: string, doc: Document): Promise<number> {
  const io = await getIO();
  const bytes = await io.writeBinary(doc);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return bytes.byteLength;
}

// ---------------------------------------------------------------------------------------------------------
// Instantané : ce qui doit survivre à l'optimisation
// ---------------------------------------------------------------------------------------------------------

export interface GlbSnapshot {
  /** Extras de chaque nœud GLBI_ROOT, sérialisés (comparaison exacte). */
  glbiRoot: string[];
  /** Noms des clips, triés. */
  clips: string[];
  /** Propriétés `src_*` des nœuds, sérialisées et triées. */
  srcCredits: string[];
  /** Noms de tous les nœuds. */
  nodeNames: Set<string>;
  /** Clés d'extras de scène, toutes. */
  sceneExtraKeys: string[];
  /** Clés d'extras de nœud hors `glbi_` / `src_`. */
  foreignNodeExtraKeys: string[];
  textures: { mime: string; bytes: number }[];
  extensions: string[];
}

export function snapshot(doc: Document): GlbSnapshot {
  const root = doc.getRoot();
  const nodes = root.listNodes();
  const pick = (ex: Record<string, unknown>, re: RegExp) =>
    JSON.stringify(Object.fromEntries(Object.entries(ex).filter(([k]) => re.test(k)).sort(([a], [b]) => a.localeCompare(b))));
  return {
    glbiRoot: nodes.filter((n) => n.getName() === 'GLBI_ROOT').map((n) => pick(n.getExtras() ?? {}, /^glbi_/)),
    clips: root.listAnimations().map((a) => a.getName()).sort(),
    srcCredits: nodes
      .map((n) => n.getExtras() ?? {})
      .filter((ex) => Object.keys(ex).some((k) => k.startsWith('src_')))
      .map((ex) => pick(ex, /^src_/))
      .sort(),
    nodeNames: new Set(nodes.map((n) => n.getName())),
    sceneExtraKeys: root.listScenes().flatMap((s) => Object.keys(s.getExtras() ?? {})),
    foreignNodeExtraKeys: [...new Set(nodes.flatMap((n) => Object.keys(n.getExtras() ?? {}).filter((k) => !NODE_KEEP.test(k))))],
    textures: root.listTextures().map((t) => ({ mime: t.getMimeType(), bytes: t.getImage()?.byteLength ?? 0 })),
    extensions: root.listExtensionsUsed().map((e) => e.extensionName).sort(),
  };
}

/**
 * Compare l'avant et l'après : GLBI_ROOT et ses extras identiques, mêmes clips, mêmes crédits `src_*`, nœuds protégés
 * présents, plus aucun extra étranger. Renvoie la liste des écarts (vide = survie complète).
 */
export function compareSnapshots(before: GlbSnapshot, after: GlbSnapshot, protect: Iterable<string> = []): string[] {
  const issues: string[] = [];
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
  if (!same(before.glbiRoot, after.glbiRoot)) {
    issues.push(`GLBI_ROOT : ${before.glbiRoot.length} avant, ${after.glbiRoot.length} après, ou extras glbi_* modifiés`);
  }
  if (!same(before.clips, after.clips)) {
    const lost = before.clips.filter((c) => !after.clips.includes(c));
    const added = after.clips.filter((c) => !before.clips.includes(c));
    issues.push(`clips modifiés (perdus : ${lost.join(', ') || '—'} ; ajoutés : ${added.join(', ') || '—'})`);
  }
  if (!same(before.srcCredits, after.srcCredits)) issues.push('propriétés src_* des nœuds modifiées ou perdues');
  for (const name of protect) {
    if (before.nodeNames.has(name) && !after.nodeNames.has(name)) issues.push(`nœud « ${name} » (référencé par la config) supprimé`);
  }
  const foreignScene = after.sceneExtraKeys.filter((k) => !SCENE_KEEP.test(k));
  if (foreignScene.length) issues.push(`extras de scène hors glbi_ restants : ${foreignScene.join(', ')}`);
  if (after.foreignNodeExtraKeys.length) issues.push(`extras de nœud hors glbi_/src_ restants : ${after.foreignNodeExtraKeys.join(', ')}`);
  return issues;
}

/**
 * Noms de nœuds cités par une config `glbi_config` (cible caméra, objets animés) : à protéger de `prune`.
 * Lecture tolérante (la config est validée ailleurs, par le schéma Zod de build-book).
 */
export function referencedNodeNames(config: unknown): string[] {
  const names = new Set<string>();
  const m = (config as { modules?: Record<string, unknown> } | null)?.modules;
  const camera = m?.camera as { target?: unknown } | undefined;
  const anims = m?.animations as { idle?: { object?: unknown }; actions?: { object?: unknown }[] } | undefined;
  for (const v of [camera?.target, anims?.idle?.object, ...(Array.isArray(anims?.actions) ? anims.actions.map((a) => a?.object) : [])]) {
    if (typeof v === 'string' && v) names.add(v);
  }
  return [...names];
}

/** Noms protégés d'après la config portée par GLBI_ROOT (chaîne JSON), si elle est lisible. */
export function referencedNodeNamesInGlb(doc: Document): string[] {
  const root = doc.getRoot().listNodes().find((n) => n.getName() === 'GLBI_ROOT');
  const raw = root?.getExtras()?.glbi_config;
  if (typeof raw !== 'string') return [];
  try {
    return referencedNodeNames(JSON.parse(raw));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------------------------------------
// Étapes
// ---------------------------------------------------------------------------------------------------------

/** Retire les extras de scène hors `glbi_` et de nœud hors `glbi_` / `src_`. Renvoie les clés retirées. */
export function stripForeignExtras(doc: Document): { scene: string[]; node: string[] } {
  const removed = { scene: new Set<string>(), node: new Set<string>() };
  const filter = (ex: Record<string, unknown>, keep: RegExp, into: Set<string>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ex)) {
      if (keep.test(k)) out[k] = v;
      else into.add(k);
    }
    return out;
  };
  for (const s of doc.getRoot().listScenes()) s.setExtras(filter(s.getExtras() ?? {}, SCENE_KEEP, removed.scene));
  for (const n of doc.getRoot().listNodes()) n.setExtras(filter(n.getExtras() ?? {}, NODE_KEEP, removed.node));
  return { scene: [...removed.scene].sort(), node: [...removed.node].sort() };
}

let ktxChecked: { ok: boolean; version: string | null; reason: string } | null = null;

/** Outil `ktx` de KTX-Software (≥ 4.4) disponible dans le PATH ? */
export function ktxAvailable(): { ok: boolean; version: string | null; reason: string } {
  if (ktxChecked) return ktxChecked;
  const r = spawnSync('ktx', ['--version'], { encoding: 'utf8', shell: false });
  if (r.error || r.status !== 0) {
    ktxChecked = { ok: false, version: null, reason: 'commande « ktx » introuvable (KTX-Software ≥ 4.4 à installer)' };
    return ktxChecked;
  }
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(`${r.stdout}${r.stderr}`);
  const v = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  const ge = v !== null && (v[0] - KTX_MIN[0] || v[1] - KTX_MIN[1] || v[2] - KTX_MIN[2]) >= 0;
  ktxChecked = ge
    ? { ok: true, version: v!.join('.'), reason: '' }
    : { ok: false, version: v ? v.join('.') : null, reason: `KTX-Software ${v ? v.join('.') : '?'} trouvé, ${KTX_MIN.join('.')} minimum` };
  return ktxChecked;
}

/** `auto` → `ktx2` si l'outil est présent, sinon `webp`. `ktx2` sans outil = erreur. */
export function resolveTextureMode(mode: TextureMode): { mode: Exclude<TextureMode, 'auto'>; note: string | null } {
  if (mode === 'webp' || mode === 'keep') return { mode, note: null };
  const k = ktxAvailable();
  if (k.ok) return { mode: 'ktx2', note: null };
  if (mode === 'ktx2') throw new Error(`textures KTX2 demandées : ${k.reason}`);
  return { mode: 'webp', note: `textures en WebP : ${k.reason}` };
}

const multipleOf4 = (n: number) => Math.max(4, Math.ceil(n / 4) * 4);

/** Encode en KTX2 (BasisU) chaque texture PNG/JPEG avec `ktx create` (réglages de `gltf-transform etc1s/uastc`). */
async function texturesToKtx2(doc: Document): Promise<void> {
  const textures = doc.getRoot().listTextures();
  if (!textures.length) return;
  const basisu = doc.createExtension(KHRTextureBasisu).setRequired(true);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glbi-ktx-'));
  try {
    for (const [i, texture] of textures.entries()) {
      const mime = texture.getMimeType();
      if (mime !== 'image/png' && mime !== 'image/jpeg') continue;
      let image = texture.getImage();
      const size = texture.getSize();
      if (!image || !size) continue;
      // BasisU : dimensions multiples de 4 (WebGL2 accepte les NPOT avec mipmaps).
      let ext = ImageUtils.mimeTypeToExtension(mime);
      if (size[0] % 4 || size[1] % 4) {
        const buf = await sharp(image).resize(multipleOf4(size[0]), multipleOf4(size[1]), { fit: 'fill' }).png().toBuffer();
        image = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        ext = 'png';
      }
      const src = path.join(tmp, `${i}.${ext}`);
      const dst = path.join(tmp, `${i}.ktx2`);
      fs.writeFileSync(src, image);

      const slots = listTextureSlots(texture);
      const channels = getTextureChannelMask(texture);
      const colorSpace = getTextureColorSpace(texture);
      const isNormal = slots.some((s) => /normal/i.test(s));
      const args = ['create', '--generate-mipmap'];
      if (isNormal) args.push('--encode', 'uastc', '--uastc-quality', '2', '--zstd', '18');
      else args.push('--encode', 'basis-lz');
      if (colorSpace === 'srgb') args.push('--assign-tf', 'srgb', '--assign-primaries', 'bt709');
      else args.push('--assign-tf', 'linear', '--assign-primaries', 'none');
      const { R, G, A } = TextureChannel;
      const srgb = colorSpace === 'srgb';
      if (channels === R) args.push('--format', 'R8_UNORM');
      else if (channels === G || channels === (R | G)) args.push('--format', 'R8G8_UNORM');
      else if (!(channels & A)) args.push('--format', srgb ? 'R8G8B8_SRGB' : 'R8G8B8_UNORM');
      else args.push('--format', srgb ? 'R8G8B8A8_SRGB' : 'R8G8B8A8_UNORM');
      args.push(src, dst);

      const r = spawnSync('ktx', args, { encoding: 'utf8', shell: false });
      if (r.error || r.status !== 0) {
        throw new Error(`ktx create (texture ${texture.getName() || i}, ${slots.join('/') || 'sans slot'}) : ${r.stderr || r.error?.message}`);
      }
      texture.setImage(new Uint8Array(fs.readFileSync(dst))).setMimeType('image/ktx2');
      if (texture.getURI()) texture.setURI(texture.getURI().replace(/\.[^./]+$/, '') + '.ktx2');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (!doc.getRoot().listTextures().some((t) => t.getMimeType() === 'image/ktx2')) basisu.dispose();
}

export interface OptimizeOptions {
  /** Noms de nœuds à garder même vides (cible caméra, objets animés…). Défaut : ceux de la config de GLBI_ROOT. */
  protect?: Iterable<string>;
  /** Garder tous les empties feuilles (cartouche de test : POI et éléments nommés dans la config TS). */
  keepLeaves?: boolean;
  textures?: TextureMode;
}

export interface OptimizeResult {
  textures: Exclude<TextureMode, 'auto'>;
  notes: string[];
  stripped: { scene: string[]; node: string[] };
}

/** Optimise le document en place (voir l'ordre en tête de fichier). */
export async function optimizeDocument(doc: Document, opts: OptimizeOptions = {}): Promise<OptimizeResult> {
  const notes: string[] = [];
  const { mode, note } = resolveTextureMode(opts.textures ?? 'auto');
  if (note) notes.push(note);

  // 1. Extras étrangers retirés AVANT prune (sinon `keepExtras` garderait les nœuds qui n'en portent que d'étrangers).
  const stripped = stripForeignExtras(doc);

  // 2. Nœuds protégés : marqueur temporaire, puis prune qui garde les nœuds porteurs d'extras.
  const protect = new Set(opts.protect ?? referencedNodeNamesInGlb(doc));
  const marked = doc.getRoot().listNodes().filter((n) => protect.has(n.getName()));
  for (const n of marked) n.setExtras({ ...n.getExtras(), [KEEP_MARK]: true });

  await doc.transform(
    prune({ keepExtras: true, keepLeaves: opts.keepLeaves ?? false }),
    // Matériaux non fusionnés (T-16) : le lecteur modifie des matériaux par maillage.
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE, PropertyType.SKIN] }),
  );
  for (const n of marked) {
    const rest = { ...n.getExtras() };
    delete rest[KEEP_MARK];
    n.setExtras(rest);
  }

  // 3. Textures.
  if (mode === 'ktx2') await texturesToKtx2(doc);
  else if (mode === 'webp') {
    await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', formats: /^image\/(png|jpeg)$/ }));
  }

  // 4. Géométrie et animations : Meshopt (inclut reorder + quantize).
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));

  return { textures: mode, notes, stripped };
}

export interface FileResult extends OptimizeResult {
  protect: string[];
  inBytes: number;
  outBytes: number;
  survival: string[];
  before: GlbSnapshot;
  after: GlbSnapshot;
}

/** Lit `src`, optimise, écrit `dst`, relit `dst` et vérifie la survie de la config, des clips et des crédits. */
export async function optimizeGlbFile(src: string, dst: string, opts: OptimizeOptions = {}): Promise<FileResult> {
  const inBytes = fs.statSync(src).size;
  const doc = await readGlbFile(src);
  const before = snapshot(doc);
  const protect = [...(opts.protect ?? referencedNodeNamesInGlb(doc))];
  const result = await optimizeDocument(doc, { ...opts, protect });
  const outBytes = await writeGlbFile(dst, doc);
  const after = snapshot(await readGlbFile(dst));
  const survival = compareSnapshots(before, after, protect);
  if (!after.extensions.includes('EXT_meshopt_compression') && after.clips.length + doc.getRoot().listMeshes().length > 0) {
    survival.push('EXT_meshopt_compression absent du GLB écrit');
  }
  return { ...result, protect, inBytes, outBytes, survival, before, after };
}

export const formatMiB = (bytes: number) => `${(bytes / 1048576).toFixed(2)} MiB`;
