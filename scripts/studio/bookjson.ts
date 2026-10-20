// scripts/studio/bookjson.ts — `book.json` écrit par le studio (ST2, spec-app-bureau.md §4, DP-3), règles pures testées par
// scripts/studio/test-studio.ts. Aucune lecture de fichier ni processus.
//
// - Contrat : `bookSchema` du Zod du build (importé, aucune règle recopiée ; le motif des identifiants de scène et les
//   langues sont envoyés à la page tels quels).
// - Forme écrite : clés dans l'ordre de `bookSchema` (objets imbriqués compris), indentation 2, UTF-8 sans échappement des
//   accents (`JSON.stringify`), retour à la ligne final, champs facultatifs vides omis.
// - Formulaire : valeurs saisies (textes), composées en objet puis validées par `bookSchema` ; `unlockThreshold` (sujet 5)
//   n'est pas dans le formulaire : sa valeur sur le disque est reprise telle quelle.
// - Lecture d'un `book.json` illisible ou invalide : ce qui est lisible préremplit le formulaire.
import { z } from 'zod';
import { bookSchema, formatIssues, LANGUAGES, SCENE_ID_PATTERN, type Book } from '../../src/schema/glbi';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------------------------------------------------
// Forme écrite
// ---------------------------------------------------------------------------------------------------------

/** Copie de `value` avec les clés dans l'ordre du schéma Zod (objets imbriqués compris) ; clés inconnues ensuite. */
export function orderLikeSchema(schema: z.ZodType, value: unknown): unknown {
  let s: z.ZodType = schema;
  while (s instanceof z.ZodOptional) s = s.unwrap() as z.ZodType;
  if (s instanceof z.ZodArray) return Array.isArray(value) ? value.map((v) => orderLikeSchema(s.element as z.ZodType, v)) : value;
  if (!(s instanceof z.ZodObject) || !isObj(value)) return value;
  const shape = s.shape as Record<string, z.ZodType>;
  const out: Obj = {};
  for (const k of Object.keys(shape)) if (value[k] !== undefined) out[k] = orderLikeSchema(shape[k], value[k]);
  for (const k of Object.keys(value)) if (!(k in out) && value[k] !== undefined) out[k] = value[k];
  return out;
}

/** Texte de `book.json` tel que le studio l'écrit (`book` validé par `bookSchema`). */
export function formatBook(book: Book): string {
  return `${JSON.stringify(orderLikeSchema(bookSchema, book), null, 2)}\n`;
}

// ---------------------------------------------------------------------------------------------------------
// Formulaire
// ---------------------------------------------------------------------------------------------------------

export interface Texts {
  fr: string;
  en: string;
  es: string;
}

/** Valeurs du formulaire (textes tels que saisis ; l'année aussi, convertie à la composition). */
export interface BookForm {
  bookId: string;
  title: Texts;
  scenes: string[];
  origin: string;
  /** `""` : pas d'image de partage (champ omis). */
  ogImage: string;
  legal: { year: string; text: Texts };
}

/** Champs lisibles d'un `book.json` (pour préremplir le formulaire) et champ hors formulaire conservé. */
export interface ReadableBook {
  form: BookForm;
  /** `unlockThreshold` lu sur le disque (valeur brute, même invalide), repris tel quel à l'écriture. */
  unlockThreshold?: unknown;
  /** `bookId` lisible sur le disque : celui d'un livre existant, non modifiable. */
  bookIdOnDisk: string | null;
}

export const legalDefault = (year: number): string => `© ${year} Éditions Liger`;

