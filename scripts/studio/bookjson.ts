// scripts/studio/bookjson.ts — `book.json` écrit par le studio (ST2, spec-app-bureau.md §4, DP-3), règles pures testées par
// scripts/studio/test-studio.ts. Aucune lecture de fichier ni processus.
//
// - Contrat : `bookSchema` du Zod du build (importé, aucune règle recopiée ; le motif des identifiants de scène et les
//   langues sont envoyés à la page tels quels).
// - Forme écrite : clés dans l'ordre de `bookSchema` (objets imbriqués compris), indentation 2, UTF-8 sans échappement des
//   accents (`JSON.stringify`), retour à la ligne final, champs facultatifs vides omis.
// - Formulaire : valeurs saisies (textes), composées en objet puis validées par `bookSchema`. Mini-jeu (MJ3, section « Jeu ») :
//   gabarit (`game: { template }`, vide = pas de jeu) et seuil de déblocage (`unlockThreshold`, vide = toutes les scènes) ;
//   jusqu'à MJ3 ils étaient repris tels quels du disque. `cardFields` (intitulés des cartes de collection) : section « Carte
//   de collection » du formulaire depuis CC2 (CC1 le reprenait tel quel).
// - Types de cartes (CC3, DP-20) : le formulaire tient une liste de types (`cardTypes`) ; un livre à `cardFields` y est un
//   seul type implicite `personnage`, sans nom. Forme la plus courte écrite : un type → `cardFields` (nom perdu), deux ou
//   plus → `cardTypes`.
// - Lecture d'un `book.json` illisible ou invalide : ce qui est lisible préremplit le formulaire.
import { z } from 'zod';
import { bookSchema, DEFAULT_CARD_TYPE_ID, formatIssues, LANGUAGES, SCENE_ID_PATTERN, type Book } from '../../src/schema/glbi';

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

/** Intitulé d'une caractéristique des cartes de collection (`book.json.cardFields[]`, CC2). */
export interface CardFieldForm {
  id: string;
  label: Texts;
}

/**
 * Type de carte du formulaire (CC3) : `book.json.cardTypes[]`, ou le type implicite d'un livre à `cardFields`
 * (`personnage`, nom vide).
 */
export interface CardTypeForm {
  id: string;
  name: Texts;
  fields: CardFieldForm[];
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
  /**
   * Types de cartes, dans l'ordre (le premier est le type par défaut) ; `[]` ou un seul type sans intitulé : ni `cardFields`
   * ni `cardTypes` (livre sans caractéristiques) ; un seul type : `cardFields` ; deux ou plus : `cardTypes`.
   */
  cardTypes: CardTypeForm[];
  /** Mini-jeu (MJ3) : gabarit (`""` : pas de jeu, `game` omis). */
  gameTemplate: string;
  /** Seuil de déblocage du mini-jeu, tel que saisi (`""` : omis, toutes les scènes). */
  unlockThreshold: string;
}

/** Champs lisibles d'un `book.json` (pour préremplir le formulaire). */
export interface ReadableBook {
  form: BookForm;
  /** `bookId` lisible sur le disque : celui d'un livre existant, non modifiable. */
  bookIdOnDisk: string | null;
  /**
   * `cardFields` et `cardTypes` présents ensemble (écrits à la main, refusés par `bookSchema`) : le formulaire reprend
   * `cardTypes`, `cardFields` serait perdu au premier enregistrement (prévenir, point de CC3).
   */
  bothCardForms?: boolean;
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
    cardTypes: [],
    gameTemplate: '',
    unlockThreshold: '',
  };
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
/** Seuil lu (nombre ou texte) ramené au texte du champ ; autre valeur : vide. */
const thresholdText = (v: unknown): string => (typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'string' ? v : '');
/** Gabarit lu (`game.template`) ; `game` mal formé : vide. */
const templateOf = (v: unknown): string => (isObj(v) ? str(v.template) : '');
const texts = (v: unknown): Texts => {
  const o = isObj(v) ? v : {};
  return { fr: str(o.fr), en: str(o.en), es: str(o.es) };
};
/** Intitulés lus (lecture tolérante : entrée non objet ignorée, champ mal typé vide ; refus éventuels par `bookSchema`). */
const cardFieldsOf = (v: unknown): CardFieldForm[] =>
  Array.isArray(v) ? v.filter(isObj).map((f) => ({ id: str(f.id), label: texts(f.label) })) : [];
/**
 * Types lus (CC3) : `cardTypes` s'il est une liste, sinon `cardFields` en un seul type `personnage` sans nom, sinon aucun
 * (lecture tolérante ; un `book.json` qui a les deux est refusé par `bookSchema`, le formulaire reprend `cardTypes`).
 */
