// src/schema/glbi.ts — contrat unique de la cartouche (D-8.2, Î6).
// Source : spec-extras-blender.md section 4 (objet fusionné publié) et section 5 (`book.json`) ; spec-atelier-glbi.md §3, §4
// et §6 (couche 3D du GLB, couche éditoriale `scenes/<id>.edit.json`, D-8.9). La fusion est dans `./merge.ts`.
// Utilisé par `scripts/build-book.ts` (validation au build) ; l'application n'en importe que les types
// (`import type`), Zod n'entre donc pas dans le bundle du lecteur.
// Aucune dépendance autre que `zod` : ce fichier est exécuté tel quel par `tsx` depuis les scripts.
import { z } from 'zod';

// Messages par défaut de Zod en français (clés inconnues, types, etc.).
z.config(z.locales.fr());

// ---------------------------------------------------------------------------------------------------------
// Briques communes
// ---------------------------------------------------------------------------------------------------------

/** Langues du livre 1 (point 3 validé). Toutes obligatoires dans chaque texte (V-09). */
export const LANGUAGES = ['fr', 'en', 'es'] as const;
export const languageSchema = z.enum(LANGUAGES);

const nonEmpty = z.string({ error: 'texte manquant' }).trim().min(1, 'texte vide');

/** Texte traduit `{ fr, en, es }` : les trois langues sont obligatoires (V-09), aucune autre clé. */
const translated = z
  .string({ error: 'traduction manquante (V-09 : fr, en et es obligatoires)' })
  .trim()
  .min(1, 'traduction vide (V-09)');
export const localizedTextSchema = z.strictObject({ fr: translated, en: translated, es: translated });

/**
 * Identifiant de scène : même règle que le routeur (`#/s/<scène>`, `src/components/book/sceneRoute.ts`).
 * Écrit sans drapeau `i` : `z.toJSONSchema` perd les drapeaux des regex (le schéma exporté pour l'addon serait plus strict).
 */
export const SCENE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
export const sceneIdSchema = z.string().regex(SCENE_ID_PATTERN, 'identifiant de scène : lettres, chiffres, _ et -');

/** Noms d'objets, d'armatures et de clips (spec §3) : lettres, chiffres et `_`, ni point ni espace. */
export const BLENDER_NAME_PATTERN = /^[A-Za-z0-9_]+$/;
const blenderNameSchema = z.string().regex(BLENDER_NAME_PATTERN, 'nom Blender : lettres, chiffres et _ uniquement');

/**
 * Dossier réservé du dossier source (DP-2, spec-app-bureau.md §5) : `blender/<scène>.blend`, textures de travail,
 * sauvegardes. Jamais publié : refusé dans les chemins d'assets, ignoré par la liste des fichiers non référencés de
 * `book:check` et par l'atelier (scrutation, menus d'assets). Comparaison sans casse (Windows : `Blender/` = `blender/`).
 */
export const RESERVED_SOURCE_DIR = 'blender';
/** `rel` (chemin relatif à la racine du livre, séparateur `/`) est dans le dossier réservé `blender/`. */
export const isReservedSourcePath = (rel: string): boolean => rel.split('/')[0].toLowerCase() === RESERVED_SOURCE_DIR;

export const IMAGE_EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg', 'avif'] as const;
export const AUDIO_EXTENSIONS = ['mp3', 'ogg', 'opus', 'm4a', 'aac', 'wav'] as const;

/**
 * Chemin d'asset relatif à la racine du livre (D-8.1, V-02, C-22, C-23) : pas d'URL, pas de `/` initial,
 * pas de `..`, pas d'anti-slash, segments en lettres/chiffres/`_`/`-`/`.`, extension obligatoire et attendue,
 * pas sous le dossier réservé `blender/` (ST1, DP-2 ; aucun livre valide n'en dépendait : versions inchangées).
 */
