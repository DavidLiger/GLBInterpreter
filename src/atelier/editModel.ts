// Formulaire de la couche éditoriale (A3) : état de saisie de la page, distinct de `scenes/<id>.edit.json`.
// Décision du 15/10 (option B) : seuls les champs complets sont enregistrés et envoyés à l'aperçu ; un champ commencé mais
// incomplet (traduction manquante, quiz ou crédit inachevé) reste dans la page, est signalé en tête du Rapport et laisse
// l'indicateur « modifié, non enregistré » allumé. Le fichier écrit est donc toujours valide pour `editLayerSchema`.
import { CARD_LIMITS, cardFieldIdSchema, EDIT_LAYER_VERSION, imagePathSchema, LANGUAGES, type QuizModule } from "@/schema/glbi";
import type { ReaderCard } from "@/components/card/cardModel";
import { cameraFormFromRaw, cameraLayerOf, type CameraForm } from "./cameraForm";

export type Lang = (typeof LANGUAGES)[number];
export type L3 = Record<Lang, string>;

/** Son d'un événement de l'action (AC3, DP-6) ; l'instant appartient au GLB. */
export interface EventForm {
  sound: string;
}

export interface ActionForm {
  label: L3;
  icon: string;
  sound: string;
  /**
   * Entrées d'événements par identifiant, dans l'ordre du fichier (événements du GLB et orphelins) : conservées telles
   * quelles à l'enregistrement (AC3 ; avant AC3, l'atelier les effaçait).
   */
  events: [string, EventForm][];
}

export interface CreditForm {
  asset: string;
  title: string;
  author: string;
  license: string;
  source: string;
}

export interface QuizForm {
  question: L3;
  choices: [L3, L3, L3];
  /** Index de la bonne réponse, `null` si non choisie. */
  correct: number | null;
  explanation: L3;
}

/**
 * Carte de collection (`modules.card`, onglet Carte, CC2, spec-carte-collection.md §8). Règle d'A3 : seul un champ complet
 * (3 langues) et valide (longueur bornée, `CARD_LIMITS`) est écrit ; un champ incomplet ou trop long reste dans la page et
 * figure dans « Saisie incomplète », sans bloquer le reste de la scène.
 */
export interface CardForm {
  /**
   * Type de la carte (`modules.card.type`, CC3) tel que lu dans le fichier ou choisi dans le menu Type ; `""` : pas de
   * `type` dans le fichier (premier type du livre). Gardé tel quel, même inconnu du livre, jusqu'à un choix dans le menu.
   * Décision de David du 28/10 (point 7 de CC3, option 1) : avec `book.json.cardTypes`, le premier type est écrit
   * explicitement à l'enregistrement (`withCardType`), jamais à la seule ouverture (l'indicateur « modifié » n'en tient pas
   * compte) ; avec `cardFields`, jamais ajouté.
   */
  type: string;
  subtitle: L3;
  /** Illustration (`images/…`) ; vide : image de chargement, sinon icône du livre. */
  image: string;
  /**
   * Valeur de chaque caractéristique, par `id` d'intitulé, dans l'ordre du fichier ; une valeur saisie pour un intitulé
   * absent du fichier est ajoutée à la fin. Les valeurs d'un intitulé absent de `book.json.cardFields` (orphelines) sont
   * gardées telles quelles (erreur du build, à retirer dans l'onglet).
   */
  fields: [string, L3][];
  text: L3;
}

export interface EditForm {
  name: L3;
  loaderImage: string;
  /** Cadrage de la caméra (onglet Caméra, A4) : conservé tel quel tant que l'onglet n'y touche pas. */
  camera: CameraForm;
  /** Entrées par identifiant d'action, dans l'ordre du fichier (actions du GLB et orphelines). */
  actions: [string, ActionForm][];
  ambientSound: string;
  quiz: QuizForm;
  /** Carte de collection (onglet Carte, CC2 ; avant CC2, valeur du fichier recopiée telle quelle). */
  card: CardForm;
  credits: CreditForm[];
}

/** Onglets d'édition (et Rapport, Diagnostic). */
export type TabId = "scene" | "camera" | "actions" | "ambiance" | "quiz" | "card" | "credits" | "rapport" | "diagnostic";

/** Champ du formulaire : onglet et identifiant (`data-field`) pour les liens du Rapport. */
export interface FieldRef {
  tab: TabId;
  field: string;
}

