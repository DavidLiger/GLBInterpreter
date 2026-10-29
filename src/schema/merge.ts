// src/schema/merge.ts — fusion des deux couches de la configuration d'une scène (D-8.9, spec-atelier-glbi.md §5).
//
//   couche 3D          `glbi_config` de GLBI_ROOT (addon GLBGenerator), `layer3dSchema`
//   couche éditoriale  `scenes/<id>.edit.json` (atelier, ou à la main), `editLayerSchema`
//   objet fusionné     `glbiConfigSchema`, publié dans `scenes/<id>.json` (inchangé)
//
// Fonction pure (aucune lecture de fichier) partagée par `scripts/build-book.ts` (mode `strict`) et l'atelier (mode `draft`,
// A2). Chaque message nomme le fichier fautif et l'outil qui le corrige. Dépend seulement de `zod` et de `./glbi`.
import type { z } from 'zod';
import {
  CAMERA_FRAMING_KEYS,
  GAME3D_VERSION,
  GAME_ARENA_ID,
  GAME_DEFAULTS,
  GAME_DIR,
  GAME_EDIT_FILE,
  GAME_RESERVED_KEYS,
  GAME_REWARDS_MESSAGE,
  GAME_VERSION,
  game3dArenaSchema,
  game3dEntitySchema,
  gameConfigSchema,
  gameEditSchema,
  type Book,
  type Game3dArena,
  type Game3dEntity,
  type GameConfig,
  type GameEdit,
  editLayerSchema,
  formatIssues,
  GLBI_VERSION,
  glbiConfigSchema,
  LAYER3D_VERSION,
  layer3dSchema,
  RESERVED_MODULES,
  type EditLayer,
  type GlbiConfig,
  type Layer3d,
  type LocalizedText,
} from './glbi';

/** `strict` : build et `book:check`. `draft` : atelier, renvoie en plus un objet affichable malgré les erreurs. */
export type MergeMode = 'strict' | 'draft';

export interface MergeOptions {
  mode: MergeMode;
  /** Identifiant attendu (nom du fichier GLB et entrée de `book.json`). */
  sceneId: string;
  /** Valeur de `GLBI_ROOT.glbi_version` lue dans le GLB. */
  glbiVersion: unknown;
}

export interface MergeResult {
  /** Objet fusionné validé par `glbiConfigSchema` ; `null` dès qu'il y a une erreur. */
  config: GlbiConfig | null;
  /**
   * Mode `draft` seulement : objet fusionné affichable même avec des erreurs (libellé manquant remplacé par l'`id` de
   * l'action, nom manquant par l'`id` de la scène ; couche éditoriale ignorée si elle rend l'objet invalide). `null` si la
   * couche 3D est inutilisable, et toujours en mode `strict`.
   */
  draft: GlbiConfig | null;
  /** Couches validées (`null` si invalide ou absente). */
  layer3d: Layer3d | null;
  edit: EditLayer | null;
  /** Identifiants d'actions présents dans la couche éditoriale et absents du GLB (conservés dans le fichier). */
  orphans: string[];
  /**
   * Événements édités (`actions.<id>.events.<eventId>`) d'une action du GLB, absents des événements de cette action dans le
   * GLB (AC1, spec-actions-combinees.md §8) : conservés dans le fichier, à rattacher ou supprimer dans l'atelier (AC3).
   */
  eventOrphans: { action: string; event: string }[];
  errors: string[];
  warnings: string[];
}

/** Clés propres à la couche éditoriale : refusées dans le GLB avec un renvoi vers `edit.json`. */
const EDIT_KEYS = new Set<string>(['name', 'loaderImage', 'label', 'icon', 'sound', ...CAMERA_FRAMING_KEYS, 'audio', 'quiz', 'card', 'credits']);
/** Clés propres à la couche 3D : refusées dans `edit.json` avec un renvoi vers l'addon. */
const LAYER3D_KEYS = new Set<string>(['id', 'target', 'mode', 'idle', 'object', 'type', 'clip', 'trigger', 'loop', 'transition', 'cameraPosition', 'time']);
/**
 * Clés propres aux actions (AC1, AC2) : refusées sur `idle`, avec ce qu'elles seraient sur le repos (pas de marqueurs, de
 * coupe au noir ni de position de caméra).
 */
