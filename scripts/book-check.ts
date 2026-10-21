// scripts/book-check.ts — contrôles d'un dossier source de livre, partagés par `build-book` (build, `book:check`, `dev:book`)
// et le serveur de l'atelier (A2, spec-atelier-glbi.md §9 : « mêmes contrôles que build-book, mêmes textes »).
//
// Extraits de scripts/build-book.ts sans changement de texte ni d'ordre : lecture d'une scène (GLB source, couche 3D de
// GLBI_ROOT, `scenes/<id>.edit.json`, fusion `strict`, V-08, clips dans les deux sens, crédits `src_*`, V-10), puis
// contrôles du livre (book.json, V-03, icônes, fichiers non référencés). Chaque message porte une origine, utilisée par
// l'onglet Rapport de l'atelier (GLB, edit.json, fusion, contrôles du build) et ignorée par `build-book`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Document, Node as GNode } from '@gltf-transform/core';
import sharp from 'sharp';
import { readGlbFile, referencedNodeNames } from './glb-pipeline';
import { bookSchema, EVENT_TIME_TOLERANCE_S, formatIssues, GLBI_ROOT_NAME, isReservedSourcePath, type Book, type GlbiConfig, type ModelCredit } from '../src/schema/glbi';
import { mergeLayers } from '../src/schema/merge';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ICON_MIN_PX = 512;

// ---------------------------------------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------------------------------------

/** Origine d'un message (onglet Rapport de l'atelier). `build` : contrôles du build (références, clips, crédits, livre). */
export type ReportOrigin = 'glb' | 'edit' | 'fusion' | 'build';

export interface ReportLine {
  level: 'error' | 'warning';
  origin: ReportOrigin;
  /** Scène concernée, `null` pour un contrôle du livre. */
  scene: string | null;
  message: string;
}

/** Erreurs et avertissements dans l'ordre d'émission ; `errors` et `warnings` sont les textes seuls (build-book). */
export class Report {
  readonly lines: ReportLine[] = [];
  readonly errors: string[] = [];
  readonly warnings: string[] = [];

  error(message: string, origin: ReportOrigin = 'build', scene: string | null = null): void {
    this.lines.push({ level: 'error', origin, scene, message });
    this.errors.push(message);
  }

  warning(message: string, origin: ReportOrigin = 'build', scene: string | null = null): void {
    this.lines.push({ level: 'warning', origin, scene, message });
    this.warnings.push(message);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Fichiers
// ---------------------------------------------------------------------------------------------------------

export const toPosix = (p: string) => p.split(path.sep).join('/');

export function listFiles(dir: string): string[] {
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

/**
 * Fichiers d'un dossier source de livre, sans le dossier réservé `blender/` (ST1, DP-2 : `.blend`, textures de travail,
 * sauvegardes), qui n'est même pas parcouru. Liste des fichiers non référencés de `book:check`, scrutation et menus d'assets
 * de l'atelier. `listFiles` reste la liste complète (dossier construit).
 */
export function listSourceFiles(dir: string): string[] {
  const outList: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      const rel = toPosix(path.relative(dir, full));
      if (e.isDirectory()) {
        if (!isReservedSourcePath(rel)) walk(full);
      } else if (e.isFile() && !isReservedSourcePath(rel)) outList.push(rel);
    }
  };
  walk(dir);
  return outList.sort();
}

export function readJson(file: string, label: string, report: (m: string) => void): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    report(`${label} : JSON illisible (${(e as Error).message})`);
    return undefined;
  }
}