function assetPath(kind: string, extensions: readonly string[]) {
  return z.string().superRefine((p, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message: `${kind} « ${p} » : ${message}` });
    if (/^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('//')) return fail('URL refusée, chemin relatif attendu');
    if (p.startsWith('/') || p.startsWith('./')) return fail('chemin relatif à la racine du livre, sans / ni ./ initial');
    if (p.includes('\\')) return fail('anti-slash interdit');
    const segments = p.split('/');
    if (segments.some((s) => s === '' || s === '.' || s === '..')) return fail('segment vide, . ou .. interdit');
    if (isReservedSourcePath(p)) return fail(`dossier ${RESERVED_SOURCE_DIR}/ réservé aux fichiers de travail, non publié`);
    if (segments.some((s) => !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(s))) {
      return fail('caractères autorisés : lettres, chiffres, _, - et .');
    }
    const ext = /\.([A-Za-z0-9]+)$/.exec(p)?.[1]?.toLowerCase();
    if (!ext) return fail('extension manquante');
    if (!extensions.includes(ext)) return fail(`extension .${ext} refusée (attendu : ${extensions.join(', ')})`);
  });
}
export const imagePathSchema = assetPath('image', IMAGE_EXTENSIONS);
export const audioPathSchema = assetPath('son', AUDIO_EXTENSIONS);
export const anyAssetPathSchema = assetPath('asset', [...IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS]);

// ---------------------------------------------------------------------------------------------------------
// Objet fusionné (spec-extras-blender.md §4) — `scenes/<id>.json` publié, produit par la fusion des deux couches (D-8.9)
// ---------------------------------------------------------------------------------------------------------

/** Version de l'objet fusionné (`version` de `scenes/<id>.json` publié) : l'entier 1 (spec-extras-blender.md §4). */
export const GLBI_VERSION = 1 as const;
/** Version de la couche 3D : `GLBI_ROOT.glbi_version` et `glbi_config.version`, l'entier 2 depuis D-8.9 (spec-atelier-glbi.md §3). */
export const LAYER3D_VERSION = 2 as const;
/** Version de la couche éditoriale : `version` de `scenes/<id>.edit.json`, l'entier 1 (spec-atelier-glbi.md §4). */
export const EDIT_LAYER_VERSION = 1 as const;
export const GLBI_ROOT_NAME = 'GLBI_ROOT';

const radians = z.number().finite();

/** Cadrage de la caméra : partie éditoriale du module caméra (D-8.9), réglée dans l'atelier. Angles en radians. */
const cameraFramingShape = {
  /** Position de départ dans la plage de distance : 0 = `minDistance`, 1 = `maxDistance` (0,5 si absent, lecteur) ; décision du 13/10, C-08. */
  zoom: z.number().finite().min(0).max(1).optional(),
  /** Vue de départ sans bornes d'azimut : `x` = caméra sur +X (profil), `y` ou `z` = de face (lecteur, `lib/orbitFraming.ts`). */
  lookAxis: z.enum(['x', 'y', 'z']).optional(),
  minDistance: z.number().finite().nonnegative().optional(),
  maxDistance: z.number().finite().positive().optional(),
  minPolarAngle: radians.min(0).max(Math.PI + 1e-6).optional(),
  maxPolarAngle: radians.min(0).max(Math.PI + 1e-6).optional(),
  minAzimuthAngle: radians.min(-2 * Math.PI - 1e-6).max(2 * Math.PI + 1e-6).optional(),
  maxAzimuthAngle: radians.min(-2 * Math.PI - 1e-6).max(2 * Math.PI + 1e-6).optional(),
  enableZoom: z.boolean().default(true),
};
/** Clés du cadrage (couche éditoriale), pour les messages de la fusion. */
export const CAMERA_FRAMING_KEYS = Object.keys(cameraFramingShape) as (keyof typeof cameraFramingShape)[];

/** V-05 (interprétation, voir rapport Î6) : bornes ordonnées. */
function orderedBounds(c: { [k: string]: unknown }, ctx: z.RefinementCtx): void {
  const pairs = [
    ['minDistance', 'maxDistance'],
    ['minPolarAngle', 'maxPolarAngle'],
    ['minAzimuthAngle', 'maxAzimuthAngle'],
  ] as const;
  for (const [lo, hi] of pairs) {
    const a = c[lo];
    const b = c[hi];
    if (typeof a === 'number' && typeof b === 'number' && a > b) {
      ctx.addIssue({ code: 'custom', path: [lo], message: `${lo} (${a}) > ${hi} (${b})` });
    }
  }
}

/** Cadrage orbital du POI unique (spec §4, V-04, V-05). Cible : couche 3D ; cadrage : couche éditoriale (D-8.9). */
export const cameraModuleSchema = z.strictObject({ target: blenderNameSchema, ...cameraFramingShape }).superRefine(orderedBounds);

