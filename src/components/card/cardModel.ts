// Carte de collection d'une scène (CC1, DP-10, DP-11, spec-carte-collection.md §2, §3, §7) : règles pures, sans React ni
// stockage, testées par `npm run test:engine`.
//
// - Lecture tolérante (le lecteur n'embarque pas Zod, Î10a ; le build a validé) : `modules.card` de `scenes/<id>.json` et
//   `cardFields` ou `cardTypes` de `book.json` (types de cartes, CC3, DP-20). Une carte de forme inattendue est ignorée (scène
//   sans carte) plutôt que de bloquer la scène.
// - Type de carte (CC3) : `modules.card.type`, sinon le premier type du livre ; avec `cardFields`, un seul type implicite,
//   `personnage`, sans nom (aucune pastille). Mise en page compacte de 5 à 8 intitulés du type.
// - Carte gagnée = `collected[<scène>]` vrai (première action jouée, Î13) : aucun champ de progression ajouté.
// - Compte du menu : « n cartes sur N », N = scènes du livre qui ont une carte, n = celles-là dont la carte est gagnée.

/** Texte traduit lu par le lecteur. */
export interface CardText {
  fr: string;
  en: string;
  es: string;
}

/** Intitulé commun à toutes les cartes du livre (`book.json.cardFields`), dans l'ordre d'affichage. */
export interface CardFieldLabel {
  id: string;
  label: CardText;
}

/**
 * Type de carte du livre (CC3) : `book.json.cardTypes[]`, ou type implicite `personnage` (sans nom) tiré de `cardFields`.
 * `fields` : intitulés du type, dans l'ordre d'affichage (8 au plus).
 */
export interface CardType {
  id: string;
  name?: CardText;
  fields: CardFieldLabel[];
}

/** Identifiant du type implicite d'un livre à `cardFields` (même valeur que `DEFAULT_CARD_TYPE_ID` du contrat). */
export const DEFAULT_CARD_TYPE = "personnage";
/** Nombre maximal d'intitulés d'un type (contrat : `CARD_FIELDS_MAX`). */
export const CARD_FIELDS_LIMIT = 8;
/** Mise en page compacte à partir de ce nombre d'intitulés du type (contrat : `CARD_COMPACT_FROM`). */
export const CARD_COMPACT_AT = 5;