const ACTION_ONLY_KEYS = new Map<string, string>([
  ['events', 'pas de marqueurs sur idle (spec-actions-combinees.md §4, §6)'],
  ['transition', 'pas de coupe au noir sur idle (spec-actions-combinees.md §4, §6)'],
  ['cameraPosition', 'pas de position de caméra sur idle (spec-actions-combinees.md §16)'],
]);

const where = (p: readonly PropertyKey[]) => (p.length ? p.map(String).join('.') : '(racine)');

/**
 * Messages d'une couche refusée par son schéma, avec renvoi vers la bonne couche pour une clé mal placée. Exporté pour
 * l'atelier (A3) : refus d'une écriture de `edit.json`, mêmes textes qu'au build.
 */
export function layerIssues(error: z.ZodError, layer: '3d' | 'edit', glbFile: string, editFile: string): string[] {
  const file = layer === '3d' ? `${glbFile} (couche 3D)` : editFile;
  const out: string[] = [];
  for (const i of error.issues) {
    const w = where(i.path);
    if (i.code === 'unrecognized_keys') {
      const atModules = i.path.length === 1 && i.path[0] === 'modules';
      for (const k of i.keys) {
        let why: string;
        if (atModules && (RESERVED_MODULES as readonly string[]).includes(k)) why = `module réservé « ${k} », non activable en v1 (spec-extras-blender.md §6)`;
        else if (i.path[i.path.length - 1] === 'idle' && ACTION_ONLY_KEYS.has(k)) why = `clé « ${k} » non admise : ${ACTION_ONLY_KEYS.get(k)}`;
        else if (layer === '3d' && EDIT_KEYS.has(k)) why = `clé « ${k} » non admise, elle appartient à ${editFile}`;
        else if (layer === 'edit' && LAYER3D_KEYS.has(k)) why = `clé « ${k} » non admise, elle appartient au GLB (addon)`;
        else why = `clé « ${k} » inconnue`;
        out.push(`${file} : ${w} : ${why}`);
      }
    } else if (i.code === 'invalid_key') {
      out.push(`${file} : ${w} : identifiant invalide (${i.issues[0]?.message ?? i.message})`);
    } else {
      out.push(`${file} : ${w} : ${i.message}`);
    }
  }
  return out;
}

/** Copie sans les propriétés `undefined` (objet fusionné propre, ordre des clés conservé). */
function defined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

const same = (s: string): LocalizedText => ({ fr: s, en: s, es: s });

/**
 * Objet fusionné, clés dans l'ordre du contrat. `fallback` : textes manquants remplacés par les identifiants (mode `draft`) ;
 * une carte sans paragraphe est alors omise (CC1 : l'objet affichable garde le reste de la couche éditoriale).
 */
function build(l3: Layer3d, e: EditLayer | null, fallback: boolean): Record<string, unknown> {
  const anims = l3.modules.animations;
  const editActions = e?.modules?.animations?.actions;
  const camera = l3.modules.camera;
  const modules = defined({
    camera: camera ? defined({ target: camera.target, ...e?.modules?.camera }) : undefined,
    animations: anims
      ? {
          mode: anims.mode,
          idle: anims.idle,
          actions: anims.actions.map((a) => {
            const ed = editActions?.[a.id];
            return defined({
              id: a.id,
              object: a.object,
              type: a.type,
              clip: a.clip,
              trigger: a.trigger,
              label: ed?.label ?? (fallback ? same(a.id) : undefined),
              icon: ed?.icon,
              sound: ed?.sound,
              loop: a.loop,
              transition: a.transition,
              cameraPosition: a.cameraPosition,
              // Événements dans l'ordre du GLB ; son pris dans la couche éditoriale (AC1, DP-6).
              events: a.events?.map((ev) => defined({ id: ev.id, time: ev.time, sound: ed?.events?.[ev.id]?.sound })),
            });
          }),
        }
      : undefined,
    audio: e?.modules?.audio,
    quiz: e?.modules?.quiz,
    // Carte de collection (CC1) : recopiée telle quelle ; ses intitulés sont contrôlés contre book.json par le build.
    card: e?.modules?.card && (e.modules.card.text || !fallback) ? e.modules.card : undefined,
    credits: e?.modules?.credits,
  });
  return {
    version: GLBI_VERSION,
    scene: defined({
      id: l3.scene.id,
      name: e?.scene?.name ?? (fallback ? same(l3.scene.id) : undefined),
      loaderImage: e?.scene?.loaderImage,
    }),
    modules,
  };
}