/** Clip de repos joué en boucle au chargement (mode `buttons`). */
export const idleSchema = z.strictObject({
  object: blenderNameSchema,
  clip: blenderNameSchema,
  loop: z.boolean().default(true),
});

/** Identifiant d'action : clé de jointure entre les deux couches (D-8.9). Sans drapeau `i` (voir SCENE_ID_PATTERN). */
export const actionIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'identifiant d’action : lettres, chiffres, _ et -');

/** Une action = un bouton (point 4 validé). */
export const actionSchema = z.strictObject({
  id: actionIdSchema,
  object: blenderNameSchema,
  type: z.enum(['armature', 'mesh']),
  clip: blenderNameSchema,
  trigger: z.literal('button'),
  label: localizedTextSchema,
  icon: imagePathSchema.optional(),
  sound: audioPathSchema.optional(),
  loop: z.boolean().default(false),
});

function uniqueActionIds(a: { actions: { id: string }[] }, ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  a.actions.forEach((act, i) => {
    if (seen.has(act.id)) ctx.addIssue({ code: 'custom', path: ['actions', i, 'id'], message: `id d'action en double « ${act.id} »` });
    seen.add(act.id);
  });
}

export const animationsModuleSchema = z
  .strictObject({
    mode: z.literal('buttons'),
    idle: idleSchema,
    actions: z.array(actionSchema).min(1, 'au moins une action'),
  })
  .superRefine(uniqueActionIds);

export const audioModuleSchema = z.strictObject({
  ambientSound: audioPathSchema.optional(),
});

/** Quiz d'entrée (point 2 validé) : exactement 3 réponses, exactement 1 correcte. */
export const quizModuleSchema = z
  .strictObject({
    question: localizedTextSchema,
    choices: z
      .array(z.strictObject({ text: localizedTextSchema, correct: z.boolean() }))
      .length(3, 'exactement 3 réponses'),
    explanation: localizedTextSchema,
  })
  .superRefine((q, ctx) => {
    const n = q.choices.filter((c) => c.correct).length;
    if (n !== 1) ctx.addIssue({ code: 'custom', path: ['choices'], message: `exactement 1 réponse correcte (trouvé : ${n})` });
  });

/** Crédits des assets hors GLB (sons, icônes, images). Les modèles sont crédités par les `src_*` du GLB (D-8.5). */
export const assetCreditSchema = z.strictObject({
  asset: anyAssetPathSchema,
  title: nonEmpty,
  author: nonEmpty,
  license: nonEmpty,
  source: nonEmpty.optional(),
});
export const creditsModuleSchema = z.strictObject({
  assets: z.array(assetCreditSchema),
});

/** Modules réservés (spec §6) : clés connues, refusées tant que la console ne les active pas pour un livre. */
export const RESERVED_MODULES = [
  'postProcessing', 'cameraPath', 'poiTree', 'effects', 'videos', 'spritesheets',
  'dialogue', 'lights', 'bulbs', 'toonOutline', 'arcade', 'timeline',
] as const;

const activeModulesShape = {
  camera: cameraModuleSchema.optional(),
  animations: animationsModuleSchema.optional(),
  audio: audioModuleSchema.optional(),
  quiz: quizModuleSchema.optional(),
  credits: creditsModuleSchema.optional(),
};

/** Un module est actif s'il est présent (principe console/cartouche). Toute autre clé est refusée. */
export const modulesSchema = z.strictObject(activeModulesShape, {
  error: (iss) => {
    if (iss.code !== 'unrecognized_keys') return undefined;
    return iss.keys
      .map((k) => ((RESERVED_MODULES as readonly string[]).includes(k)
        ? `module réservé « ${k} », non activable en v1 (spec §6)`
        : `module inconnu « ${k} »`))
      .join(' ; ');
  },
});

export const glbiConfigSchema = z.strictObject({
  version: z.literal(GLBI_VERSION),
  scene: z.strictObject({
    id: sceneIdSchema,
    name: localizedTextSchema,
    loaderImage: imagePathSchema.optional(),
  }),
  modules: modulesSchema,
});