/** Carte d'une scène prête à afficher (`modules.card` fusionné, chemin de l'illustration résolu). */
export interface ReaderCard {
  /** Type de la carte (`modules.card.type`, CC3) ; absent : premier type du livre. */
  type?: string;
  subtitle?: CardText;
  /** Illustration : `modules.card.image`, sinon `scene.loaderImage`, sinon l'icône du livre. */
  image: string;
  /** Valeur de chaque caractéristique, par `id` d'intitulé. */
  fields: Record<string, CardText>;
  text: CardText;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isText = (v: unknown): v is CardText => isObj(v) && typeof v.fr === "string" && typeof v.en === "string" && typeof v.es === "string";

/** Image de repli de la carte comme du menu de collection : icône du livre, à la racine du dossier construit. */
export const BOOK_ICON = "icon.png";

/** Intitulés d'un type (`cardFields` ou `cardTypes[].fields`, 8 au plus, `id` uniques) ; entrées illisibles ignorées. */
export function parseCardFields(raw: unknown): CardFieldLabel[] {
  if (!Array.isArray(raw)) return [];
  const out: CardFieldLabel[] = [];
  for (const f of raw) {
    if (!isObj(f) || typeof f.id !== "string" || !isText(f.label) || out.some((o) => o.id === f.id)) continue;
    out.push({ id: f.id, label: { fr: f.label.fr, en: f.label.en, es: f.label.es } });
  }
  return out.slice(0, CARD_FIELDS_LIMIT);
}

/**
 * Types de cartes du livre (CC3) : `cardTypes` lisible (2 types au moins, `id` uniques, nom traduit) d'abord ; sinon
 * `cardFields` → un seul type `personnage`, sans nom ; sinon un type `personnage` sans intitulé. Jamais vide.
 */
export function parseCardTypes(rawCardFields: unknown, rawCardTypes: unknown): CardType[] {
  if (Array.isArray(rawCardTypes)) {
    const out: CardType[] = [];
    for (const t of rawCardTypes) {
      if (!isObj(t) || typeof t.id !== "string" || !t.id || !isText(t.name) || out.some((o) => o.id === t.id)) continue;
      out.push({ id: t.id, name: { fr: t.name.fr, en: t.name.en, es: t.name.es }, fields: parseCardFields(t.fields) });
    }
    if (out.length >= 2) return out;
  }
  return [{ id: DEFAULT_CARD_TYPE, fields: parseCardFields(rawCardFields) }];
}

/** Type d'une carte : celui de `type` s'il existe dans le livre, sinon le premier (un type inconnu est signalé par le build). */
export function resolveCardType(types: readonly CardType[], type: string | undefined): CardType {
  return (type !== undefined && types.find((t) => t.id === type)) || types[0] || { id: DEFAULT_CARD_TYPE, fields: [] };
}

/** Le livre déclare des types nommés (`cardTypes`) : la pastille du type est affichée sur la carte. */
export const showCardType = (types: readonly CardType[]) => types.some((t) => !!t.name);

/** Mise en page compacte : le type a 5 intitulés ou plus (nombre d'intitulés du type, pas des valeurs saisies). */
export const isCompactType = (t: CardType) => t.fields.length >= CARD_COMPACT_AT;

/**
 * Carte d'une scène lue dans `scenes/<id>.json` ; `undefined` si la scène n'a pas de carte (ou une carte illisible).
 * `at` résout un chemin d'asset du livre (préfixe `dev-book/` en développement) ; `loaderImage` : chemin brut de la scène.
 */
export function readerCardOf(rawCard: unknown, loaderImage: string | undefined, at: (p: string) => string): ReaderCard | undefined {
  if (!isObj(rawCard) || !isText(rawCard.text)) return undefined;
  const fields: Record<string, CardText> = {};
  if (isObj(rawCard.fields)) for (const [k, v] of Object.entries(rawCard.fields)) if (isText(v)) fields[k] = v;
  const image = typeof rawCard.image === "string" && rawCard.image ? at(rawCard.image) : loaderImage ? at(loaderImage) : BOOK_ICON;
  return {
    ...(typeof rawCard.type === "string" && rawCard.type ? { type: rawCard.type } : {}),
    ...(isText(rawCard.subtitle) ? { subtitle: rawCard.subtitle } : {}),
    image,
    fields,
    text: rawCard.text,
  };
}

/** Collection lue par les règles : `collected` de la progression (`{ [scène]: true }`). */
type Collected = { collected: Record<string, boolean> };

export const hasEarnedCard = (p: Collected, sceneId: string) => p.collected[sceneId] === true;

/**
 * Bandeau « Nouvelle carte ! » (§2) : à montrer quand une action démarre (`start`) dans une scène qui a une carte et dont la
 * carte n'était pas encore gagnée (`before` : progression lue avant d'écrire `collected`). Une seule fois : ensuite,
 * `collected` est vrai ; la nouveauté n'est pas enregistrée, rien n'est rejoué après un rechargement.
 */
export const isNewCard = (before: Collected, sceneId: string, sceneHasCard: boolean) => sceneHasCard && !hasEarnedCard(before, sceneId);

/** Compte du menu : `null` si aucune scène du livre n'a de carte (le compte des découvertes d'Î13 reste affiché). */
export function cardCount(p: Collected, scenes: readonly string[], withCard: (id: string) => boolean): { n: number; total: number } | null {
  const ids = scenes.filter(withCard);
  if (!ids.length) return null;
  return { n: ids.filter((id) => hasEarnedCard(p, id)).length, total: ids.length };
}

/**
 * Ligne de compte par type sous le compte du menu (CC3, §15.5) : seulement avec des types nommés (`cardTypes`) ; types dans
 * l'ordre de déclaration, types sans carte dans le livre omis. `typeOf` : type de la carte d'une scène (`undefined` : premier).
 */
export function cardTypeCounts(
  p: Collected,
  scenes: readonly string[],
  types: readonly CardType[],
  withCard: (id: string) => boolean,
  typeOf: (id: string) => string | undefined,
): { type: CardType; n: number; total: number }[] {
  if (!showCardType(types)) return [];
  const ids = scenes.filter(withCard);
  return types
    .map((type) => {
      const of = ids.filter((id) => resolveCardType(types, typeOf(id)).id === type.id);
      return { type, n: of.filter((id) => hasEarnedCard(p, id)).length, total: of.length };
    })
    .filter((c) => c.total > 0);
}

/** Cartes gagnées, dans l'ordre du livre (« Précédente » et « Suivante » de la carte ouverte depuis le menu). */
export const earnedCards = (p: Collected, scenes: readonly string[], withCard: (id: string) => boolean) =>
  scenes.filter((id) => withCard(id) && hasEarnedCard(p, id));

/** Taille dessinée de la carte (px logiques, 5:7, §3) : mise à l'échelle d'un bloc pour tenir dans l'écran. */
export const CARD_WIDTH = 350;
export const CARD_HEIGHT = 490;
/** Bornes de l'échelle de la carte (§3). */
export const CARD_SCALE_MIN = 0.6;
export const CARD_SCALE_MAX = 1.4;
/** Écart vertical entre la carte, la rangée de boutons et les bords (px) ; marge de côté, en plus des zones sûres (px). */
export const CARD_GAP = 12;
export const CARD_SIDE = 4;

/** Échelle de la carte dans une zone `width` × `height` (px, zones sûres déduites), boutons de hauteur `controls` compris. */
export function cardScale(width: number, height: number, controls: number): number {
  const s = Math.min((width - 2 * CARD_SIDE) / CARD_WIDTH, (height - controls - 3 * CARD_GAP) / CARD_HEIGHT);
  return Math.max(CARD_SCALE_MIN, Math.min(CARD_SCALE_MAX, Number.isFinite(s) ? s : 1));
}
