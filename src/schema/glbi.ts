// src/schema/glbi.ts — contrat unique de la cartouche (D-8.2, Î6).
// Source : spec-extras-blender.md v1.1, section 4 (`glbi_config`, extras du GLB) et section 5 (`book.json`).
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

/** Identifiant de scène : même règle que le routeur (`#/s/<scène>`, `src/components/book/sceneRoute.ts`). */
export const SCENE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;
export const sceneIdSchema = z.string().regex(SCENE_ID_PATTERN, 'identifiant de scène : lettres, chiffres, _ et -');

/** Noms d'objets, d'armatures et de clips (spec §3) : lettres, chiffres et `_`, ni point ni espace. */
export const BLENDER_NAME_PATTERN = /^[A-Za-z0-9_]+$/;
const blenderNameSchema = z.string().regex(BLENDER_NAME_PATTERN, 'nom Blender : lettres, chiffres et _ uniquement');

export const IMAGE_EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg', 'avif'] as const;
export const AUDIO_EXTENSIONS = ['mp3', 'ogg', 'opus', 'm4a', 'aac', 'wav'] as const;

/**
 * Chemin d'asset relatif à la racine du livre (D-8.1, V-02, C-22, C-23) : pas d'URL, pas de `/` initial,
 * pas de `..`, pas d'anti-slash, segments en lettres/chiffres/`_`/`-`/`.`, extension obligatoire et attendue.
 */
function assetPath(kind: string, extensions: readonly string[]) {
  return z.string().superRefine((p, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message: `${kind} « ${p} » : ${message}` });
    if (/^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('//')) return fail('URL refusée, chemin relatif attendu');
    if (p.startsWith('/') || p.startsWith('./')) return fail('chemin relatif à la racine du livre, sans / ni ./ initial');
    if (p.includes('\\')) return fail('anti-slash interdit');
    const segments = p.split('/');
    if (segments.some((s) => s === '' || s === '.' || s === '..')) return fail('segment vide, . ou .. interdit');
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
// glbi_config (spec §4) — extras de l'empty GLBI_ROOT, ou JSON de développement posé à côté du GLB
// ---------------------------------------------------------------------------------------------------------

/** Version des extras (`glbi_version` sur GLBI_ROOT, `version` dans la config) : l'entier 1 (spec §2). */
export const GLBI_VERSION = 1 as const;
export const GLBI_ROOT_NAME = 'GLBI_ROOT';

const radians = z.number().finite();

/** Cadrage orbital du POI unique (spec §4, V-04, V-05). Angles en radians. Sémantique de `zoom` : Î10 (D-3.4). */
export const cameraModuleSchema = z
  .strictObject({
    target: blenderNameSchema,
    zoom: z.number().finite().nonnegative().optional(),
    lookAxis: z.enum(['x', 'y', 'z']).optional(),
    minDistance: z.number().finite().nonnegative().optional(),
    maxDistance: z.number().finite().positive().optional(),
    minPolarAngle: radians.min(0).max(Math.PI + 1e-6).optional(),
    maxPolarAngle: radians.min(0).max(Math.PI + 1e-6).optional(),
    minAzimuthAngle: radians.min(-2 * Math.PI - 1e-6).max(2 * Math.PI + 1e-6).optional(),
    maxAzimuthAngle: radians.min(-2 * Math.PI - 1e-6).max(2 * Math.PI + 1e-6).optional(),
    enableZoom: z.boolean().default(true),
  })
  .superRefine((c, ctx) => {
    // V-05 (interprétation, voir rapport Î6) : bornes ordonnées.
    const pairs: [keyof typeof c, keyof typeof c][] = [
      ['minDistance', 'maxDistance'],
      ['minPolarAngle', 'maxPolarAngle'],
      ['minAzimuthAngle', 'maxAzimuthAngle'],
    ];
    for (const [lo, hi] of pairs) {
      const a = c[lo];
      const b = c[hi];
      if (typeof a === 'number' && typeof b === 'number' && a > b) {
        ctx.addIssue({ code: 'custom', path: [lo], message: `${String(lo)} (${a}) > ${String(hi)} (${b})` });
      }
    }
  });

/** Clip de repos joué en boucle au chargement (mode `buttons`). */
export const idleSchema = z.strictObject({
  object: blenderNameSchema,
  clip: blenderNameSchema,
  loop: z.boolean().default(true),
});

/** Une action = un bouton (point 4 validé). */
export const actionSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/i, 'identifiant d’action : lettres, chiffres, _ et -'),
  object: blenderNameSchema,
  type: z.enum(['armature', 'mesh']),
  clip: blenderNameSchema,
  trigger: z.literal('button'),
  label: localizedTextSchema,
  icon: imagePathSchema.optional(),
  sound: audioPathSchema.optional(),
  loop: z.boolean().default(false),
});

export const animationsModuleSchema = z
  .strictObject({
    mode: z.literal('buttons'),
    idle: idleSchema,
    actions: z.array(actionSchema).min(1, 'au moins une action'),
  })
  .superRefine((a, ctx) => {
    const seen = new Set<string>();
    a.actions.forEach((act, i) => {
      if (seen.has(act.id)) ctx.addIssue({ code: 'custom', path: ['actions', i, 'id'], message: `id d'action en double « ${act.id} »` });
      seen.add(act.id);
    });
  });

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

/** Une entrée de la liste des fichiers du livre (O-13, C-34) : chemin relatif à la racine, taille, empreinte. */
export const bookFileSchema = z.strictObject({
  path: z.string().min(1),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
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
    source: z.enum(['glb', 'json']),
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