/**
 * Fusionne la couche 3D (`raw3d` : objet de `glbi_config`, déjà parsé) et la couche éditoriale (`rawEdit` : contenu de
 * `scenes/<id>.edit.json`, `undefined` si le fichier est absent), puis valide l'objet fusionné (spec-atelier-glbi.md §5).
 */
export function mergeLayers(raw3d: unknown, rawEdit: unknown, opts: MergeOptions): MergeResult {
  const id = opts.sceneId;
  const glbFile = `scenes/${id}.glb`;
  const editFile = `scenes/${id}.edit.json`;
  const scene = `scène « ${id} »`;
  const errors: string[] = [];
  const warnings: string[] = [];
  const result = (r: Partial<MergeResult>): MergeResult => ({
    config: null, draft: null, layer3d: null, edit: null, orphans: [], eventOrphans: [], ...r, errors, warnings,
  });

  // --- Version de la couche 3D (rupture D-8.9 : un GLB de l'addon v0.1 n'est pas migré) ---
  const v = opts.glbiVersion;
  if (v === 1) {
    errors.push(`${glbFile} : glbi_version 1 (addon GLBGenerator v0.1, libellés dans le GLB) ; réexporter avec l'addon v0.2, textes dans l'atelier`);
    return result({});
  }
  if (v !== LAYER3D_VERSION) {
    errors.push(`${glbFile} : glbi_version doit être l'entier ${LAYER3D_VERSION} (trouvé : ${v === undefined ? 'absent' : JSON.stringify(v)})`);
    return result({});
  }
  const rv = (raw3d as { version?: unknown } | null)?.version;
  if (rv !== v) {
    errors.push(`${glbFile} (couche 3D) : version vaut ${rv === undefined ? 'absent' : JSON.stringify(rv)}, glbi_version vaut ${v} (doivent être égaux)`);
    return result({});
  }

  // --- 1. Couche 3D ---
  const p3 = layer3dSchema.safeParse(raw3d);
  if (!p3.success) {
    errors.push(...layerIssues(p3.error, '3d', glbFile, editFile));
    return result({});
  }
  const l3 = p3.data;
  if (l3.scene.id !== id) {
    errors.push(`${glbFile} (couche 3D) : scene.id vaut « ${l3.scene.id} », attendu « ${id} » (nom du fichier et book.json)`);
  }
  // Position de caméra (AC2, DP-19, spec-actions-combinees.md §16) : la caméra regarde la cible, qui est donc exigée, et
  // ne peut pas être posée sur la cible elle-même (direction de regard indéfinie).
  for (const a of l3.modules.animations?.actions ?? []) {
    if (!a.cameraPosition) continue;
    const target = l3.modules.camera?.target;
    if (!target) {
      errors.push(`${glbFile} (couche 3D) : action « ${a.id} » : position de caméra « ${a.cameraPosition} » sans cible de caméra (camera.target, addon)`);
    } else if (a.cameraPosition === target) {
      errors.push(`${glbFile} (couche 3D) : action « ${a.id} » : position de caméra « ${a.cameraPosition} » identique à la cible de caméra (deux empties distincts attendus)`);
    }
  }

  // --- 2. Couche éditoriale ---
  let edit: EditLayer | null = null;
  let rawActionKeys: string[] = [];
  let rawActions: Record<string, unknown> = {};
  if (rawEdit === undefined) {
    errors.push(`${scene} : ${editFile} absent ; ouvrir la scène dans l'atelier (npm run atelier -- --source <dossier>)`);
  } else {
    const pe = editLayerSchema.safeParse(rawEdit);
    if (pe.success) edit = pe.data;
    else errors.push(...layerIssues(pe.error, 'edit', glbFile, editFile));
    // Orphelins relevés aussi sur un fichier invalide (atelier : rattacher ou supprimer).
    const ra = (rawEdit as { modules?: { animations?: { actions?: unknown } } } | null)?.modules?.animations?.actions;
    if (ra && typeof ra === 'object' && !Array.isArray(ra)) {
      rawActions = ra as Record<string, unknown>;
      rawActionKeys = Object.keys(ra);
    }
  }

  // --- 3. Cohérence croisée ---
  const anims = l3.modules.animations;
  const glbIds = anims?.actions.map((a) => a.id) ?? [];
  const orphans = rawActionKeys.filter((k) => !glbIds.includes(k));
  // Événements édités absents du GLB, relevés aussi sur un fichier invalide (comme les actions orphelines).
  const eventOrphans: { action: string; event: string }[] = [];
  for (const a of anims?.actions ?? []) {
    const re = (rawActions[a.id] as { events?: unknown } | null | undefined)?.events;
    if (!re || typeof re !== 'object' || Array.isArray(re)) continue;
    const known = new Set((a.events ?? []).map((ev) => ev.id));
    for (const k of Object.keys(re)) if (!known.has(k)) eventOrphans.push({ action: a.id, event: k });
  }
  if (edit) {
    if (!anims && orphans.length) {
      errors.push(`${editFile} : actions éditées mais le GLB n'a pas de module animations`);
    } else {
      for (const k of orphans) errors.push(`${editFile} : action « ${k} » absente du GLB (actions du GLB : ${glbIds.join(', ')})`);
    }
    if (!edit.scene?.name) errors.push(`${scene} : nom de la scène (scene.name) absent de ${editFile} ; à renseigner dans l'atelier`);
    // Carte de collection (CC1, spec-carte-collection.md §6) : paragraphe facultatif dans la couche, exigé par la fusion.
    if (edit.modules?.card && !edit.modules.card.text) errors.push(`${scene} : carte sans paragraphe (modules.card.text) ; à renseigner dans l'atelier`);
    for (const a of anims?.actions ?? []) {
      const ed = edit.modules?.animations?.actions[a.id];
      if (!ed?.label) errors.push(`${scene} : action « ${a.id} » sans libellé ; à renseigner dans l'atelier`);
      // Actions combinées (AC1, spec-actions-combinees.md §8) : événement du GLB sans son, événement édité inconnu du GLB.
      const glbEvents = (a.events ?? []).map((ev) => ev.id);
      for (const o of eventOrphans.filter((x) => x.action === a.id)) {
        errors.push(`${editFile} : action « ${a.id} » : événement « ${o.event} » absent du GLB (événements du GLB : ${glbEvents.join(', ') || 'aucun'})`);
      }
      for (const ev of glbEvents) {
        if (!ed?.events?.[ev]?.sound) warnings.push(`${scene} : événement « ${ev} » de l'action « ${a.id} » sans son (ignoré) ; à renseigner dans l'atelier`);
      }
    }
    if (edit.modules?.camera && !l3.modules.camera) {
      errors.push(`${editFile} : modules.camera réglé mais pas de cible dans le GLB (camera.target, addon)`);
    }
    if (l3.modules.camera && !edit.modules?.camera) warnings.push(`${scene} : cadrage non réglé, valeurs par défaut du lecteur`);
  }

  // --- 4. Objet fusionné ---
  let config: GlbiConfig | null = null;
  if (!errors.length) {
    const pm = glbiConfigSchema.safeParse(build(l3, edit, false));
    if (pm.success) config = pm.data;
    else errors.push(...formatIssues(pm.error, `${scene} (objet fusionné) : `));
  }

  let draft: GlbiConfig | null = null;
  if (opts.mode === 'draft') {
    const withEdit = glbiConfigSchema.safeParse(build(l3, edit, true));
    const onlyGlb = withEdit.success ? withEdit : glbiConfigSchema.safeParse(build(l3, null, true));
    draft = onlyGlb.success ? onlyGlb.data : null;
  }

  return result({ config: errors.length ? null : config, draft, layer3d: l3, edit, orphans, eventOrphans });
}

