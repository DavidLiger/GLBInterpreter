// Formulaire de la couche éditoriale du jeu (MJ3, spec-mini-jeu.md §5, §6, §9) : état de saisie de l'entrée « Jeu » de
// l'atelier, distinct de `game/game.edit.json`. Même règle que les scènes (A3, décision du 15/10, option B) : seuls les champs
// complets et valides sont enregistrés et envoyés à l'aperçu ; un réglage hors des bornes du contrat (§6), un texte traduit
// incomplet ou un crédit inachevé reste dans la page et figure dans « Saisie incomplète ». Le fichier écrit est donc toujours
// valide pour `gameEditSchema`. Fonctions pures, testées par `npm run test:engine`.
import { audioPathSchema, GAME_EDIT_VERSION, GAME_LIMITS, LANGUAGES, type GameConfig } from "@/schema/glbi";
import { parseReaderGame, type ReaderGame } from "@/components/game/gameSource";
import type { StorageLike } from "@/components/book/progress";
import { emptyL3, type CreditForm, type FieldRef, type Incomplete, type L3 } from "./editModel";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const numStr = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const l3Of = (v: unknown): L3 => (isObj(v) ? { fr: str(v.fr), en: str(v.en), es: str(v.es) } : emptyL3());

/** Sons du gabarit « poursuite » (`sounds` de la couche éditoriale), dans l'ordre du contrat. */
export const GAME_SOUND_KEYS = ["capture", "jump", "music", "end"] as const;
export type GameSoundKey = (typeof GAME_SOUND_KEYS)[number];
export const GAME_SOUND_LABELS: Record<GameSoundKey, string> = {
  capture: "Capture d'une proie",
  jump: "Bond",
  music: "Musique (en boucle pendant la partie)",
  end: "Fin de partie",
};

/** Réglages numériques du gabarit (§6) : bornes du Zod, entier ou non, libellé. */
export const GAME_RULE_FIELDS = [
  { key: "duration", label: "Durée d'une partie (s)", limits: GAME_LIMITS.duration, int: true },
  { key: "playerSpeed", label: "Vitesse du joueur, en course (m/s)", limits: GAME_LIMITS.speed, int: false },
  { key: "preySpeed", label: "Vitesse de fuite des proies (m/s)", limits: GAME_LIMITS.speed, int: false },
  { key: "detectionRadius", label: "Rayon de détection (m)", limits: GAME_LIMITS.detectionRadius, int: false },
  { key: "points", label: "Points par capture", limits: GAME_LIMITS.points, int: true },
] as const;
export type GameRuleKey = (typeof GAME_RULE_FIELDS)[number]["key"];

export interface GameForm {
  /** Valeurs saisies (texte) ; `""` : non écrit, valeur par défaut du gabarit. */
  rules: Record<GameRuleKey, string> & {
    /** `""` : non écrit (oui par défaut). */
    respawn: "" | "oui" | "non";
    /** Sortes de proies : entité et nombre en même temps (texte), dans l'ordre du fichier ; `[]` : non écrit. */
    preys: [string, string][];
  };
  camera: { distance: string };
  texts: { title: L3; instructions: L3; end: L3 };
  sounds: Record<GameSoundKey, string>;
  credits: CreditForm[];
}

export function emptyGameForm(): GameForm {
  return {
    rules: { duration: "", playerSpeed: "", preySpeed: "", detectionRadius: "", points: "", respawn: "", preys: [] },
    camera: { distance: "" },
    texts: { title: emptyL3(), instructions: emptyL3(), end: emptyL3() },
    sounds: { capture: "", jump: "", music: "", end: "" },
    credits: [],
  };
}

