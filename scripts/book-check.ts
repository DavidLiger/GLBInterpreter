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
import { optimizeGlbBytes, readGlbFile, referencedNodeNames, type BytesResult, type TextureMode } from './glb-pipeline';
import {
  bookSchema, DEFAULT_CARD_TYPE_ID, EVENT_TIME_TOLERANCE_S, formatIssues, GAME_ARENA_ID, GAME_COLLIDER_NODE, GAME_DIR, GAME_EDIT_FILE,
  GAME_FLOOR_NODE, GAME_NODE_PREFIXES, GLBI_ROOT_NAME, isReservedSourcePath, SCENE_ID_PATTERN,
  type Book, type GameConfig, type GlbiConfig, type ModelCredit,
} from '../src/schema/glbi';
import { mergeGame, mergeLayers, type GameCardRef, type GameLayerInput } from '../src/schema/merge';

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
  // Position de la caméra pendant une action (AC2, DP-19) : empty du GLB, comme la cible.
  for (const a of animations?.actions ?? []) {
    if (!a.cameraPosition) continue;
    const p = findNode(a.cameraPosition, `action « ${a.id} » : cameraPosition`);
    if (p?.getMesh()) warn(`${label} : action « ${a.id} » : cameraPosition « ${a.cameraPosition} » porte un maillage (un empty est attendu, DP-19)`);
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
  // Illustration de la carte de collection (CC1) : image copiée comme les autres ; crédit facultatif (images).
  if (config.modules.card?.image) assets.add(config.modules.card.image);
  if (config.modules.audio?.ambientSound) {
    assets.add(config.modules.audio.ambientSound);
    sounds.add(config.modules.audio.ambientSound);
  }
  const creditList = config.modules.credits?.assets ?? [];
  for (const c of creditList) assets.add(c.asset);

  // V-10 : chaque son a un crédit ; crédit sans usage = avertissement
  const credited = new Set(creditList.map((c) => c.asset));
  for (const s of sounds) if (!credited.has(s)) err(`${label} : son « ${s} » sans entrée dans modules.credits.assets (V-10)`);
  const used = new Set([...sounds, ...(animations?.actions ?? []).map((a) => a.icon), config.scene.loaderImage, config.modules.card?.image].filter(Boolean));
  for (const c of creditList) if (!used.has(c.asset)) warn(`${label} : crédit pour « ${c.asset} », asset non utilisé par la scène`);

  return { id, config, modelCredits, assets, protect: referencedNodeNames(config) };
}

// ---------------------------------------------------------------------------------------------------------
// Mini-jeu (MJ1, spec-mini-jeu.md §8) : GLB de `game/`, couche éditoriale `game/game.edit.json`, fusion, contrôles croisés,
// optimisation en mémoire (pipeline d'Î7) et budgets du gabarit « poursuite » (avertissements, décision de David du 28/10).
// ---------------------------------------------------------------------------------------------------------

/**
 * Budgets du gabarit « poursuite » (spec-mini-jeu.md §8) : mémoire d'une partie qui charge tout à l'entrée, sur l'iPhone SE ;
 * ce ne sont pas des limites du jeu ni du livre : avertissements au-delà, jamais d'erreur. Tailles en Mo (10⁶ octets), sur
 * les GLB optimisés (octets publiés). Chaque gabarit futur fixera les siens.
 */
export const POURSUITE_BUDGETS = {
  arenaBytes: 6e6,
  playerBytes: 2e6,
  preyBytes: 1.5e6,
  gameBytes: 15e6,
  texturePx: 1024,
  colliderTriangles: 5000,
  capsuleRadius: 1.2,
} as const;

/** GLB du jeu optimisé : octets publiés, contrôlés (survie) et mesurés (budgets). */
export interface GameGlb {
  /** `game/<id>.glb`. */
  rel: string;
  id: string;
  bytes: Uint8Array;
}

export interface GameResult {
  config: GameConfig;
  /** Arène d'abord, puis les entités dans l'ordre des fichiers. */
  glbs: GameGlb[];
  /** Assets du jeu (sons), chemins relatifs à la racine du livre. */
  assets: Set<string>;
  modelCredits: ModelCredit[];
}

