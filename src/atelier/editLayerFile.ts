// Forme écrite de `scenes/<id>.edit.json` (spec-atelier-glbi.md §4, A3) : clés dans l'ordre du contrat, actions dans l'ordre
// du GLB (les entrées orphelines ensuite, dans leur ordre), événements de chaque action dans l'ordre du GLB (AC3 ; les
// événements orphelins ensuite, dans leur ordre), indentation de 2 espaces, UTF-8 sans échappement des accents,
// retour à la ligne final, champs facultatifs vides omis (jamais "" ni null, ni objet ou tableau vide).
// Fonctions pures partagées par le serveur de l'atelier (écriture) et la page (comparaison avec le fichier lu).
// Imports relatifs seulement : ce fichier est aussi exécuté par `tsx` (scripts/atelier/server.ts).
import { CAMERA_FRAMING_KEYS } from "../schema/glbi";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Retire récursivement les valeurs vides : `""` (ou blanc), `null`, `undefined`, objet ou tableau devenu vide. */
export function pruneEmpty(v: unknown): unknown {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string") return v.trim() === "" ? undefined : v;
  if (Array.isArray(v)) {
    const arr = v.map(pruneEmpty).filter((x) => x !== undefined);
    return arr.length ? arr : undefined;
  }
  if (isObj(v)) {
    const out: Obj = {};
    for (const [k, x] of Object.entries(v)) {
      const p = pruneEmpty(x);
      if (p !== undefined) out[k] = p;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return v;
}

/** Copie de `o` avec les clés de `keys` d'abord, dans cet ordre ; les autres clés ensuite, dans leur ordre. */
function ordered(o: Obj, keys: readonly string[], each?: Record<string, (v: unknown) => unknown>): Obj {
  const out: Obj = {};
  const put = (k: string) => {
    out[k] = each?.[k] ? each[k](o[k]) : o[k];
  };
  for (const k of keys) if (k in o) put(k);
  for (const k of Object.keys(o)) if (!(k in out)) put(k);
  return out;
}

const LANG_KEYS = ["fr", "en", "es"];
const text = (v: unknown) => (isObj(v) ? ordered(v, LANG_KEYS) : v);
const map = (f: (v: unknown) => unknown) => (v: unknown) => (Array.isArray(v) ? v.map(f) : v);
const obj = (keys: readonly string[], each?: Record<string, (v: unknown) => unknown>) => (v: unknown) =>
  isObj(v) ? ordered(v, keys, each) : v;

/** Clés de `v` : celles de `order` d'abord (dans cet ordre), les autres ensuite, dans leur ordre. */
const keysFirst = (v: Obj, order: readonly string[]) => [...order.filter((k) => k in v), ...Object.keys(v).filter((k) => !order.includes(k))];

/** Identifiants des événements de chaque action, dans l'ordre du GLB (AC3). */
export type EventOrder = Readonly<Record<string, readonly string[]>>;

/**
 * Couche éditoriale réordonnée selon le contrat ; `actionOrder` : identifiants des actions dans l'ordre du GLB ;
 * `eventOrder` : événements de chaque action dans l'ordre du GLB (AC3).
 */
export function orderEditLayer(edit: unknown, actionOrder: readonly string[], eventOrder: EventOrder = {}): unknown {
  const actions = (v: unknown) => {
    if (!isObj(v)) return v;
    const out: Obj = {};
    for (const k of keysFirst(v, actionOrder)) {
      const events = (e: unknown) => {
        if (!isObj(e)) return e;
        const evs: Obj = {};
        for (const id of keysFirst(e, eventOrder[k] ?? [])) evs[id] = obj(["sound"])(e[id]);
        return evs;
      };
      out[k] = obj(["label", "icon", "sound", "events"], { label: text, events })(v[k]);
    }
    return out;
  };
  return obj(["version", "scene", "modules"], {
    scene: obj(["name", "loaderImage"], { name: text }),
    modules: obj(["camera", "animations", "audio", "quiz", "card", "credits"], {
      camera: obj(CAMERA_FRAMING_KEYS),
      animations: obj(["actions"], { actions }),
      audio: obj(["ambientSound"]),
      quiz: obj(["question", "choices", "explanation"], {
        question: text,
        choices: map(obj(["text", "correct"], { text })),
        explanation: text,
      }),
      // Carte de collection (CC1) : valeurs des caractéristiques dans l'ordre du fichier.
      card: obj(["subtitle", "image", "fields", "text"], {
        subtitle: text,
        fields: (v: unknown) => (isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, text(x)])) : v),
        text,
      }),
      credits: obj(["assets"], { assets: map(obj(["asset", "title", "author", "license", "source"])) }),
    }),
  })(edit);
}

/** Texte du fichier tel que l'atelier l'écrit (`edit` déjà validé par `editLayerSchema`, ou à valider). */
export function formatEditLayer(edit: unknown, actionOrder: readonly string[], eventOrder: EventOrder = {}): string {
  return `${JSON.stringify(orderEditLayer(pruneEmpty(edit) ?? {}, actionOrder, eventOrder), null, 2)}\n`;
}

/** Identifiants des actions de la couche 3D brute (`glbi_config`), dans l'ordre du GLB ; `[]` si illisible. */
export function glbActionIds(layer3d: unknown): string[] {
  const actions = isObj(layer3d) && isObj(layer3d.modules) && isObj(layer3d.modules.animations) ? layer3d.modules.animations.actions : undefined;
  if (!Array.isArray(actions)) return [];
  return actions.map((a) => (isObj(a) && typeof a.id === "string" ? a.id : null)).filter((x): x is string => x !== null);
}

/** Événement d'une action de la couche 3D : identifiant et instant dans le clip (secondes), lecture seule (AC3). */
export interface GlbEvent {
  id: string;
  time: number;
}

/** Action de la couche 3D brute, dans l'ordre du GLB, avec ce que l'atelier en affiche en lecture seule (AC3). */
export interface GlbAction {
  id: string;
  clip: string;
  loop: boolean;
  /** `"cut"` : coupe au noir (DP-8) ; absent : fondu. */
  transition: "fade" | "cut" | null;
  /** Empty de position de la caméra pendant l'action (DP-19), `null` sinon. */
  cameraPosition: string | null;
  events: GlbEvent[];
}

/** Actions de la couche 3D brute (`glbi_config`), dans l'ordre du GLB (lecture tolérante) ; `[]` si illisible. */
export function glbActionsOf(layer3d: unknown): GlbAction[] {
  const actions = isObj(layer3d) && isObj(layer3d.modules) && isObj(layer3d.modules.animations) ? layer3d.modules.animations.actions : undefined;
  if (!Array.isArray(actions)) return [];
  return actions.filter((a): a is Obj => isObj(a) && typeof a.id === "string").map((a) => ({
    id: a.id as string,
    clip: typeof a.clip === "string" ? a.clip : "?",
    loop: a.loop === true,
    transition: a.transition === "cut" || a.transition === "fade" ? a.transition : null,
    cameraPosition: typeof a.cameraPosition === "string" && a.cameraPosition ? a.cameraPosition : null,
    events: Array.isArray(a.events)
      ? a.events
          .filter((e): e is Obj => isObj(e) && typeof e.id === "string")
          .map((e) => ({ id: e.id as string, time: typeof e.time === "number" ? e.time : Number.NaN }))
      : [],
  }));
}

/** Événements de chaque action de la couche 3D brute, dans l'ordre du GLB (AC3). */
export function glbEventIds(layer3d: unknown): Record<string, string[]> {
  return Object.fromEntries(glbActionsOf(layer3d).map((a) => [a.id, a.events.map((e) => e.id)]));
}