/** Source d'icône utilisable : PNG (ou autre format lu par sharp) carré d'au moins ICON_MIN_PX px. */
export async function iconSourceOk(file: string, report: (m: string) => void): Promise<boolean> {
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

// ---------------------------------------------------------------------------------------------------------
// Lecture d'une scène (GLB + config)
// ---------------------------------------------------------------------------------------------------------

export interface SceneResult {
  id: string;
  config: GlbiConfig;
  modelCredits: ModelCredit[];
  /** Assets référencés par la config (chemins relatifs à la racine du livre). */
  assets: Set<string>;
  /** Nœuds cités par la config (cible caméra, objets animés) : protégés de `prune` à l'optimisation. */
  protect: string[];
}

/** Valeur de `glbi_config` : chaîne JSON qui doit donner un objet (`JSON.parse("1.0")` renvoie 1 sans exception). */
function parseConfigString(raw: unknown, label: string, report: (m: string) => void): unknown {
  if (typeof raw !== 'string') {
    report(`${label} : glbi_config doit être une chaîne JSON (trouvé : ${raw === undefined ? 'absent' : typeof raw})`);
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    report(`${label} : glbi_config n'est pas du JSON valide (${(e as Error).message})`);
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    report(`${label} : glbi_config doit contenir un objet JSON (trouvé : ${Array.isArray(parsed) ? 'tableau' : JSON.stringify(parsed)})`);
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

/** Durée d'un clip glTF telle que la calcule three.js (`AnimationClip.resetDuration`) : dernier instant de ses pistes. */
function clipDuration(anim: { listSamplers(): { getInput(): { getMax(t: number[]): number[] } | null }[] }): number {
  let d = 0;
  for (const s of anim.listSamplers()) d = Math.max(d, s.getInput()?.getMax([0])[0] ?? 0);
  return d;
}

/** Secondes à la française, à la milliseconde (`9,200`). */
const seconds = (t: number) => t.toFixed(3).replace('.', ',');

/** Origine d'un message de `mergeLayers` : fichier nommé en tête du message. */
function mergeOrigin(message: string, id: string): ReportOrigin {
  if (message.startsWith(`scenes/${id}.glb`)) return 'glb';
  if (message.startsWith(`scenes/${id}.edit.json`)) return 'edit';
  return 'fusion';
}

/**
 * Lit et contrôle une scène du dossier source.
 * Renvoie `null` si la scène n'est pas utilisable (erreurs dans `report`).
 * `editOverride` (atelier, A3) : couche éditoriale saisie et non enregistrée, contrôlée à la place de `scenes/<id>.edit.json`.
 */
export async function readScene(
  sourceDir: string,
  id: string,
  report: Report,
  editOverride?: { value: unknown },
): Promise<SceneResult | null> {
  const label = `scène « ${id} »`;
  const err = (m: string, origin: ReportOrigin = 'build') => report.error(m, origin, id);
  const warn = (m: string, origin: ReportOrigin = 'build') => report.warning(m, origin, id);
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
    err(`${label} : ${glbRel} absent du dossier source`, 'glb');
    return null;
  }

  let doc: Document;
  try {
    doc = await readGlbFile(glbFile);
  } catch (e) {
    err(`${label} : ${glbRel} illisible (${(e as Error).message})`, 'glb');
    return null;
  }

  const root = doc.getRoot();
  const nodes = root.listNodes();
  const byName = new Map<string, GNode[]>();
  for (const n of nodes) byName.set(n.getName(), [...(byName.get(n.getName()) ?? []), n]);

  // --- Couche 3D : GLBI_ROOT du GLB (seule source) ---
  const glbiRoots = byName.get(GLBI_ROOT_NAME) ?? [];
  if (glbiRoots.length === 0) {
    err(`${glbRel} : pas de nœud ${GLBI_ROOT_NAME} ; exporter la scène avec l'addon GLBGenerator`, 'glb');
    return null;
  }
  if (glbiRoots.length > 1) {
    err(`${label} : ${glbiRoots.length} nœuds ${GLBI_ROOT_NAME} dans le GLB (un seul attendu)`, 'glb');
    return null;
  }
  const extras = glbiRoots[0].getExtras() ?? {};
  const raw3d = parseConfigString(extras.glbi_config, `${glbRel} (couche 3D)`, (m) => err(m, 'glb'));
  if (raw3d === undefined) return null;

  // --- Couche éditoriale : scenes/<id>.edit.json (absente : erreur donnée par la fusion) ---
  let rawEdit: unknown;
  if (editOverride) {
    rawEdit = editOverride.value;
  } else if (fs.existsSync(editFile)) {
    rawEdit = readJson(editFile, editRel, (m) => err(m, 'edit'));
    if (rawEdit === undefined) return null;
    if (rawEdit === null || typeof rawEdit !== 'object' || Array.isArray(rawEdit)) {
      err(`${editRel} : doit contenir un objet JSON`, 'edit');
      return null;
    }
  }

  // --- Fusion et schéma (V-01 et règles de forme : V-02, V-05, V-09, quiz, modules réservés ; spec-atelier-glbi.md §5) ---
  const merged = mergeLayers(raw3d, rawEdit, { mode: 'strict', sceneId: id, glbiVersion: extras.glbi_version });
  merged.warnings.forEach((m) => warn(m, mergeOrigin(m, id)));
  merged.errors.forEach((m) => err(m, mergeOrigin(m, id)));
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
    // Actions combinées (AC1, spec-actions-combinees.md §8) : instant d'un événement au-delà de la fin du clip (couche 3D).
    for (const a of animations.actions) {
      const anim = glbAnims.find((x) => x.getName() === a.clip);
      if (!anim || !a.events?.length) continue;
      const d = clipDuration(anim);
      for (const ev of a.events) {
        if (ev.time > d + EVENT_TIME_TOLERANCE_S) {
          err(`${glbRel} (couche 3D) : action « ${a.id} » : événement « ${ev.id} » à ${seconds(ev.time)} s, clip de ${seconds(d)} s`, 'glb');
        }
      }
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
    // Sons d'événement (AC1) : sons de la scène pour V-10 et pour la copie des assets.
    for (const ev of a.events ?? []) {
      if (ev.sound) {
        assets.add(ev.sound);
        sounds.add(ev.sound);
      }
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
// Contrôles du livre
// ---------------------------------------------------------------------------------------------------------

export interface BookCheck {
  book: Book;
  scenes: SceneResult[];
  /** Assets référencés par les scènes et `book.json` (V-03 contrôlé). */
  assets: Set<string>;
}

/** Lecture d'une scène par `checkBookSource` : `readScene` par défaut ; l'atelier (A3) rejoue ses résultats en cache. */
export type ReadSceneFn = (sourceDir: string, id: string, report: Report) => Promise<SceneResult | null>;

/**
 * Contrôles d'un dossier source de livre, dans l'ordre de `build-book` : book.json, scènes, V-03, icônes, fichiers non
 * référencés. Renvoie `null` si book.json est absent, illisible ou invalide (contrôles arrêtés, comme `build-book`).
 */
export async function checkBookSource(sourceDir: string, report: Report, readSceneFn: ReadSceneFn = readScene): Promise<BookCheck | null> {
  const err = (m: string) => report.error(m);
  const warn = (m: string) => report.warning(m);
  if (!fs.existsSync(path.join(sourceDir, 'book.json'))) {
    err(`${toPosix(sourceDir)}/book.json absent`);
    return null;
  }

  // --- Couche livre ---
  const rawBook = readJson(path.join(sourceDir, 'book.json'), 'book.json', err);
  if (rawBook === undefined) return null;
  const parsedBook = bookSchema.safeParse(rawBook);
  if (!parsedBook.success) {
    formatIssues(parsedBook.error, 'book.json : ').forEach(err);
    return null;
  }
  const book = parsedBook.data;

  // --- Scènes ---
  const scenes: SceneResult[] = [];
  for (const id of book.scenes) {
    const r = await readSceneFn(sourceDir, id, report);
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
  // `blender/` (dossier réservé, ST1) : ni listé ni copié.
  const unused = listSourceFiles(sourceDir).filter((f) => !known.has(f));
  if (unused.length && !report.errors.length) warn(`fichier(s) source non référencé(s), non copié(s) : ${unused.join(', ')}`);

  return { book, scenes, assets };
}