/** Mo à la française (`6,12 Mo`). */
const mo = (b: number) => `${(b / 1e6).toFixed(2).replace('.', ',')} Mo`;
const metres = (m: number) => `${String(m).replace('.', ',')} m`;

/** Triangles d'un maillage (primitives en triangles, bandes ou éventails). */
function triangles(mesh: { listPrimitives(): { getMode(): number; getIndices(): { getCount(): number } | null; getAttribute(n: string): { getCount(): number } | null }[] }): number {
  let n = 0;
  for (const p of mesh.listPrimitives()) {
    const count = p.getIndices()?.getCount() ?? p.getAttribute('POSITION')?.getCount() ?? 0;
    const mode = p.getMode();
    if (mode === 4) n += Math.floor(count / 3);
    else if (mode === 5 || mode === 6) n += Math.max(0, count - 2);
  }
  return n;
}

/**
 * Optimisations déjà faites dans ce processus (atelier : les contrôles sont rejoués à chaque modification du dossier, sans
 * réoptimiser un GLB du jeu inchangé). Clé : fichier, taille, date, textures, nœuds protégés.
 */
const gameOptimizeCache = new Map<string, Promise<BytesResult>>();

function optimizeGameGlb(file: string, protect: string[], textures: TextureMode): Promise<BytesResult> {
  const st = fs.statSync(file);
  const key = JSON.stringify([file, st.size, st.mtimeMs, textures, protect]);
  let p = gameOptimizeCache.get(key);
  if (!p) {
    p = optimizeGlbBytes(file, { protect, textures });
    gameOptimizeCache.set(key, p);
    p.catch(() => gameOptimizeCache.delete(key));
  }
  return p;
}

/** Origine d'un message de `mergeGame` (onglet Rapport, rangement du studio) : fichier nommé en tête du message. */
function gameOrigin(message: string): ReportOrigin {
  if (/^game\/[^ ]+\.glb/.test(message)) return 'glb';
  if (message.startsWith(GAME_EDIT_FILE)) return 'edit';
  if (message.startsWith('book.json')) return 'build';
  return 'fusion';
}

/**
 * Lit et contrôle le jeu du livre (`book.json.game`), d'après les fichiers de `game/` du dossier source. Renvoie `null` si le
 * livre n'a pas de jeu ou si le jeu n'est pas utilisable (erreurs dans `report`, scène `null`). Les GLB sont optimisés en
 * mémoire : le build écrit les octets contrôlés ici, `book:check` les mesure sans rien écrire.
 */