// ---------------------------------------------------------------------------------------------------------
// Mini-jeu (MJ1, spec-mini-jeu.md §5, §7, §8, §13) : fusion des couches du jeu
//
//   couche 3D          `glbi_game_config` de GLBI_ROOT de chaque GLB de `game/` (addon v0.4) : arène et entités
//   couche éditoriale  `game/game.edit.json` (atelier MJ3, ou à la main), `gameEditSchema`
//   couche livre       `book.json.game` (gabarit)
//   objet fusionné     `gameConfigSchema`, publié dans `game/game.json`
//
// Les cartes des scènes sont reçues (DP-21, §13 point 7) sans être contrôlées ni copiées en v1 : identifiants seulement.
// ---------------------------------------------------------------------------------------------------------

/** Couche 3D d'un GLB de `game/` : identifiant attendu (nom du fichier), objet de `glbi_game_config`, `glbi_game_version`. */
export interface GameLayerInput {
  id: string;
  raw: unknown;
  version: unknown;
}

/** Carte d'une scène du livre, par ses identifiants stables seulement (DP-21) : ni texte, ni illustration, ni valeur. */
export interface GameCardRef {
  /** Identifiant de la carte = `id` de sa scène (CC3, DP-22). */
  card: string;
  /** `id` de son type (`book.json.cardTypes`, ou `personnage` avec `cardFields`). */
  type: string;
}

