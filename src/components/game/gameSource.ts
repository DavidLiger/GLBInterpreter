// Lecture de `game/game.json` (MJ1, complétée en MJ2) : objet fusionné du jeu écrit par le build (`builtGameSchema`), lu à
// l'exécution par chemin relatif, servi hors ligne par le service worker comme le reste du livre. Le lecteur n'embarque pas
// Zod : vérification de forme des champs lus, pour un message lisible. MJ2 : entités (rôle, clips, capsule), règles,
// caméra, sons et chemins des GLB (`build`), lus par le moteur.
import { bookDataBase } from "@/components/book/bookSource";

type Texts = { fr: string; en: string; es: string };
export type ClipRoleName = "idle" | "walk" | "run" | "attack" | "caught" | "flee";

export interface ReaderGameEntity {
  id: string;
  role: "player" | "prey";
  /** Racine animée (armature), nom Blender. */
  object: string;
  clips: Partial<Record<ClipRoleName, string>>;
  capsule: { radius: number; height: number };
  /** Empty `COLLIDER` qui place la capsule (facultatif). */
  collider?: string;
}

export interface ReaderGame {
  template: string;
  title: Texts;
  instructions: Texts;
  /** Message de fin propre au livre (sinon écran de fin générique). */
  end?: Texts;
  entities: ReaderGameEntity[];
  rules: {
    duration: number;
    preys: { entity: string; count: number }[];
    playerSpeed: number;
    preySpeed: number;
    detectionRadius: number;
    points: number;
    respawn: boolean;
  };
  camera: { distance: number };
  /** Sons du gabarit, chemins résolus (dossier du livre). */
  sounds: { capture?: string; jump?: string; music?: string; end?: string };
  /** GLB de l'arène et des entités, chemins résolus. */
  files: { arena: string; entities: Record<string, string> };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isTexts = (v: unknown): v is Texts => isObj(v) && ["fr", "en", "es"].every((l) => typeof v[l] === "string");
const num = (v: unknown, what: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`game/game.json : ${what} : nombre attendu`);
  return v;
};
const str = (v: unknown, what: string): string => {
  if (typeof v !== "string" || !v) throw new Error(`game/game.json : ${what} : texte attendu`);
  return v;
};
const CLIP_ROLES: ClipRoleName[] = ["idle", "walk", "run", "attack", "caught", "flee"];

/** `game/game.json` lu ; `base` = préfixe du dossier du livre (`dev-book/` en développement). */
export function parseReaderGame(raw: unknown, base = ""): ReaderGame {
  if (!isObj(raw) || raw.version !== 1 || typeof raw.template !== "string") throw new Error("game/game.json : version 1 et template attendus");
  const texts = raw.texts;
  if (!isObj(texts) || !isTexts(texts.title) || !isTexts(texts.instructions)) throw new Error("game/game.json : texts.title et texts.instructions attendus");
  if (!Array.isArray(raw.entities) || !raw.entities.length) throw new Error("game/game.json : entities attendu");
  const entities = raw.entities.map((e, i): ReaderGameEntity => {
    if (!isObj(e) || (e.role !== "player" && e.role !== "prey") || !isObj(e.clips) || !isObj(e.capsule)) throw new Error(`game/game.json : entities.${i} illisible`);
    const clips: ReaderGameEntity["clips"] = {};
    for (const r of CLIP_ROLES) if (typeof e.clips[r] === "string") clips[r] = e.clips[r] as string;
    return {
      id: str(e.id, `entities.${i}.id`),
      role: e.role,
      object: str(e.object, `entities.${i}.object`),
      clips,
      capsule: { radius: num(e.capsule.radius, `entities.${i}.capsule.radius`), height: num(e.capsule.height, `entities.${i}.capsule.height`) },
      ...(typeof e.collider === "string" ? { collider: e.collider } : {}),
    };
  });
  const r = raw.rules;
  if (!isObj(r) || !Array.isArray(r.preys)) throw new Error("game/game.json : rules attendu");
  const preys = r.preys.map((p, i) => {
    if (!isObj(p)) throw new Error(`game/game.json : rules.preys.${i} illisible`);
    return { entity: str(p.entity, `rules.preys.${i}.entity`), count: num(p.count, `rules.preys.${i}.count`) };
  });
  const cam = isObj(raw.camera) ? raw.camera : {};
  const build = raw.build;
  if (!isObj(build) || typeof build.arena !== "string" || !isObj(build.entities)) throw new Error("game/game.json : build.arena et build.entities attendus");
  const files = {
    arena: `${base}${build.arena}`,
    entities: Object.fromEntries(Object.entries(build.entities).map(([id, p]) => [id, `${base}${str(p, `build.entities.${id}`)}`])),
  };
  for (const e of entities) if (!files.entities[e.id]) throw new Error(`game/game.json : build.entities.${e.id} attendu`);
  const s = isObj(raw.sounds) ? raw.sounds : {};
  const sounds: ReaderGame["sounds"] = {};
  for (const k of ["capture", "jump", "music", "end"] as const) if (typeof s[k] === "string" && s[k]) sounds[k] = `${base}${s[k]}`;
  return {
    template: raw.template,
    title: texts.title,
    instructions: texts.instructions,
    ...(isTexts(texts.end) ? { end: texts.end } : {}),
    entities,
    rules: {
      duration: num(r.duration, "rules.duration"),
      preys,
      playerSpeed: num(r.playerSpeed, "rules.playerSpeed"),
      preySpeed: num(r.preySpeed, "rules.preySpeed"),
      detectionRadius: num(r.detectionRadius, "rules.detectionRadius"),
      points: num(r.points, "rules.points"),
      respawn: r.respawn !== false,
    },
    camera: { distance: typeof cam.distance === "number" ? cam.distance : 14 },
    sounds,
    files,
  };
}

export async function loadReaderGame(): Promise<ReaderGame> {
  const base = bookDataBase();
  const path = `${base}game/game.json`;
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} : HTTP ${res.status}`);
  return parseReaderGame(await res.json(), base);
}