/** Formulaire prérempli depuis `game/game.edit.json` lu (même refusé par son schéma : ce qui est lisible). */
export function gameFormFromEdit(raw: unknown): GameForm {
  const f = emptyGameForm();
  if (!isObj(raw)) return f;
  const r = isObj(raw.rules) ? raw.rules : {};
  for (const { key } of GAME_RULE_FIELDS) f.rules[key] = numStr(r[key]);
  f.rules.respawn = r.respawn === true ? "oui" : r.respawn === false ? "non" : "";
  f.rules.preys = Array.isArray(r.preys) ? r.preys.filter(isObj).map((p) => [str(p.entity), numStr(p.count)]) : [];
  f.camera.distance = isObj(raw.camera) ? numStr(raw.camera.distance) : "";
  const t = isObj(raw.texts) ? raw.texts : {};
  f.texts = { title: l3Of(t.title), instructions: l3Of(t.instructions), end: l3Of(t.end) };
  const s = isObj(raw.sounds) ? raw.sounds : {};
  for (const k of GAME_SOUND_KEYS) f.sounds[k] = str(s[k]);
  const c = isObj(raw.credits) && Array.isArray(raw.credits.assets) ? raw.credits.assets : [];
  f.credits = c.filter(isObj).map((x) => ({ asset: str(x.asset), title: str(x.title), author: str(x.author), license: str(x.license), source: str(x.source) }));
  return f;
}

const LANG_NAMES = { fr: "FR", en: "EN", es: "ES" } as const;

/**
 * Couche éditoriale du jeu à enregistrer (champs complets et valides seulement) et champs commencés mais refusés. Un nombre
 * se saisit avec un point ou une virgule ; hors des bornes du contrat, il n'est pas écrit (valeur par défaut du gabarit).
 */
export function gameLayerFromForm(form: GameForm): { layer: Obj; incomplete: Incomplete[] } {
  const incomplete: Incomplete[] = [];
  const num = (raw: string, what: string, [lo, hi]: readonly [number, number], int: boolean, ref: FieldRef): number | undefined => {
    const t = raw.trim().replace(",", ".");
    if (!t) return undefined;
    const n = Number(t);
    if (!Number.isFinite(n) || (int && !Number.isInteger(n)) || n < lo || n > hi) {
      incomplete.push({ ...ref, message: `${what} : ${int ? "nombre entier " : ""}de ${lo} à ${hi} attendu (saisi : ${raw.trim()}), non enregistré` });
      return undefined;
    }
    return n;
  };
  const text = (t: L3, ref: FieldRef, what: string): L3 | undefined => {
    const missing = LANGUAGES.filter((l) => !t[l].trim());
    if (!missing.length) return { fr: t.fr.trim(), en: t.en.trim(), es: t.es.trim() };
    if (missing.length < LANGUAGES.length) incomplete.push({ ...ref, message: `${what} : traduction(s) manquante(s) : ${missing.map((l) => LANG_NAMES[l]).join(", ")}` });
    return undefined;
  };

  const rules: Obj = {};
  for (const f of GAME_RULE_FIELDS) rules[f.key] = num(form.rules[f.key], f.label, f.limits, f.int, { tab: "regles", field: `rules.${f.key}` });
  if (form.rules.respawn) rules.respawn = form.rules.respawn === "oui";
  // Proies : lignes complètes et valides ; somme ≤ 12 et une ligne par entité (contrat), sinon la liste n'est pas écrite.
  const ref: FieldRef = { tab: "regles", field: "rules.preys" };
  const preys: { entity: string; count: number }[] = [];
  let preysOk = true;
  form.rules.preys.forEach(([entity, count], i) => {
    if (!entity.trim() && !count.trim()) return;
    if (!entity.trim()) {
      incomplete.push({ ...ref, message: `proies, ligne ${i + 1} : entité à choisir, non enregistrée` });
      preysOk = false;
      return;
    }
    const n = num(count, `proies « ${entity} » en même temps`, GAME_LIMITS.preys, true, ref);
    if (n === undefined) {
      if (!count.trim()) incomplete.push({ ...ref, message: `proies « ${entity} » : nombre à saisir, non enregistré` });
      preysOk = false;
      return;
    }
    preys.push({ entity: entity.trim(), count: n });
  });
  const total = preys.reduce((s, p) => s + p.count, 0);
  const dup = preys.find((p, i) => preys.findIndex((q) => q.entity === p.entity) !== i);
  if (dup) incomplete.push({ ...ref, message: `proies : entité « ${dup.entity} » en double, liste non enregistrée` });
  if (total > GAME_LIMITS.preys[1]) incomplete.push({ ...ref, message: `proies : ${total} en même temps (${GAME_LIMITS.preys[1]} au plus), liste non enregistrée` });
  if (preysOk && !dup && total <= GAME_LIMITS.preys[1] && preys.length) rules.preys = preys;

  const sounds: Obj = {};
  for (const k of GAME_SOUND_KEYS) {
    const v = form.sounds[k];
    if (!v) continue;
    if (audioPathSchema.safeParse(v).success) sounds[k] = v;
    else incomplete.push({ tab: "sons", field: `sounds.${k}`, message: `son « ${v} » refusé par le contrat (nom ou extension), non enregistré` });
  }

  const credits: Obj[] = [];
  for (const c of form.credits) {
    if (!c.asset || (!c.title.trim() && !c.author.trim() && !c.license.trim() && !c.source.trim())) continue;
    const missing = [!c.title.trim() && "titre", !c.author.trim() && "auteur", !c.license.trim() && "licence"].filter(Boolean);
    if (missing.length) {
      incomplete.push({ tab: "gcredits", field: `credit.${c.asset}`, message: `crédit de « ${c.asset} » incomplet, non enregistré : ${missing.join(", ")}` });
      continue;
    }
    credits.push({ asset: c.asset, title: c.title.trim(), author: c.author.trim(), license: c.license.trim(), source: c.source.trim() || undefined });
  }

  const layer: Obj = {
    version: GAME_EDIT_VERSION,
    rules,
    camera: { distance: num(form.camera.distance, "distance de la caméra (m)", GAME_LIMITS.cameraDistance, false, { tab: "gcamera", field: "camera.distance" }) },
    texts: {
      title: text(form.texts.title, { tab: "textes", field: "texts.title" }, "titre du jeu"),
      instructions: text(form.texts.instructions, { tab: "textes", field: "texts.instructions" }, "consigne"),
      end: text(form.texts.end, { tab: "textes", field: "texts.end" }, "message de fin"),
    },
    sounds,
    credits: { assets: credits },
  };
  return { layer, incomplete };
}

