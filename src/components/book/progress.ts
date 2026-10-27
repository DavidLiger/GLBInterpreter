// Progression du lecteur dans le livre (Î13, `spec-progression.md`). Fonctions pures (règles, lecture tolérante) et
// stockage isolé : testées sans navigateur (`npm run test:engine`).
//
// - Clé `localStorage` : `glbinterpreter:progress:<bookId>`, `bookId` = `book.json.bookId` (contradiction n°11 close).
// - Valeur, schéma unique partagé avec le futur mini-jeu (architecture, « Navigation et progression ») :
//   `{ unlockedScenes: string[], quizPassed: { [sceneId]: boolean }, collected: { [sceneId]: boolean } }`.
// - Règles (Q1, 17/10) : ordre = `book.json.scenes` ; une scène est accessible si elle est débloquée, si elle est la
//   première du livre ou si la précédente est débloquée ; débloquée = quiz réussi (ou ouverte, si elle n'a pas de quiz) ;
//   une scène débloquée s'ouvre sans quiz. `collected` = au moins une action jouée dans la scène ; lu depuis CC1 : carte de
//   collection gagnée (`src/components/card/cardModel.ts`, clé et valeur inchangées) ; `unlockThreshold` reste sans effet
//   (mini-jeu, MJ1).
// - Valeur illisible : lue champ par champ, le reste vaut vide ; scènes inconnues du livre conservées (aucune perte si
//   un livre reconstruit les retrouve) ; stockage absent, refusé ou plein : progression en mémoire pour la session (Q5).

export interface Progress {
  unlockedScenes: string[];
  quizPassed: Record<string, boolean>;
  collected: Record<string, boolean>;
}

/** État d'une scène pour le lecteur. */
export type SceneAccess = "unlocked" | "accessible" | "locked" | "unknown";

export const progressKey = (bookId: string) => `glbinterpreter:progress:${bookId}`;

export const emptyProgress = (): Progress => ({ unlockedScenes: [], quizPassed: {}, collected: {} });

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Table `{ [id]: boolean }` : seules les entrées booléennes sont gardées. */
function boolMap(v: unknown): Record<string, boolean> {
  if (!isObj(v)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, b] of Object.entries(v)) if (typeof b === "boolean") out[k] = b;
  return out;
}

/**
 * Valeur lue dans le stockage. `ok` est faux si elle était présente mais en partie ou totalement illisible (le lecteur
 * l'annonce en console) ; une valeur absente donne une progression vide, `ok` vrai.
 */
export function parseProgress(raw: string | null): { progress: Progress; ok: boolean } {
  if (raw === null) return { progress: emptyProgress(), ok: true };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { progress: emptyProgress(), ok: false };
  }
  if (!isObj(v)) return { progress: emptyProgress(), ok: false };
  const unlocked = Array.isArray(v.unlockedScenes) ? v.unlockedScenes.filter((s): s is string => typeof s === "string") : [];
  const progress: Progress = {
    unlockedScenes: [...new Set(unlocked)],
    quizPassed: boolMap(v.quizPassed),
    collected: boolMap(v.collected),
  };
  const ok =
    Array.isArray(v.unlockedScenes) &&
    unlocked.length === v.unlockedScenes.length &&
    isObj(v.quizPassed) &&
    Object.keys(progress.quizPassed).length === Object.keys(v.quizPassed).length &&
    isObj(v.collected) &&
    Object.keys(progress.collected).length === Object.keys(v.collected).length;
  return { progress, ok };
}

export const isUnlocked = (p: Progress, sceneId: string) => p.unlockedScenes.includes(sceneId);

/** Règle de déblocage (Q1) ; `unknown` si la scène n'est pas dans le livre. */
export function sceneAccess(p: Progress, scenes: readonly string[], sceneId: string): SceneAccess {
  const i = scenes.indexOf(sceneId);
  if (i < 0) return "unknown";
  if (isUnlocked(p, sceneId)) return "unlocked";
  if (i === 0 || isUnlocked(p, scenes[i - 1])) return "accessible";
  return "locked";
}

export function withUnlocked(p: Progress, sceneId: string): Progress {
  return isUnlocked(p, sceneId) ? p : { ...p, unlockedScenes: [...p.unlockedScenes, sceneId] };
}

/** Bonne réponse au quiz : `quizPassed` et scène débloquée. */
export function withQuizPassed(p: Progress, sceneId: string): Progress {
  const q = withUnlocked(p, sceneId);
  return q.quizPassed[sceneId] === true ? q : { ...q, quizPassed: { ...q.quizPassed, [sceneId]: true } };
}

/** Première action jouée dans la scène. */
export function withCollected(p: Progress, sceneId: string): Progress {
  return p.collected[sceneId] === true ? p : { ...p, collected: { ...p.collected, [sceneId]: true } };
}

/** Stockage minimal (`localStorage` ou double de test). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type Log = { warn: (...args: unknown[]) => void };

/**
 * Progression d'un livre. Lit le stockage à chaque lecture (un autre onglet du même livre peut avoir écrit) ; en cas
 * d'échec de lecture ou d'écriture, garde la valeur en mémoire pour la session et le dit une fois en console.
 */
export class ProgressStore {
  private readonly key: string;
  private memory: Progress | null = null;
  private warned = false;
  private illegibleWarned = false;

  constructor(
    bookId: string,
    private readonly storage: StorageLike | null,
    private readonly log: Log = console,
  ) {
    this.key = progressKey(bookId);
  }

  /** Vrai si la progression est seulement en mémoire (stockage indisponible). */
  get inMemory(): boolean {
    return this.memory !== null;
  }

  get(): Progress {
    if (this.memory) return this.memory;
    if (!this.storage) return this.fallBack(emptyProgress(), "localStorage indisponible");
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.key);
    } catch (e) {
      return this.fallBack(emptyProgress(), `lecture refusée (${(e as Error).message})`);
    }
    const { progress, ok } = parseProgress(raw);
    if (!ok && !this.illegibleWarned) {
      this.illegibleWarned = true;
      this.log.warn(`[PROGRESSION] valeur illisible sous ${this.key} : parties illisibles ignorées`);
    }
    return progress;
  }

  /** Applique `fn` à la progression courante et l'enregistre (rien n'est écrit si elle ne change pas). */
  update(fn: (p: Progress) => Progress): Progress {
    const before = this.get();
    const next = fn(before);
    if (next === before) return before;
    if (this.memory) {
      this.memory = next;
      return next;
    }
    try {
      this.storage!.setItem(this.key, JSON.stringify(next));
    } catch (e) {
      return this.fallBack(next, `écriture refusée (${(e as Error).message})`);
    }
    return next;
  }

  /** Remise à zéro (Q6). */
  reset(): Progress {
    if (this.memory) {
      this.memory = emptyProgress();
      return this.memory;
    }
    try {
      this.storage!.removeItem(this.key);
    } catch (e) {
      return this.fallBack(emptyProgress(), `effacement refusé (${(e as Error).message})`);
    }
    return emptyProgress();
  }

  private fallBack(p: Progress, why: string): Progress {
    this.memory = p;
    if (!this.warned) {
      this.warned = true;
      this.log.warn(`[PROGRESSION] ${why} : progression gardée en mémoire pour cette session (perdue au rechargement)`);
    }
    return p;
  }
}

/** `localStorage` de la page, `null` s'il est absent ou que son accès lève une exception (navigation privée stricte). */
export function pageStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}
