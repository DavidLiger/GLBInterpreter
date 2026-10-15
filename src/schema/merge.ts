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
  errors: string[];
  warnings: string[];
}

/** Clés propres à la couche éditoriale : refusées dans le GLB avec un renvoi vers `edit.json`. */
const EDIT_KEYS = new Set<string>(['name', 'loaderImage', 'label', 'icon', 'sound', ...CAMERA_FRAMING_KEYS, 'audio', 'quiz', 'credits']);
/** Clés propres à la couche 3D : refusées dans `edit.json` avec un renvoi vers l'addon. */
const LAYER3D_KEYS = new Set<string>(['id', 'target', 'mode', 'idle', 'object', 'type', 'clip', 'trigger', 'loop']);

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

/** Objet fusionné, clés dans l'ordre du contrat. `fallback` : textes manquants remplacés par les identifiants (mode `draft`). */
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
            });
          }),
        }
      : undefined,
    audio: e?.modules?.audio,
    quiz: e?.modules?.quiz,
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
    config: null, draft: null, layer3d: null, edit: null, orphans: [], ...r, errors, warnings,
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

  // --- 2. Couche éditoriale ---
  let edit: EditLayer | null = null;
  let rawActionKeys: string[] = [];
  if (rawEdit === undefined) {
    errors.push(`${scene} : ${editFile} absent ; ouvrir la scène dans l'atelier (npm run atelier -- --source <dossier>)`);
  } else {
    const pe = editLayerSchema.safeParse(rawEdit);
    if (pe.success) edit = pe.data;
    else errors.push(...layerIssues(pe.error, 'edit', glbFile, editFile));
    // Orphelins relevés aussi sur un fichier invalide (atelier : rattacher ou supprimer).
    const ra = (rawEdit as { modules?: { animations?: { actions?: unknown } } } | null)?.modules?.animations?.actions;
    if (ra && typeof ra === 'object' && !Array.isArray(ra)) rawActionKeys = Object.keys(ra);
  }

  // --- 3. Cohérence croisée ---
  const anims = l3.modules.animations;
  const glbIds = anims?.actions.map((a) => a.id) ?? [];
  const orphans = rawActionKeys.filter((k) => !glbIds.includes(k));
  if (edit) {
    if (!anims && orphans.length) {
      errors.push(`${editFile} : actions éditées mais le GLB n'a pas de module animations`);
    } else {
      for (const k of orphans) errors.push(`${editFile} : action « ${k} » absente du GLB (actions du GLB : ${glbIds.join(', ')})`);
    }
    if (!edit.scene?.name) errors.push(`${scene} : nom de la scène (scene.name) absent de ${editFile} ; à renseigner dans l'atelier`);
    for (const a of anims?.actions ?? []) {
      if (!edit.modules?.animations?.actions[a.id]?.label) errors.push(`${scene} : action « ${a.id} » sans libellé ; à renseigner dans l'atelier`);
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

  return result({ config: errors.length ? null : config, draft, layer3d: l3, edit, orphans });
}