export interface GameMergeInput {
  /** `book.json` validé : gabarit (`game.template`). */
  book: Book;
  /** Cartes des scènes (DP-21) : reçues, non contrôlées en v1 (contrôles à l'activation de `rewards`). */
  cards: readonly GameCardRef[];
  /** `game/arena.glb` (`null` si absent). */
  arena: GameLayerInput | null;
  /** Autres GLB de `game/` (entités), dans l'ordre des fichiers. */
  entities: readonly GameLayerInput[];
  /** Contenu de `game/game.edit.json`, `undefined` si le fichier est absent. */
  edit: unknown;
}

export interface GameMergeResult {
  /** Objet fusionné validé par `gameConfigSchema` ; `null` dès qu'il y a une erreur. */
  config: GameConfig | null;
  /** Mode `draft` seulement : objet affichable malgré les erreurs (titre et consigne remplacés, couche éditoriale ignorée si elle le rend invalide). */
  draft: GameConfig | null;
  arena: Game3dArena | null;
  entities: Game3dEntity[];
  edit: GameEdit | null;
  errors: string[];
  warnings: string[];
}

/** Clés propres à la couche éditoriale du jeu : refusées dans un GLB du jeu avec renvoi vers `game/game.edit.json`. */
const GAME_EDIT_KEYS = new Set<string>(['rules', 'camera', 'texts', 'sounds', 'credits', 'title', 'instructions', 'end', 'duration', 'preys']);
/** Clés propres à la couche 3D du jeu : refusées dans `game/game.edit.json` avec renvoi vers l'addon. */
const GAME_3D_KEYS = new Set<string>(['kind', 'id', 'role', 'object', 'clips', 'capsule', 'collider', 'entities', 'template']);

/** Messages d'une couche du jeu refusée par son schéma, avec renvoi vers la bonne couche (comme `layerIssues`). */
export function gameLayerIssues(error: z.ZodError, file: string, layer: '3d' | 'edit'): string[] {
  const label = layer === '3d' ? `${file} (couche 3D du jeu)` : file;
  const out: string[] = [];
  for (const i of error.issues) {
    const w = where(i.path);
    if (i.code === 'unrecognized_keys') {
      for (const k of i.keys) {
        let why: string;
        if ((GAME_RESERVED_KEYS as readonly string[]).includes(k)) why = GAME_REWARDS_MESSAGE;
        else if (layer === '3d' && GAME_EDIT_KEYS.has(k)) why = `clé « ${k} » non admise, elle appartient à ${GAME_EDIT_FILE}`;
        else if (layer === 'edit' && GAME_3D_KEYS.has(k)) why = `clé « ${k} » non admise, elle appartient aux GLB du jeu (addon)`;
        else why = `clé « ${k} » inconnue`;
        out.push(`${label} : ${w} : ${why}`);
      }
    } else {
      out.push(`${label} : ${w} : ${i.message}`);
    }
  }
  return out;
}

const glbOf = (id: string) => `${GAME_DIR}/${id}.glb`;