const cardTypesOf = (rawTypes: unknown, rawFields: unknown): CardTypeForm[] => {
  if (Array.isArray(rawTypes)) return rawTypes.filter(isObj).map((t) => ({ id: str(t.id), name: texts(t.name), fields: cardFieldsOf(t.fields) }));
  if (Array.isArray(rawFields)) return [{ id: DEFAULT_CARD_TYPE_ID, name: { fr: '', en: '', es: '' }, fields: cardFieldsOf(rawFields) }];
  return [];
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
  f.cardTypes = cardTypesOf(raw.cardTypes, raw.cardFields);
  f.gameTemplate = templateOf(raw.game);
  f.unlockThreshold = thresholdText(raw.unlockThreshold);
  const r: ReadableBook = { form: f, bookIdOnDisk: typeof raw.bookId === 'string' && raw.bookId !== '' ? raw.bookId : null };
  if (Array.isArray(raw.cardTypes) && Array.isArray(raw.cardFields)) r.bothCardForms = true;
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
    cardTypes: cardTypesOf(o.cardTypes, o.cardFields),
    gameTemplate: typeof o.gameTemplate === 'string' ? o.gameTemplate : '',
    unlockThreshold: typeof o.unlockThreshold === 'number' ? String(o.unlockThreshold) : str(o.unlockThreshold),
  };
}

/** Objet `book.json` composé du formulaire, avant validation. `languages` : celles du Zod (affichées, non modifiables). */
export function composeBook(form: BookForm): Obj {
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
  // Cartes (CC2, CC3) : forme la plus courte. Un type : `cardFields` (aucun intitulé = omis, le contrat en exige au moins
  // un s'il est présent) ; deux types ou plus : `cardTypes` (le nom du type unique n'est pas écrit).
  const fieldsOf = (t: CardTypeForm) => t.fields.map((f) => ({ id: f.id.trim(), label: { ...f.label } }));
  if (form.cardTypes.length === 1 && form.cardTypes[0].fields.length) book.cardFields = fieldsOf(form.cardTypes[0]);
  if (form.cardTypes.length >= 2) book.cardTypes = form.cardTypes.map((t) => ({ id: t.id.trim(), name: { ...t.name }, fields: fieldsOf(t) }));
  // Mini-jeu (MJ3) : seuil écrit en nombre s'il est entier, sinon tel quel (refus lisible de `bookSchema`) ; gabarit choisi.
  const th = (form.unlockThreshold ?? '').trim();
  if (th) book.unlockThreshold = /^\d+$/.test(th) ? Number(th) : th;
  if ((form.gameTemplate ?? '').trim()) book.game = { template: form.gameTemplate.trim() };
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

/**
 * Scènes dont la carte donne une valeur à l'intitulé `id` (`modules.card.fields.<id>` de leur `edit.json`, lu tel quel ;
 * fichier illisible ignoré) : retirer cet intitulé de `book.json` en fait des erreurs de `book:check` (§6), le studio
 * demande confirmation (spec-carte-collection.md §9).
 */
export function scenesUsingCardField(edits: Record<string, unknown>, id: string, type?: { id: string; tete: boolean }): string[] {
  return Object.entries(edits)
    .filter(([, e]) => {
      const card = cardOfEdit(e);
      return !!card && (!type || ofType(card, type)) && isObj(card.fields) && id in card.fields;
    })
    .map(([scene]) => scene);
}

const cardOfEdit = (e: unknown): Obj | null => (isObj(e) && isObj(e.modules) && isObj(e.modules.card) ? e.modules.card : null);
/** Carte du type `type.id` : type explicite égal, ou sans `type` si ce type est en tête (type par défaut). */
const ofType = (card: Obj, type: { id: string; tete: boolean }) =>
  typeof card.type === 'string' && card.type ? card.type === type.id : type.tete;

/**
 * Usage d'un type de carte (action `usageType`, CC3, lecture seule des `edit.json`) : `explicit` : scènes dont la carte porte
 * `type: <id>` ; `implicit` : scènes dont la carte n'a pas de `type` (du type de tête) ; `scenes` : celles du type (explicites,
 * et implicites si `tete`) ; `cards` : type explicite de chaque scène qui a une carte (`null` : aucun), pour les autres
 * confirmations de la page (changement du type de tête, retour à un seul type).
 */
export function cardTypeUsage(
  edits: Record<string, unknown>,
  type: { id: string; tete: boolean },
): { scenes: string[]; explicit: string[]; implicit: string[]; cards: Record<string, string | null> } {
  const cards: Record<string, string | null> = {};
  for (const [scene, e] of Object.entries(edits)) {
    const card = cardOfEdit(e);
    if (card) cards[scene] = typeof card.type === 'string' && card.type ? card.type : null;
  }
  const explicit = Object.keys(cards).filter((s) => cards[s] === type.id);
  const implicit = Object.keys(cards).filter((s) => cards[s] === null);
  return { scenes: Object.keys(cards).filter((s) => cards[s] === type.id || (type.tete && cards[s] === null)), explicit, implicit, cards };
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