export type LocalizedText = z.infer<typeof localizedTextSchema>;
export type CameraModule = z.infer<typeof cameraModuleSchema>;
export type AnimationAction = z.infer<typeof actionSchema>;
export type AnimationsModule = z.infer<typeof animationsModuleSchema>;
export type QuizModule = z.infer<typeof quizModuleSchema>;
export type AssetCredit = z.infer<typeof assetCreditSchema>;
export type GlbiConfig = z.infer<typeof glbiConfigSchema>;

// ---------------------------------------------------------------------------------------------------------
// Couches de la configuration d'une scène (D-8.9, spec-atelier-glbi.md §2 à §4). Strictes : un champ écrit dans la
// mauvaise couche est refusé (messages de la fusion, `./merge.ts`). La fusion des deux doit passer `glbiConfigSchema`.
// ---------------------------------------------------------------------------------------------------------

/** Action, partie 3D (addon) : identifiant, objet, clip, boucle. */
export const action3dSchema = z.strictObject({
  id: actionIdSchema,
  object: blenderNameSchema,
  type: z.enum(['armature', 'mesh']),
  clip: blenderNameSchema,
  trigger: z.literal('button'),
  loop: z.boolean().default(false),
});

/**
 * Couche 3D : `glbi_config` de `GLBI_ROOT`, écrite par l'addon GLBGenerator (spec-atelier-glbi.md §3).
 * Exportée en JSON Schema pour l'addon (`npm run schema:export`) : les `superRefine` n'y figurent pas.
 */
export const layer3dSchema = z.strictObject({
  version: z.literal(LAYER3D_VERSION),
  scene: z.strictObject({ id: sceneIdSchema }),
  modules: z.strictObject({
    camera: z.strictObject({ target: blenderNameSchema }).optional(),
    animations: z
      .strictObject({
        mode: z.literal('buttons'),
        idle: idleSchema,
        actions: z.array(action3dSchema).min(1, 'au moins une action'),
      })
      .superRefine(uniqueActionIds)
      .optional(),
  }),
});

/**
 * Action, partie éditoriale (atelier). `label` est facultatif dans la couche (saisie en cours dans l'atelier) ; la fusion
 * exige un libellé pour chaque action du GLB.
 */
export const actionEditSchema = z.strictObject({
  label: localizedTextSchema.optional(),
  icon: imagePathSchema.optional(),
  sound: audioPathSchema.optional(),
});

/**
 * Couche éditoriale : `scenes/<id>.edit.json`, écrite par l'atelier ou à la main (spec-atelier-glbi.md §4). Arborescence de
 * l'objet fusionné ; actions indexées par leur `id` (l'ordre appartient au GLB). `scene.name` est facultatif dans la couche,
 * exigé par la fusion.
 */
export const editLayerSchema = z.strictObject({
  version: z.literal(EDIT_LAYER_VERSION),
  scene: z
    .strictObject({
      name: localizedTextSchema.optional(),
      loaderImage: imagePathSchema.optional(),
    })
    .optional(),
  modules: z
    .strictObject({
      camera: z.strictObject(cameraFramingShape).superRefine(orderedBounds).optional(),
      animations: z.strictObject({ actions: z.record(actionIdSchema, actionEditSchema) }).optional(),
      audio: audioModuleSchema.optional(),
      quiz: quizModuleSchema.optional(),
      credits: creditsModuleSchema.optional(),
    })
    .optional(),
});

export type Layer3d = z.infer<typeof layer3dSchema>;
export type EditLayer = z.infer<typeof editLayerSchema>;

// ---------------------------------------------------------------------------------------------------------
// book.json (spec §5) — couche livre, hors GLB, écrite à la main
// ---------------------------------------------------------------------------------------------------------

/** Adresse imprimée (QR) : `https://hôte` éventuellement suivie d'un chemin, sans `/` final, sans requête. */
export const originSchema = z
  .string()
  .regex(/^https:\/\/[a-z0-9.-]+(?::\d+)?(\/[A-Za-z0-9._~-]+)*$/i, 'adresse imprimée : https://hôte[/chemin], sans / final');