/** Version, `kind` et identifiant d'une couche 3D du jeu, puis son schéma ; `null` (erreurs ajoutées) si elle est inutilisable. */
function readGameLayer<T>(
  l: GameLayerInput,
  kind: 'arena' | 'entity',
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: z.ZodError } },
  errors: string[],
): T | null {
  const file = glbOf(l.id);
  if (l.version !== GAME3D_VERSION) {
    errors.push(`${file} : glbi_game_version doit être l'entier ${GAME3D_VERSION} (trouvé : ${l.version === undefined ? 'absent' : JSON.stringify(l.version)})`);
    return null;
  }
  const raw = l.raw as { version?: unknown; kind?: unknown; id?: unknown } | null;
  if (raw?.version !== l.version) {
    errors.push(`${file} (couche 3D du jeu) : version vaut ${raw?.version === undefined ? 'absent' : JSON.stringify(raw.version)}, glbi_game_version vaut ${l.version} (doivent être égaux)`);
    return null;
  }
  if (raw.kind !== kind) {
    const mode = kind === 'arena' ? 'Arène' : 'Entité de jeu';
    errors.push(`${file} (couche 3D du jeu) : kind vaut ${raw.kind === undefined ? 'absent' : `« ${String(raw.kind)} »`}, attendu « ${kind} » (exporter en mode « ${mode} » de l'addon)`);
    return null;
  }
  const p = schema.safeParse(l.raw);
  if (!p.success) {
    errors.push(...gameLayerIssues(p.error, file, '3d'));
    return null;
  }
  if (typeof raw.id === 'string' && raw.id !== l.id) {
    errors.push(`${file} (couche 3D du jeu) : id vaut « ${raw.id} », attendu « ${l.id} » (nom du fichier)`);
    return null;
  }
  return p.data;
}

const sameText = (s: string): LocalizedText => ({ fr: s, en: s, es: s });

/** Objet fusionné du jeu, clés dans l'ordre du contrat. `fallback` : textes manquants remplacés (mode `draft`). */
function buildGame(template: string, entities: Game3dEntity[], e: GameEdit | null, preys: unknown, fallback: boolean): Record<string, unknown> {
  const r = e?.rules ?? {};
  return {
    version: GAME_VERSION,
    template,
    entities: entities.map(({ version: _v, kind: _k, ...rest }) => (void _v, void _k, rest)),
    rules: defined({ duration: r.duration, preys, playerSpeed: r.playerSpeed, preySpeed: r.preySpeed, detectionRadius: r.detectionRadius, points: r.points, respawn: r.respawn }),
    camera: defined({ distance: e?.camera?.distance }),
    texts: defined({
      title: e?.texts?.title ?? (fallback ? sameText('Mini-jeu') : undefined),
      instructions: e?.texts?.instructions ?? (fallback ? sameText('—') : undefined),
      end: e?.texts?.end,
    }),
    sounds: e?.sounds,
    credits: e?.credits,
  };
}

/**
 * Fusionne la couche 3D des GLB du jeu (arène et entités), la couche éditoriale (`game/game.edit.json`) et le gabarit de
 * `book.json`, puis valide l'objet fusionné (`gameConfigSchema`). Contrôles croisés de la fusion : un seul joueur, proies
 * citées par les règles présentes et de rôle `prey`, titre et consigne. Les contrôles qui demandent le GLB (nœuds, clips,
 * budgets) sont faits par le build (`scripts/book-check.ts`, `readGame`).
 */
