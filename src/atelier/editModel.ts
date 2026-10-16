// Formulaire de la couche éditoriale (A3) : état de saisie de la page, distinct de `scenes/<id>.edit.json`.
// Décision du 15/10 (option B) : seuls les champs complets sont enregistrés et envoyés à l'aperçu ; un champ commencé mais
// incomplet (traduction manquante, quiz ou crédit inachevé) reste dans la page, est signalé en tête du Rapport et laisse
// l'indicateur « modifié, non enregistré » allumé. Le fichier écrit est donc toujours valide pour `editLayerSchema`.
import { EDIT_LAYER_VERSION, LANGUAGES } from "@/schema/glbi";
import { cameraFormFromRaw, cameraLayerOf, type CameraForm } from "./cameraForm";

export type Lang = (typeof LANGUAGES)[number];
export type L3 = Record<Lang, string>;

export interface ActionForm {
  label: L3;
  icon: string;
  sound: string;
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

export interface EditForm {
  name: L3;
  loaderImage: string;
  /** Cadrage de la caméra (onglet Caméra, A4) : conservé tel quel tant que l'onglet n'y touche pas. */
  camera: CameraForm;
  /** Entrées par identifiant d'action, dans l'ordre du fichier (actions du GLB et orphelines). */
  actions: [string, ActionForm][];
  ambientSound: string;
  quiz: QuizForm;
  credits: CreditForm[];
}

/** Onglets d'édition (et Rapport, Diagnostic). */
export type TabId = "scene" | "camera" | "actions" | "ambiance" | "quiz" | "credits" | "rapport" | "diagnostic";

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
export const emptyAction = (): ActionForm => ({ label: emptyL3(), icon: "", sound: "" });
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
      return [id, { label: l3Of(o.label), icon: str(o.icon), sound: str(o.sound) }];
    }),
    ambientSound: isObj(modules.audio) ? str(modules.audio.ambientSound) : "",
    quiz: quiz
      ? { question: l3Of(quiz.question), choices, correct: correctIdx >= 0 && correctIdx < 3 ? correctIdx : null, explanation: l3Of(quiz.explanation) }
      : emptyQuiz(),
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

/** Champs vides du formulaire : aucune donnée à garder. */
const creditEmpty = (c: CreditForm) => !c.title.trim() && !c.author.trim() && !c.license.trim() && !c.source.trim();

/**
 * Couche éditoriale à enregistrer (champs complets seulement) et liste des champs commencés mais incomplets. Les entrées
 * d'actions orphelines (absentes du GLB) sont gardées telles quelles, à rattacher ou supprimer dans l'onglet Actions.
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
      credits: { assets: credits },
    },
  };
  return { layer, incomplete };
}

/** Assets utilisés par le formulaire (dans l'ordre : image de chargement, icônes, sons des actions, ambiance). */
export function usedAssets(form: EditForm, glbIds: readonly string[]): { asset: string; kind: "image" | "son" }[] {
  const out: { asset: string; kind: "image" | "son" }[] = [];
  const add = (asset: string, kind: "image" | "son") => {
    if (asset && !out.some((o) => o.asset === asset)) out.push({ asset, kind });
  };
  add(form.loaderImage, "image");
  const inGlb = form.actions.filter(([id]) => glbIds.includes(id));
  for (const [, a] of inGlb) add(a.icon, "image");
  for (const [, a] of inGlb) add(a.sound, "son");
  add(form.ambientSound, "son");
  return out;
}