export const bookSchema = z
  .strictObject({
    bookId: sceneIdSchema,
    title: localizedTextSchema,
    languages: z.array(languageSchema).min(1),
    scenes: z.array(sceneIdSchema).min(1, 'au moins une scène'),
    origin: originSchema,
    ogImage: imagePathSchema.optional(),
    legal: z.strictObject({
      year: z.number().int().min(2000).max(2100),
      text: localizedTextSchema,
    }),
    unlockThreshold: z.number().int().positive().optional(),
  })
  .superRefine((b, ctx) => {
    const dup = (arr: readonly string[]) => arr.filter((x, i) => arr.indexOf(x) !== i);
    for (const d of new Set(dup(b.scenes))) ctx.addIssue({ code: 'custom', path: ['scenes'], message: `scène en double « ${d} »` });
    for (const d of new Set(dup(b.languages))) ctx.addIssue({ code: 'custom', path: ['languages'], message: `langue en double « ${d} »` });
    for (const l of LANGUAGES) {
      if (!b.languages.includes(l)) ctx.addIssue({ code: 'custom', path: ['languages'], message: `langue « ${l} » manquante (livre 1 : ${LANGUAGES.join(', ')})` });
    }
    if (b.unlockThreshold !== undefined && b.unlockThreshold > b.scenes.length) {
      ctx.addIssue({ code: 'custom', path: ['unlockThreshold'], message: `seuil (${b.unlockThreshold}) > nombre de scènes (${b.scenes.length})` });
    }
  });

export type Book = z.infer<typeof bookSchema>;

// ---------------------------------------------------------------------------------------------------------
// Sorties du build (dossier du livre) — lues par le lecteur (Î8, Î10, Î13)
// ---------------------------------------------------------------------------------------------------------

/** Une partie déployée d'un fichier découpé (D-8.7) : chemin relatif à la racine, taille, empreinte. */
export const bookFilePartSchema = z.strictObject({
  path: z.string().min(1),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type BookFilePart = z.infer<typeof bookFilePartSchema>;

/**
 * Une entrée de la liste des fichiers du livre (O-13, C-34) : chemin relatif à la racine, taille, empreinte.
 * D-8.7 : un fichier de plus de 25 MiB n'est pas déployé tel quel ; `parts` liste ses parties dans l'ordre, et
 * `path`/`size`/`sha256` décrivent le fichier logique que le téléchargeur recompose et range sous son URL d'origine.
 */
export const bookFileSchema = z
  .strictObject({
    path: z.string().min(1),
    size: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    parts: z.array(bookFilePartSchema).min(2).optional(),
  })
  .superRefine((f, ctx) => {
    if (f.parts && f.parts.reduce((s, p) => s + p.size, 0) !== f.size) {
      ctx.addIssue({ code: 'custom', path: ['parts'], message: `somme des parties ≠ taille du fichier (${f.size})` });
    }
  });
export type BookFile = z.infer<typeof bookFileSchema>;

/** Crédit d'un modèle, collecté dans les propriétés `src_*` des nœuds du GLB (D-8.5). */
export const modelCreditSchema = z.strictObject({
  name: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),
  url: z.string().optional(),
});
export type ModelCredit = z.infer<typeof modelCreditSchema>;

/** `scenes/<id>.json` du dossier construit : la config validée (valeurs par défaut appliquées) + données de build. */
export const builtSceneSchema = glbiConfigSchema.extend({
  build: z.strictObject({
    glb: z.string(),
    modelCredits: z.array(modelCreditSchema),
  }),
});
export type BuiltScene = z.infer<typeof builtSceneSchema>;

/** `book.json` du dossier construit : le livre (spec §5) + la liste de fichiers ajoutée par le build. */
export const builtBookSchema = bookSchema.safeExtend({
  files: z.array(bookFileSchema),
});
export type BuiltBook = z.infer<typeof builtBookSchema>;

/** Partie commune à `book.json` construit et à l'index de la cartouche de test (lue par le téléchargeur, Î8). */
export const bookFilesIndexSchema = z.looseObject({
  bookId: z.string(),
  scenes: z.array(z.string()),
  files: z.array(bookFileSchema),
});
export type BookFilesIndex = z.infer<typeof bookFilesIndexSchema>;

// ---------------------------------------------------------------------------------------------------------
// Aide : message lisible
// ---------------------------------------------------------------------------------------------------------

export function formatIssues(error: z.ZodError, prefix = ''): string[] {
  return error.issues.map((i) => {
    const where = i.path.length ? i.path.map(String).join('.') : '(racine)';
    return `${prefix}${where} : ${i.message}`;
  });
}