/** Sons utilisés par le jeu (onglet Crédits : crédit obligatoire, V-10), dans l'ordre du contrat, sans doublon. */
export function gameUsedSounds(form: GameForm): { asset: string; kind: "son" }[] {
  return [...new Set(GAME_SOUND_KEYS.map((k) => form.sounds[k]).filter(Boolean))].map((asset) => ({ asset, kind: "son" as const }));
}

// ---------------------------------------------------------------------------------------------------------
// Typographie française (point de MJ3) : espaces insécables (U+00A0) avant ? ! : ; et dans les guillemets « »
// ---------------------------------------------------------------------------------------------------------

const NBSP = " ";
/** Espace ordinaire (ou tabulation) avant ? ! : ; », ou après « : à remplacer par une insécable. */
const SPACE_BEFORE = /[ \t]+([?!:;»])/g;
const SPACE_AFTER = /(«)[ \t]+/g;

/** Signes précédés (ou suivis, pour «) d'une espace ordinaire dans `s`, sans doublon, dans l'ordre d'apparition. */
export function frenchSpacingIssues(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(SPACE_BEFORE)) if (!out.includes(m[1])) out.push(m[1]);
  for (const m of s.matchAll(SPACE_AFTER)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** `s` avec les espaces ordinaires devant ? ! : ; » et après « remplacées par une insécable. */
export function fixFrenchSpacing(s: string): string {
  return s.replace(SPACE_BEFORE, `${NBSP}$1`).replace(SPACE_AFTER, `$1${NBSP}`);
}

// ---------------------------------------------------------------------------------------------------------
// Jeu monté dans l'atelier
// ---------------------------------------------------------------------------------------------------------

/**
 * `ReaderGame` du moteur à partir de l'objet fusionné `draft` : GLB source de `game/` (chemins relatifs à `/atelier/`, servis
 * par le serveur de l'atelier), sons de la saisie. Même lecture que le livre (`parseReaderGame`).
 */
export function readerGameOf(draft: GameConfig): ReaderGame {
  const raw = {
    ...draft,
    build: { arena: "game/arena.glb", entities: Object.fromEntries(draft.entities.map((e) => [e.id, `game/${e.id}.glb`])) },
  };
  return parseReaderGame(raw, "");
}

/**
 * Stockage du jeu monté dans l'atelier (décision de MJ3) : en mémoire, pour l'onglet de l'atelier seulement. Le meilleur
 * score et les réglages des commandes d'une partie d'essai ne sont jamais écrits sous les clés du livre
 * (`glbinterpreter:game:<bookId>`, `glbinterpreter:controls:<bookId>`) : rien ne passe dans le `localStorage` de la page.
 */
export class MemoryStorage implements StorageLike {
  private readonly m = new Map<string, string>();
  getItem(key: string): string | null {
    return this.m.has(key) ? this.m.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.m.set(key, value);
  }
  removeItem(key: string): void {
    this.m.delete(key);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Rapport → champ (lignes du jeu : textes de src/schema/merge.ts et scripts/book-check.ts, `readGame`)
// ---------------------------------------------------------------------------------------------------------

/** Ligne du rapport qui concerne le jeu (lignes sans scène dont le texte commence par `game/` ou `jeu`). */
export const isGameLine = (l: { scene: string | null; message: string }) => l.scene === null && /^(game\/|jeu )/.test(l.message);

/** Champ du formulaire du jeu désigné par une ligne du rapport, `null` si elle ne concerne pas la couche éditoriale. */
export function gameFieldOfMessage(message: string, form: GameForm): FieldRef | null {
  const credit = (asset: string): FieldRef => ({ tab: "gcredits", field: `credit.${asset}` });
  const p = /^game\/game\.edit\.json : ([^ ]+) : /.exec(message);
  if (p) {
    const parts = p[1].split(".");
    switch (parts[0]) {
      case "rules":
        return { tab: "regles", field: parts[1] === "preys" || !parts[1] ? "rules.preys" : `rules.${parts[1]}` };
      case "camera":
        return { tab: "gcamera", field: "camera.distance" };
      case "texts":
        return { tab: "textes", field: `texts.${parts[1] ?? "title"}` };
      case "sounds":
        return { tab: "sons", field: `sounds.${parts[1] ?? "capture"}` };
      case "credits": {
        const c = parts[2] !== undefined ? form.credits[Number(parts[2])] : undefined;
        return c ? credit(c.asset) : { tab: "gcredits", field: "credits" };
      }
      default:
        return null;
    }
  }
  if (/^jeu : titre du jeu|^jeu : game\/game\.edit\.json absent/.test(message)) return { tab: "textes", field: "texts.title" };
  if (/^jeu : consigne du jeu/.test(message)) return { tab: "textes", field: "texts.instructions" };
  if (/^jeu : rules\.preys absent|^jeu : proie « /.test(message)) return { tab: "regles", field: "rules.preys" };
  const s = /^jeu : son « (.+) » sans entrée dans credits\.assets/.exec(message) ?? /^jeu : crédit pour « (.+) », asset non utilisé/.exec(message);
  if (s) return credit(s[1]);
  const a = /^asset « (.+) » introuvable dans le dossier source/.exec(message);
  if (a) {
    const k = GAME_SOUND_KEYS.find((x) => form.sounds[x] === a[1]);
    return k ? { tab: "sons", field: `sounds.${k}` } : null;
  }
  return null;
}