export async function readGame(
  sourceDir: string,
  book: Book,
  scenes: readonly SceneResult[],
  report: Report,
  opts: { textures?: TextureMode } = {},
): Promise<GameResult | null> {
  const gameDir = path.join(sourceDir, GAME_DIR);
  const files = fs.existsSync(gameDir) && fs.statSync(gameDir).isDirectory() ? fs.readdirSync(gameDir).filter((f) => fs.statSync(path.join(gameDir, f)).isFile()).sort() : [];
  if (!book.game) {
    if (files.some((f) => /\.glb$/i.test(f) || f === 'game.edit.json')) {
      report.warning(`${GAME_DIR}/ : fichiers du jeu présents mais book.json n'a pas de game : jeu ignoré, non publié`);
    }
    return null;
  }
  const err = (m: string, origin: ReportOrigin = 'glb') => report.error(m, origin, null);
  const warn = (m: string, origin: ReportOrigin = 'glb') => report.warning(m, origin, null);

  // --- GLB de game/ : couche 3D du jeu (GLBI_ROOT : glbi_game_version, glbi_game_config) ---
  const docs = new Map<string, Document>();
  let arena: GameLayerInput | null = null;
  const entities: GameLayerInput[] = [];
  let unreadable = false;
  for (const f of files.filter((x) => /\.glb$/i.test(x))) {
    const id = f.replace(/\.glb$/i, '');
    const rel = `${GAME_DIR}/${f}`;
    if (!SCENE_ID_PATTERN.test(id) || !f.endsWith('.glb')) {
      err(`${rel} : nom de fichier refusé (identifiant de l'entité : lettres, chiffres, _ et -, extension .glb)`);
      unreadable = true;
      continue;
    }
    let doc: Document;
    try {
      doc = await readGlbFile(path.join(gameDir, f));
    } catch (e) {
      err(`${rel} illisible (${(e as Error).message})`);
      unreadable = true;
      continue;
    }
    const roots = doc.getRoot().listNodes().filter((n) => n.getName() === GLBI_ROOT_NAME);
    if (roots.length !== 1) {
      err(roots.length ? `${rel} : ${roots.length} nœuds ${GLBI_ROOT_NAME} (un seul attendu)` : `${rel} : pas de nœud ${GLBI_ROOT_NAME} ; exporter avec l'addon GLBGenerator (mode « ${id === GAME_ARENA_ID ? 'Arène' : 'Entité de jeu'} »)`);
      unreadable = true;
      continue;
    }
    const ex = roots[0].getExtras() ?? {};
    if (ex.glbi_game_config === undefined && ex.glbi_config !== undefined) {
      err(`${rel} : GLB de scène (glbi_config) dans ${GAME_DIR}/ : exporter en mode « ${id === GAME_ARENA_ID ? 'Arène' : 'Entité de jeu'} » de l'addon (glbi_game_config)`);
      unreadable = true;
      continue;
    }
    const raw = parseConfigString(ex.glbi_game_config, `${rel} (couche 3D du jeu)`, (m) => err(m));
    if (raw === undefined) {
      unreadable = true;
      continue;
    }
    docs.set(id, doc);
    const layer = { id, raw, version: ex.glbi_game_version };
    if (id === GAME_ARENA_ID) arena = layer;
    else entities.push(layer);
  }
  let rawEdit: unknown;
  const editFile = path.join(sourceDir, GAME_EDIT_FILE);
  if (fs.existsSync(editFile)) {
    rawEdit = readJson(editFile, GAME_EDIT_FILE, (m) => err(m, 'edit'));
    if (rawEdit === undefined) return null;
  }
  if (unreadable) return null;

  // --- Fusion (cartes des scènes reçues par leurs identifiants seulement, DP-21) ---
  const firstType = book.cardTypes?.[0]?.id ?? DEFAULT_CARD_TYPE_ID;
  const cards: GameCardRef[] = scenes.filter((s) => s.config.modules.card).map((s) => ({ card: s.id, type: s.config.modules.card!.type ?? firstType }));
  const merged = mergeGame({ book, cards, arena, entities, edit: rawEdit }, { mode: 'strict' });
  merged.warnings.forEach((m) => warn(m, gameOrigin(m)));
  merged.errors.forEach((m) => err(m, gameOrigin(m)));
  if (!merged.config) return null;
  const config = merged.config;
  const preyCount = config.rules.preys.reduce((s, p) => s + p.count, 0);

  // --- Contrôles croisés sur les GLB (V-08, clips, nœuds de l'arène) ---
  const errorsBefore = report.errors.length;
  const names = (doc: Document) => doc.getRoot().listNodes().map((n) => n.getName());
  const protects = new Map<string, string[]>();
  const B = POURSUITE_BUDGETS;
  {
    const rel = `${GAME_DIR}/${GAME_ARENA_ID}.glb`;
    const doc = docs.get(GAME_ARENA_ID)!;
    const nodes = doc.getRoot().listNodes();
    const named = (re: RegExp) => nodes.filter((n) => re.test(n.getName()));
    const P = GAME_NODE_PREFIXES;
    const spawnPlayer = named(new RegExp(`^${P.spawnPlayer}$`));
    const spawnPrey = named(new RegExp(`^${P.spawnPrey}`));
    const colliders = named(new RegExp(`^${P.collider}`));
    const floor = colliders.filter((n) => n.getName() === GAME_FLOOR_NODE);
    if (!spawnPlayer.length) err(`${rel} : pas de point d'apparition du joueur (empty « ${P.spawnPlayer} »)`);
    if (spawnPlayer.length > 1) warn(`${rel} : ${spawnPlayer.length} nœuds « ${P.spawnPlayer} » : un seul sera utilisé`);
    if (!spawnPrey.length) err(`${rel} : pas de point d'apparition des proies (empties « ${P.spawnPrey}1 », « ${P.spawnPrey}2 »…)`);
    else if (spawnPrey.length < preyCount) warn(`${rel} : ${spawnPrey.length} point(s) d'apparition des proies pour ${preyCount} proies en même temps : plusieurs apparaîtront au même endroit`);
    if (!floor.length) err(`${rel} : pas de sol (maillage « ${GAME_FLOOR_NODE} »)`);
    for (const n of colliders) if (!n.getMesh()) err(`${rel} : collisionneur « ${n.getName()} » sans maillage`);
    for (const n of named(new RegExp(`^${P.fade}`))) if (!n.getMesh()) warn(`${rel} : décor « ${n.getName()} » (${P.fade}) sans maillage : rien à rendre transparent`);
    const tri = colliders.reduce((s, n) => s + (n.getMesh() ? triangles(n.getMesh()!) : 0), 0);
    if (tri > B.colliderTriangles) warn(`${rel} : collisionneurs COL_* de ${tri} triangles (${B.colliderTriangles} au plus, budget du gabarit « poursuite ») : simplifier les maillages COL_* dans Blender`);
    protects.set(GAME_ARENA_ID, names(doc).filter((n) => n.startsWith(P.spawnPlayer) || n.startsWith(P.spawnPrey) || n.startsWith(P.collider) || n.startsWith(P.fade)));
  }
  for (const e of config.entities) {
    const rel = `${GAME_DIR}/${e.id}.glb`;
    const doc = docs.get(e.id)!;
    const root = doc.getRoot();
    const byName = root.listNodes().filter((n) => n.getName() === e.object);
    if (!byName.length) err(`${rel} : object « ${e.object} » introuvable dans le GLB (V-08)`);
    else {
      const joints = new Set(root.listSkins().flatMap((s) => s.listJoints()));
      if (![...descendants(byName[0])].some((n) => joints.has(n))) warn(`${rel} : « ${e.object} » n'a aucun os de skin (une armature est attendue)`);
    }
    const clipNames = root.listAnimations().map((a) => a.getName());
    for (const [role, clip] of Object.entries(e.clips)) {
      if (clip && !clipNames.includes(clip)) err(`${rel} : clips.${role} : clip « ${clip} » absent du GLB`);
    }
    const declared = new Set(Object.values(e.clips));
    const extra = clipNames.filter((c) => !declared.has(c));
    if (extra.length) warn(`${rel} : clip(s) du GLB non déclaré(s) : ${extra.join(', ')}`);
    if (e.collider && !root.listNodes().some((n) => n.getName() === GAME_COLLIDER_NODE)) err(`${rel} : collider « ${GAME_COLLIDER_NODE} » introuvable dans le GLB (V-08)`);
    if (e.capsule.radius > B.capsuleRadius) {
      warn(`${rel} : capsule de ${metres(e.capsule.radius)} de rayon (${metres(B.capsuleRadius)} au plus, cas mesuré au spike MJ0) : coût du pas physique non mesuré au-delà ; réduire la capsule ou l'échelle de l'entité dans Blender`);
    }
    protects.set(e.id, [e.object, ...(e.collider ? [GAME_COLLIDER_NODE] : [])]);
  }
  for (const [id, doc] of docs) {
    for (const t of doc.getRoot().listTextures()) {
      const size = t.getSize();
      if (size && Math.max(size[0], size[1]) > B.texturePx) {
        warn(`${GAME_DIR}/${id}.glb : texture « ${t.getName() || t.getURI() || '?'} » de ${size[0]} × ${size[1]} px (${B.texturePx} px au plus, budget du gabarit « poursuite »)`);
      }
    }
  }
  if (report.errors.length > errorsBefore) return null;

  // --- Optimisation (pipeline d'Î7, nœuds cités protégés, contrôle de survie) et budgets de taille ---
  const ids = [GAME_ARENA_ID, ...config.entities.map((e) => e.id)];
  const glbs: GameGlb[] = [];
  let ok = true;
  for (const id of ids) {
    const rel = `${GAME_DIR}/${id}.glb`;
    try {
      const r = await optimizeGameGlb(path.join(gameDir, `${id}.glb`), protects.get(id) ?? [], opts.textures ?? 'auto');
      for (const s of r.survival) err(`${rel} : optimisation : ${s}`);
      if (r.survival.length) ok = false;
      glbs.push({ rel, id, bytes: r.bytes });
    } catch (e) {
      err(`${rel} : optimisation impossible (${(e as Error).message})`);
      ok = false;
    }
  }
  if (!ok) return null;
  const sizeOf = (id: string) => glbs.find((g) => g.id === id)!.bytes.byteLength;
  const over = (rel: string, size: number, max: number, what: string) =>
    size > max && warn(`${rel} : ${what} de ${mo(size)} une fois optimisé (${mo(max)} au plus, budget du gabarit « poursuite »)`);
  over(`${GAME_DIR}/${GAME_ARENA_ID}.glb`, sizeOf(GAME_ARENA_ID), B.arenaBytes, 'arène');
  for (const e of config.entities) {
    over(`${GAME_DIR}/${e.id}.glb`, sizeOf(e.id), e.role === 'player' ? B.playerBytes : B.preyBytes, e.role === 'player' ? 'joueur' : 'proie');
  }

  // --- Crédits des modèles (src_* des nœuds, D-8.5) ; sons (V-10) ---
  const credits = new Map<string, ModelCredit>();
  for (const doc of docs.values()) {
    for (const n of doc.getRoot().listNodes()) {
      const exn = n.getExtras() ?? {};
      const c: ModelCredit = {};
      for (const [k, field] of Object.entries(SRC_KEYS)) {
        const v = exn[k];
        if (typeof v === 'string' && v.trim()) c[field] = v.trim();
      }
      if (!Object.keys(c).length) continue;
      const key = JSON.stringify([c.name, c.author, c.license, c.url]);
      if (!credits.has(key)) credits.set(key, c);
    }
  }
  const modelCredits = [...credits.values()];
  if (!modelCredits.length) warn(`jeu : aucun crédit de modèle (propriétés src_*) dans les GLB de ${GAME_DIR}/`);
  for (const c of modelCredits) {
    if (!c.author || !c.license) warn(`jeu : crédit de modèle incomplet ${JSON.stringify(c)} (src_author et src_license attendus)`);
  }
  const assets = new Set<string>();
  const sounds = new Set(Object.values(config.sounds ?? {}).filter((x): x is string => !!x));
  for (const s of sounds) assets.add(s);
  const creditList = config.credits?.assets ?? [];
  for (const c of creditList) assets.add(c.asset);
  const credited = new Set(creditList.map((c) => c.asset));
  for (const s of sounds) if (!credited.has(s)) err(`jeu : son « ${s} » sans entrée dans credits.assets de ${GAME_EDIT_FILE} (V-10)`, 'fusion');
  for (const c of creditList) if (!sounds.has(c.asset)) warn(`jeu : crédit pour « ${c.asset} », asset non utilisé par le jeu`, 'fusion');
  let total = glbs.reduce((s, g) => s + g.bytes.byteLength, 0);
  for (const s of sounds) {
    const f = path.join(sourceDir, s);
    if (fs.existsSync(f)) total += fs.statSync(f).size;
  }
  if (total > B.gameBytes) warn(`jeu : ${mo(total)} au total (GLB optimisés et sons ; ${mo(B.gameBytes)} au plus, budget du gabarit « poursuite »)`);
  return { config, glbs, assets, modelCredits };
}