export function mergeGame(input: GameMergeInput, opts: { mode: MergeMode }): GameMergeResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const out = (r: Partial<GameMergeResult>): GameMergeResult => ({ config: null, draft: null, arena: null, entities: [], edit: null, ...r, errors, warnings });
  // DP-21 (§13 point 7) : cartes reçues, non contrôlées en v1 ; rien n'en est copié dans l'objet fusionné.
  void input.cards;
  const template = input.book.game?.template;
  if (!template) {
    errors.push('book.json : pas de game (gabarit du jeu) : jeu ignoré');
    return out({});
  }

  // --- 1. Couche 3D : arène et entités ---
  let arena: Game3dArena | null = null;
  if (!input.arena) errors.push(`${glbOf(GAME_ARENA_ID)} absent du dossier source : exporter l'arène avec l'addon (mode « Arène »)`);
  else arena = readGameLayer(input.arena, 'arena', game3dArenaSchema, errors);
  const entities: Game3dEntity[] = [];
  for (const l of input.entities) {
    const e = readGameLayer(l, 'entity', game3dEntitySchema, errors);
    if (e) entities.push(e);
  }
  if (!input.entities.length) errors.push(`jeu : aucune entité dans ${GAME_DIR}/ (game/<entité>.glb, addon en mode « Entité de jeu »)`);
  const players = entities.filter((e) => e.role === 'player');
  const preyIds = entities.filter((e) => e.role === 'prey').map((e) => e.id);
  if (entities.length === input.entities.length && input.entities.length) {
    if (!players.length) errors.push(`jeu : aucune entité joueur (role « player ») dans ${GAME_DIR}/`);
    if (players.length > 1) errors.push(`jeu : ${players.length} entités joueur (${players.map((p) => p.id).join(', ')}) : une seule attendue`);
    if (!preyIds.length) errors.push(`jeu : aucune entité proie (role « prey ») dans ${GAME_DIR}/`);
  }

  // --- 2. Couche éditoriale ---
  let edit: GameEdit | null = null;
  if (input.edit === undefined) {
    errors.push(`jeu : ${GAME_EDIT_FILE} absent ; à renseigner dans l'atelier (entrée « Jeu ») ou à la main`);
  } else {
    const p = gameEditSchema.safeParse(input.edit);
    if (p.success) edit = p.data;
    else errors.push(...gameLayerIssues(p.error, GAME_EDIT_FILE, 'edit'));
  }

  // --- 3. Cohérence croisée ---
  let preys: unknown = edit?.rules?.preys;
  if (edit) {
    if (!edit.texts?.title) errors.push(`jeu : titre du jeu (texts.title) absent de ${GAME_EDIT_FILE} ; à renseigner dans l'atelier`);
    if (!edit.texts?.instructions) errors.push(`jeu : consigne du jeu (texts.instructions) absente de ${GAME_EDIT_FILE} ; à renseigner dans l'atelier`);
    const byId = new Map(entities.map((e) => [e.id, e]));
    (edit.rules?.preys ?? []).forEach((p, i) => {
      const e = byId.get(p.entity);
      if (!e) {
        if (entities.length === input.entities.length) {
          errors.push(`${GAME_EDIT_FILE} : rules.preys.${i}.entity : entité « ${p.entity} » absente de ${GAME_DIR}/ (proies : ${preyIds.join(', ') || 'aucune'})`);
        }
      } else if (e.role !== 'prey') {
        errors.push(`${GAME_EDIT_FILE} : rules.preys.${i}.entity : « ${p.entity} » est le joueur, pas une proie (proies : ${preyIds.join(', ') || 'aucune'})`);
      }
    });
    if (!edit.rules?.preys && preyIds.length > 1) {
      errors.push(`jeu : rules.preys absent de ${GAME_EDIT_FILE} : plusieurs sortes de proies (${preyIds.join(', ')}), à choisir dans l'atelier`);
    }
    const cited = new Set((edit.rules?.preys ?? (preyIds.length === 1 ? [{ entity: preyIds[0] }] : [])).map((p) => p.entity));
    for (const id of preyIds) if (!cited.has(id)) warnings.push(`jeu : proie « ${id} » non citée par rules.preys (${GAME_EDIT_FILE}) : jamais en jeu`);
  }
  // Valeur par défaut du gabarit (§6) : une seule sorte de proie, 8 en même temps.
  if (preys === undefined && preyIds.length === 1) preys = [{ entity: preyIds[0], count: GAME_DEFAULTS.preyCount }];

  // --- 4. Objet fusionné ---
  let config: GameConfig | null = null;
  if (!errors.length) {
    const pm = gameConfigSchema.safeParse(buildGame(template, entities, edit, preys, false));
    if (pm.success) config = pm.data;
    else errors.push(...formatIssues(pm.error, `jeu (objet fusionné) : `));
  }
  let draft: GameConfig | null = null;
  if (opts.mode === 'draft') {
    const draftPreys = preys ?? (preyIds.length ? [{ entity: preyIds[0], count: GAME_DEFAULTS.preyCount }] : undefined);
    const withEdit = gameConfigSchema.safeParse(buildGame(template, entities, edit, draftPreys, true));
    const onlyGlb = withEdit.success ? withEdit : gameConfigSchema.safeParse(buildGame(template, entities, null, draftPreys, true));
    draft = onlyGlb.success ? onlyGlb.data : null;
  }
  return out({ config: errors.length ? null : config, draft, arena, entities, edit });
}