export function emptyForm(year: number): BookForm {
  const text = legalDefault(year);
  return {
    bookId: '',
    title: { fr: '', en: '', es: '' },
    scenes: [],
    origin: '',
    ogImage: '',
    legal: { year: String(year), text: { fr: text, en: text, es: text } },
  };
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const texts = (v: unknown): Texts => {
  const o = isObj(v) ? v : {};
  return { fr: str(o.fr), en: str(o.en), es: str(o.es) };
};

/**
 * Ce qui est lisible d'un `book.json` (`raw` : contenu analysé, `undefined` si illisible). `legal` absent ou illisible :
 * prérempli « © <année> Éditions Liger » (§4).
 */
export function readableBook(raw: unknown, year: number): ReadableBook {
  const f = emptyForm(year);
  if (!isObj(raw)) return { form: f, bookIdOnDisk: null };
  f.bookId = str(raw.bookId);
  f.title = texts(raw.title);
  f.scenes = Array.isArray(raw.scenes) ? raw.scenes.filter((s): s is string => typeof s === 'string') : [];
  f.origin = str(raw.origin);
  f.ogImage = str(raw.ogImage);
  if (isObj(raw.legal)) {
    const y = raw.legal.year;
    f.legal = { year: typeof y === 'number' || typeof y === 'string' ? String(y) : '', text: texts(raw.legal.text) };
  }
  const r: ReadableBook = { form: f, bookIdOnDisk: typeof raw.bookId === 'string' && raw.bookId !== '' ? raw.bookId : null };
  if ('unlockThreshold' in raw) r.unlockThreshold = raw.unlockThreshold;
  return r;
}

/** Valeurs reçues de la page, ramenées à un `BookForm` (champ absent ou mal typé : vide). */
export function formFromBody(v: unknown): BookForm {
  const o = isObj(v) ? v : {};
  const legal = isObj(o.legal) ? o.legal : {};
  return {
    bookId: str(o.bookId),
    title: texts(o.title),
    scenes: Array.isArray(o.scenes) ? o.scenes.map((s) => str(s)) : [],
    origin: str(o.origin),
    ogImage: str(o.ogImage),
    legal: { year: typeof legal.year === 'number' ? String(legal.year) : str(legal.year), text: texts(legal.text) },
  };
}

/** Objet `book.json` composé du formulaire, avant validation. `languages` : celles du Zod (affichées, non modifiables). */
export function composeBook(form: BookForm, keep: { unlockThreshold?: unknown } = {}): Obj {
  const y = form.legal.year.trim();
  const book: Obj = {
    bookId: form.bookId.trim(),
    title: { ...form.title },
    languages: [...LANGUAGES],
    scenes: [...form.scenes],
    origin: form.origin.trim(),
    legal: { year: /^-?\d+$/.test(y) ? Number(y) : y, text: { ...form.legal.text } },
  };
  if (form.ogImage.trim()) book.ogImage = form.ogImage.trim();
  if (keep.unlockThreshold !== undefined) book.unlockThreshold = keep.unlockThreshold;
  return book;
}

/** Validation par `bookSchema` : livre prêt à écrire, ou messages de `formatIssues`. */
export function validateBook(obj: unknown): { ok: true; book: Book; text: string } | { ok: false; errors: string[] } {
  const r = bookSchema.safeParse(obj);
  if (!r.success) return { ok: false, errors: formatIssues(r.error, 'book.json : ') };
  return { ok: true, book: r.data, text: formatBook(r.data) };
}

/** Valeur affichée dans un refus : « vide », ou entre guillemets avec tout caractère hors ASCII imprimable rendu visible. */
export function visibleValue(v: unknown): string {
  if (typeof v !== 'string') return JSON.stringify(v) ?? String(v);
  if (v === '') return 'vide';
  return `"${v.replace(/[^\x21-\x7e]/g, (c) => (c === ' ' ? '␠' : `\\u${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`))}"`;
}

/**
 * Messages de `bookSchema` complétés de la valeur reçue pour les champs en ASCII (identifiants, adresse, chemin d'image),
 * où un `/` final, une espace ou un caractère invisible ne se voient pas dans le champ (correctif ST2 du 20/10). Le message
 * du contrat est gardé tel quel.
 */
export function withReceivedValues(errors: string[], obj: unknown): string[] {
  return errors.map((e) => {
    const m = /^book\.json : (bookId|origin|ogImage|scenes\.\d+) : /.exec(e);
    if (!m) return e;
    let v: unknown = obj;
    for (const k of m[1].split('.')) v = isObj(v) || Array.isArray(v) ? (v as Record<string, unknown>)[k] : undefined;
    return v === undefined ? e : `${e} (valeur reçue : ${visibleValue(v)})`;
  });
}

// ---------------------------------------------------------------------------------------------------------
// Scènes, dossier d'un nouveau livre
// ---------------------------------------------------------------------------------------------------------

/** Motif des identifiants de scène (`SCENE_ID_PATTERN` du Zod), envoyé tel quel à la page. */
export const SCENE_PATTERN_SOURCE = SCENE_ID_PATTERN.source;

/** Scènes ajoutées par rapport à la liste lue sur le disque (gabarit copié pour elles, §4). */
export const addedScenes = (before: readonly string[], after: readonly string[]): string[] => after.filter((s) => !before.includes(s));

/** Nom de dossier d'un nouveau livre : un seul segment, accepté par Windows. `null` si valide, sinon le motif du refus. */
export function folderNameError(name: string): string | null {
  if (!name) return 'nom du dossier vide';
  if (name === '.' || name === '..') return 'nom du dossier : . et .. refusés';
  if (/[<>:"/\\|?*\x00-\x1f]/.test(name)) return 'nom du dossier : caractères < > : " / \\ | ? * refusés';
  if (/[ .]$/.test(name) || /^ /.test(name)) return 'nom du dossier : ni espace au début, ni espace ou point à la fin';
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(name)) return `nom du dossier « ${name} » réservé par Windows`;
  return null;
}

/** Dossiers d'un nouveau livre (§4) ; `blender/` est le dossier réservé des `.blend` (DP-2). */
export const NEW_BOOK_DIRS = ['scenes', 'blender', 'images', 'icons', 'sounds'] as const;

// ---------------------------------------------------------------------------------------------------------
// Blender (§8)
// ---------------------------------------------------------------------------------------------------------

/**
 * Dossier d'installation le plus récent parmi les noms de `C:\Program Files\Blender Foundation\` (`Blender 4.5`,
 * `Blender 4.10`…) : comparaison des numéros de version, pas des textes ; `null` si aucun.
 */
export function pickBlenderDir(names: readonly string[]): string | null {
  const parsed = names
    .map((n) => ({ n, m: /^Blender (\d+(?:\.\d+)*)$/i.exec(n) }))
    .filter((x): x is { n: string; m: RegExpExecArray } => !!x.m)
    .map((x) => ({ n: x.n, v: x.m[1].split('.').map(Number) }));
  parsed.sort((a, b) => {
    for (let i = 0; i < Math.max(a.v.length, b.v.length); i++) {
      const d = (b.v[i] ?? 0) - (a.v[i] ?? 0);
      if (d) return d;
    }
    return 0;
  });
  return parsed[0]?.n ?? null;
}