// ---------------------------------------------------------------------------------------------------------
// Contrôles du livre
// ---------------------------------------------------------------------------------------------------------

/**
 * Cartes de collection (CC1, spec-carte-collection.md §6 ; types de cartes, CC3, §15.8) : chaque valeur de
 * `modules.card.fields` doit porter l'`id` d'un intitulé du type de la carte (erreur, couche éditoriale) ; un intitulé du type
 * sans valeur sur une carte est affiché « — » (avertissement). Type de la carte : `modules.card.type`, sinon le premier du
 * livre ; avec `cardFields`, un seul type, `personnage`. Une carte de type inconnu ne reçoit que cette erreur. Avec
 * `cardFields`, les messages de CC1 restent mot pour mot. Le paragraphe manquant et les longueurs sont contrôlés par la fusion
 * et le schéma.
 */
export function checkCards(book: Book, scenes: readonly SceneResult[], report: Report): void {
  const types = book.cardTypes;
  for (const s of scenes) {
    const card = s.config.modules.card;
    if (!card) continue;
    const at = `scenes/${s.id}.edit.json : modules.card`;
    let ids: string[];
    let unknownField: (k: string) => string;
    if (types) {
      const type = card.type === undefined ? types[0] : types.find((t) => t.id === card.type);
      if (!type) {
        report.error(`${at}.type : type « ${card.type} » absent de book.json (cardTypes : ${types.map((t) => t.id).join(', ')})`, 'edit', s.id);
        continue;
      }
      ids = type.fields.map((f) => f.id);
      unknownField = (k) => `${at}.fields : intitulé « ${k} » absent du type « ${type.id} » (intitulés : ${ids.join(', ')})`;
    } else {
      if (card.type !== undefined && card.type !== DEFAULT_CARD_TYPE_ID) {
        report.error(`${at}.type : type « ${card.type} » absent de book.json (book.json n'a qu'un type, « ${DEFAULT_CARD_TYPE_ID} » : cardFields)`, 'edit', s.id);
        continue;
      }
      ids = (book.cardFields ?? []).map((f) => f.id);
      unknownField = (k) => `${at}.fields : intitulé « ${k} » absent de book.json (cardFields : ${ids.join(', ') || 'aucun'})`;
    }
    const values = card.fields ?? {};
    for (const k of Object.keys(values)) {
      if (!ids.includes(k)) report.error(unknownField(k), 'edit', s.id);
    }
    for (const id of ids) {
      if (!(id in values)) report.warning(`scène « ${s.id} » : carte : caractéristique « ${id} » sans valeur (affichée « — »)`, 'fusion', s.id);
    }
  }
}