export interface Incomplete extends FieldRef {
  message: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");

export const emptyL3 = (): L3 => ({ fr: "", en: "", es: "" });
const l3Of = (v: unknown): L3 => (isObj(v) ? { fr: str(v.fr), en: str(v.en), es: str(v.es) } : emptyL3());
export const emptyAction = (): ActionForm => ({ label: emptyL3(), icon: "", sound: "", events: [] });
/** Entrées d'événements lues dans `actions.<id>.events` (objet indexé par identifiant). */
const eventsOf = (v: unknown): [string, EventForm][] =>
  isObj(v) ? Object.entries(v).map(([id, e]) => [id, { sound: isObj(e) ? str(e.sound) : "" }]) : [];
export const emptyCard = (): CardForm => ({ type: "", subtitle: emptyL3(), image: "", fields: [], text: emptyL3() });
/** Carte lue dans `modules.card` (lecture tolérante). */
function cardOf(v: unknown): CardForm {
  if (!isObj(v)) return emptyCard();
  return {
    type: str(v.type),
    subtitle: l3Of(v.subtitle),
    image: str(v.image),
    fields: isObj(v.fields) ? Object.entries(v.fields).map(([id, x]) => [id, l3Of(x)]) : [],
    text: l3Of(v.text),
  };
}
export const emptyQuiz = (): QuizForm => ({ question: emptyL3(), choices: [emptyL3(), emptyL3(), emptyL3()], correct: null, explanation: emptyL3() });

/** Formulaire depuis le fichier lu (lecture tolérante : un fichier refusé par son schéma est repris champ par champ). */
export function formFromEdit(raw: unknown): EditForm {
  const e = isObj(raw) ? raw : {};
  const scene = isObj(e.scene) ? e.scene : {};
  const modules = isObj(e.modules) ? e.modules : {};
  const anims = isObj(modules.animations) && isObj(modules.animations.actions) ? modules.animations.actions : {};
  const quiz = isObj(modules.quiz) ? modules.quiz : null;
  const rawChoices = quiz && Array.isArray(quiz.choices) ? quiz.choices : [];
  const choices = [0, 1, 2].map((i) => l3Of(isObj(rawChoices[i]) ? rawChoices[i].text : undefined)) as [L3, L3, L3];
  const correctIdx = rawChoices.findIndex((c) => isObj(c) && c.correct === true);
  const credits = isObj(modules.credits) && Array.isArray(modules.credits.assets) ? modules.credits.assets : [];
  return {
    name: l3Of(scene.name),
    loaderImage: str(scene.loaderImage),
    camera: cameraFormFromRaw(modules.camera),
    actions: Object.entries(anims).map(([id, a]) => {
      const o = isObj(a) ? a : {};
      return [id, { label: l3Of(o.label), icon: str(o.icon), sound: str(o.sound), events: eventsOf(o.events) }];
    }),
    ambientSound: isObj(modules.audio) ? str(modules.audio.ambientSound) : "",
    quiz: quiz
      ? { question: l3Of(quiz.question), choices, correct: correctIdx >= 0 && correctIdx < 3 ? correctIdx : null, explanation: l3Of(quiz.explanation) }
      : emptyQuiz(),
    card: cardOf(modules.card),
    credits: credits.filter(isObj).map((c) => ({
      asset: str(c.asset),
      title: str(c.title),
      author: str(c.author),
      license: str(c.license),
      source: str(c.source),
    })),
  };
}

const LANG_NAMES: Record<Lang, string> = { fr: "FR", en: "EN", es: "ES" };

/** Texte traduit : `complete` (3 langues), `empty` (aucune) ou langues manquantes. */
function l3State(t: L3): { state: "complete" | "empty" | "partial"; missing: string[] } {
  const missing = LANGUAGES.filter((l) => !t[l].trim());
  if (!missing.length) return { state: "complete", missing };
  return { state: missing.length === LANGUAGES.length ? "empty" : "partial", missing: missing.map((l) => LANG_NAMES[l]) };
}
const trimmed = (t: L3): L3 => ({ fr: t.fr.trim(), en: t.en.trim(), es: t.es.trim() });

/** Longueur comptée comme le contrat (`boundedText` : texte rogné, caractères UTF-16). */
export const textLength = (s: string) => s.trim().length;
/** Langues dont le texte dépasse `max` caractères, avec leur longueur (« ES 263 »). */
export function tooLong(t: L3, max: number): string[] {
  return LANGUAGES.filter((l) => textLength(t[l]) > max).map((l) => `${LANG_NAMES[l]} ${textLength(t[l])}`);
}
/** Une L3 a été commencée (au moins une langue remplie). */
export const l3Started = (t: L3) => LANGUAGES.some((l) => t[l].trim());
/** Carte commencée : un texte ou l'illustration renseigné (le type seul ne crée pas de carte, CC3). */
export const cardStarted = (c: CardForm) => !!c.image || l3Started(c.subtitle) || l3Started(c.text) || c.fields.some(([, v]) => l3Started(v));

/**
 * Aperçu du quiz (A5, décision de David du 17/10, option A) : le quiz est montré dès qu'il est complet dans la langue
 * d'aperçu (question, 3 réponses, bonne réponse, explication), même si les autres langues manquent ; il n'est enregistré
 * que complet dans les 3 langues (A3). `missingHere` : ce qui manque dans la langue d'aperçu (pas d'aperçu) ;
 * `otherLangs` : langues encore incomplètes (aperçu affiché, quiz non enregistré). `quiz` : `null` si rien n'est saisi.
 */
export function quizPreviewOf(q: QuizForm, lang: Lang): { quiz: QuizModule | null; started: boolean; missingHere: string[]; otherLangs: string[] } {
  const texts = [q.question, ...q.choices, q.explanation];
  const started = texts.some((t) => LANGUAGES.some((l) => t[l].trim())) || q.correct !== null;
  const missingHere: string[] = [];
  if (!q.question[lang].trim()) missingHere.push("question");
  q.choices.forEach((c, i) => !c[lang].trim() && missingHere.push(`réponse ${i + 1}`));
  if (q.correct === null) missingHere.push("bonne réponse");
  if (!q.explanation[lang].trim()) missingHere.push("explication");
  const otherLangs = LANGUAGES.filter((l) => l !== lang && texts.some((t) => !t[l].trim())).map((l) => LANG_NAMES[l]);
  const quiz: QuizModule | null =
    started && !missingHere.length
      ? {
          question: trimmed(q.question),
          choices: q.choices.map((c, i) => ({ text: trimmed(c), correct: i === q.correct })),
          explanation: trimmed(q.explanation),
        }
      : null;
  return { quiz, started, missingHere, otherLangs };
}

/** Champs vides du formulaire : aucune donnée à garder. */
const creditEmpty = (c: CreditForm) => !c.title.trim() && !c.author.trim() && !c.license.trim() && !c.source.trim();

/**
 * Couche éditoriale à enregistrer (champs complets seulement) et liste des champs commencés mais incomplets. Les entrées
 * d'actions orphelines (absentes du GLB) sont gardées telles quelles, à rattacher ou supprimer dans l'onglet Actions ; de
 * même pour les événements orphelins (AC3). Un événement sans son est omis (champ vide, règle d'A3).
 */
export function layerFromForm(form: EditForm): { layer: Obj; incomplete: Incomplete[] } {
  const incomplete: Incomplete[] = [];
  const text = (t: L3, ref: FieldRef, what: string): L3 | undefined => {
    const s = l3State(t);
    if (s.state === "complete") return trimmed(t);
    if (s.state === "partial") incomplete.push({ ...ref, message: `${what} : traduction(s) manquante(s) : ${s.missing.join(", ")}` });
    return undefined;
  };

  const actions: Obj = {};
  for (const [id, a] of form.actions) {
    actions[id] = {
      label: text(a.label, { tab: "actions", field: `action.${id}.label` }, `libellé de l'action « ${id} »`),
      icon: a.icon || undefined,
      sound: a.sound || undefined,
      events: Object.fromEntries(a.events.map(([ev, e]) => [ev, { sound: e.sound || undefined }])),
    };
  }

  // Quiz : enregistré seulement complet (3 réponses traduites, une bonne réponse, question et explication traduites).
  let quiz: Obj | undefined;
  const q = form.quiz;
  const qTexts = [q.question, ...q.choices, q.explanation].map(l3State);
  if (qTexts.some((s) => s.state !== "empty") || q.correct !== null) {
    const parts: string[] = [];
    if (qTexts[0].state !== "complete") parts.push("question");
    q.choices.forEach((_, i) => qTexts[i + 1].state !== "complete" && parts.push(`réponse ${i + 1}`));
    if (q.correct === null) parts.push("bonne réponse");
    if (qTexts[4].state !== "complete") parts.push("explication");
    if (parts.length) {
      const first = parts[0];
      const field = first === "question" ? "quiz.question" : first === "explication" ? "quiz.explanation" : first === "bonne réponse" ? "quiz.correct" : `quiz.choice.${Number(first.slice(-1)) - 1}`;
      incomplete.push({ tab: "quiz", field, message: `quiz incomplet, non enregistré : ${parts.join(", ")} à compléter (3 langues)` });
    } else {
      quiz = {
        question: trimmed(q.question),
        choices: q.choices.map((c, i) => ({ text: trimmed(c), correct: i === q.correct })),
        explanation: trimmed(q.explanation),
      };
    }
  }

  const credits: Obj[] = [];
  for (const c of form.credits) {
    if (!c.asset || creditEmpty(c)) continue;
    const missing = [!c.title.trim() && "titre", !c.author.trim() && "auteur", !c.license.trim() && "licence"].filter(Boolean);
    if (missing.length) {
      incomplete.push({ tab: "credits", field: `credit.${c.asset}`, message: `crédit de « ${c.asset} » incomplet, non enregistré : ${missing.join(", ")}` });
      continue;
    }
    credits.push({ asset: c.asset, title: c.title.trim(), author: c.author.trim(), license: c.license.trim(), source: c.source.trim() || undefined });
  }

  // Carte de collection (CC2) : chaque texte n'est écrit que complet et assez court ; illustration et identifiants
  // d'intitulés refusés par le contrat ne sont pas écrits (saisie à la main) : le reste de la scène s'enregistre.
  const c = form.card;
  const bounded = (t: L3, max: number, ref: FieldRef, what: string): L3 | undefined => {
    const long = tooLong(t, max);
    const v = text(t, ref, what);
    if (long.length) {
      incomplete.push({ ...ref, message: `${what} trop long, non enregistré : ${long.join(", ")} caractères (${max} au plus)` });
      return undefined;
    }
    return v;
  };
  const cardFields: Obj = {};
  for (const [id, v] of c.fields) {
    if (!cardFieldIdSchema.safeParse(id).success) {
      if (l3Started(v)) incomplete.push({ tab: "card", field: `card.field.${id}`, message: `carte : identifiant d'intitulé « ${id} » refusé (lettres, chiffres, _ et -), non enregistré` });
      continue;
    }
    cardFields[id] = bounded(v, CARD_LIMITS.fieldValue, { tab: "card", field: `card.field.${id}` }, `carte : valeur « ${id} »`);
  }
  let cardImage: string | undefined = c.image || undefined;
  if (cardImage && !imagePathSchema.safeParse(cardImage).success) {
    incomplete.push({ tab: "card", field: "card.image", message: `carte : illustration « ${cardImage} » refusée par le contrat, non enregistrée` });
    cardImage = undefined;
  }
  const cardBody = {
    subtitle: bounded(c.subtitle, CARD_LIMITS.subtitle, { tab: "card", field: "card.subtitle" }, "carte : sous-titre"),
    image: cardImage,
    fields: cardFields,
    text: bounded(c.text, CARD_LIMITS.text, { tab: "card", field: "card.text" }, "carte : paragraphe"),
  };
  // Type (CC3) : en tête, tel quel (même inconnu du livre), seulement si quelque chose de la carte est écrit (un type seul
  // ne crée pas de carte).
  const card = { type: c.type && cardLayerStarted(cardBody) ? c.type : undefined, ...cardBody };

  const cam = cameraLayerOf(form.camera);
  for (const i of cam.issues) incomplete.push({ tab: "camera", field: `camera.${i.field}`, message: i.message });

  const layer: Obj = {
    version: EDIT_LAYER_VERSION,
    scene: {
      name: text(form.name, { tab: "scene", field: "scene.name" }, "nom de la scène"),
      loaderImage: form.loaderImage || undefined,
    },
    modules: {
      camera: cam.camera,
      animations: { actions },
      audio: { ambientSound: form.ambientSound || undefined },
      quiz,
      card,
      credits: { assets: credits },
    },
  };
  return { layer, incomplete };
}

/** Carte de la couche à écrire : un champ autre que `type` y est écrit (texte complet, illustration, valeur). */
function cardLayerStarted(card: Obj): boolean {
  return Object.entries(card).some(([k, v]) => k !== "type" && v !== undefined && !(isObj(v) && !Object.values(v).some((x) => x !== undefined)));
}

/**
 * Couche à écrire à l'enregistrement (CC3, décision de David du 28/10, option 1) : avec `book.json.cardTypes`
 * (`defaultType` = premier type du livre), une carte commencée sans `type` reçoit ce type en tête, explicitement ; avec
 * `cardFields` (`defaultType` absent), rien n'est ajouté. L'indicateur « modifié » compare la couche sans cet ajout : une
 * scène ouverte puis laissée telle quelle n'est jamais réécrite. `type` : type ajouté (à reporter dans le formulaire).
 */
export function withCardType(layer: Obj, defaultType: string | undefined): { layer: Obj; type: string | null } {
  const modules = isObj(layer.modules) ? layer.modules : null;
  const card = modules && isObj(modules.card) ? modules.card : null;
  if (!defaultType || !card || card.type) return { layer, type: null };
  if (!cardLayerStarted(card)) return { layer, type: null };
  return { layer: { ...layer, modules: { ...modules, card: { ...card, type: defaultType } } }, type: defaultType };
}

/**
 * Assets utilisés par le formulaire (dans l'ordre : image de chargement, icônes, illustration de la carte, sons des
 * actions, sons des événements, ambiance). Comme au build (objet fusionné) : actions du GLB seulement, et pour les sons d'événement (AC3, V-10),
 * événements du GLB seulement (`glbEvents` : événements de chaque action dans l'ordre du GLB).
 */
export function usedAssets(form: EditForm, glbIds: readonly string[], glbEvents: Readonly<Record<string, readonly string[]>> = {}): { asset: string; kind: "image" | "son" }[] {
  const out: { asset: string; kind: "image" | "son" }[] = [];
  const add = (asset: string, kind: "image" | "son") => {
    if (asset && !out.some((o) => o.asset === asset)) out.push({ asset, kind });
  };
  add(form.loaderImage, "image");
  const inGlb = form.actions.filter(([id]) => glbIds.includes(id));
  for (const [, a] of inGlb) add(a.icon, "image");
  // Illustration de la carte de collection (CC1), comme au build : image utilisée, crédit facultatif.
  add(form.card.image, "image");
  for (const [, a] of inGlb) add(a.sound, "son");
  for (const [id, a] of inGlb) for (const ev of glbEvents[id] ?? []) add(a.events.find(([k]) => k === ev)?.[1].sound ?? "", "son");
  add(form.ambientSound, "son");
  return out;
}

/**
 * Aperçu de la carte (CC2, règle d'A5) : montrée dès que le paragraphe est rempli dans la langue d'aperçu ; sous-titre et
 * valeurs remplis dans cette langue y figurent (« — » pour une valeur vide, comme dans le livre). `otherLangs` : langues
 * où un texte commencé manque (non enregistré tant qu'il n'est pas traduit) ; `card` : `null` sans paragraphe ici.
 * `image` : illustration résolue (carte, sinon image de chargement, sinon icône du livre), comme le lecteur.
 */
export function cardPreviewOf(c: CardForm, lang: Lang, loaderImage: string): { card: ReaderCard | null; started: boolean; otherLangs: string[] } {
  const started = cardStarted(c);
  const texts = [c.subtitle, c.text, ...c.fields.map(([, v]) => v)].filter(l3Started);
  const otherLangs = LANGUAGES.filter((l) => l !== lang && texts.some((t) => !t[l].trim())).map((l) => LANG_NAMES[l]);
  if (!started || !c.text[lang].trim()) return { card: null, started, otherLangs };
  const fields: ReaderCard["fields"] = {};
  for (const [id, v] of c.fields) if (v[lang].trim()) fields[id] = trimmed(v);
  return {
    card: {
      ...(c.type ? { type: c.type } : {}),
      ...(c.subtitle[lang].trim() ? { subtitle: trimmed(c.subtitle) } : {}),
      image: c.image || loaderImage || "icon.png",
      fields,
      text: trimmed(c.text),
    },
    started,
    otherLangs,
  };
}