export interface BookCheck {
  book: Book;
  scenes: SceneResult[];
  /** Assets référencés par les scènes, le jeu et `book.json` (V-03 contrôlé). */
  assets: Set<string>;
  /** Jeu du livre (MJ1), `null` si `book.json` n'a pas de `game`. */
  game: GameResult | null;
}

/** Lecture d'une scène par `checkBookSource` : `readScene` par défaut ; l'atelier (A3) rejoue ses résultats en cache. */
export type ReadSceneFn = (sourceDir: string, id: string, report: Report) => Promise<SceneResult | null>;

/**
 * Contrôles d'un dossier source de livre, dans l'ordre de `build-book` : book.json, scènes, V-03, icônes, fichiers non
 * référencés. Renvoie `null` si book.json est absent, illisible ou invalide (contrôles arrêtés, comme `build-book`).
 */
export async function checkBookSource(
  sourceDir: string,
  report: Report,
  readSceneFn: ReadSceneFn = readScene,
  opts: { textures?: TextureMode } = {},
): Promise<BookCheck | null> {
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

  // --- Cartes de collection (CC1, §6 ; CC3, §15.8) : type et valeurs de modules.card contre book.json (cardFields ou cardTypes) ---
  checkCards(book, scenes, report);

  // --- Mini-jeu (MJ1, spec-mini-jeu.md §8) : GLB de game/, game/game.edit.json, fusion, contrôles, budgets ---
  const game = await readGame(sourceDir, book, scenes, report, opts);

  // --- V-03 : existence des assets ; contrôle de taille des sources ---
  const assets = new Set<string>([...scenes.flatMap((s) => [...s.assets]), ...(game ? [...game.assets] : [])]);
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
  if (book.game) {
    known.add(GAME_EDIT_FILE);
    for (const f of listSourceFiles(sourceDir)) if (/^game\/[^/]+\.glb$/i.test(f)) known.add(f);
  }
  // `blender/` (dossier réservé, ST1) : ni listé ni copié.
  const unused = listSourceFiles(sourceDir).filter((f) => !known.has(f));
  if (unused.length && !report.errors.length) warn(`fichier(s) source non référencé(s), non copié(s) : ${unused.join(', ')}`);

  return { book, scenes, assets, game };
}
