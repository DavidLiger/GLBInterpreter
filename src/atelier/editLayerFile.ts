// Forme écrite de `scenes/<id>.edit.json` (spec-atelier-glbi.md §4, A3) : clés dans l'ordre du contrat, actions dans l'ordre
// du GLB (les entrées orphelines ensuite, dans leur ordre), indentation de 2 espaces, UTF-8 sans échappement des accents,
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

/** Couche éditoriale réordonnée selon le contrat ; `actionOrder` : identifiants des actions dans l'ordre du GLB. */
export function orderEditLayer(edit: unknown, actionOrder: readonly string[]): unknown {
  const actions = (v: unknown) => {
    if (!isObj(v)) return v;
    const keys = [...actionOrder.filter((k) => k in v), ...Object.keys(v).filter((k) => !actionOrder.includes(k))];
    const out: Obj = {};
    for (const k of keys) out[k] = obj(["label", "icon", "sound"], { label: text })(v[k]);
    return out;
  };
  return obj(["version", "scene", "modules"], {
    scene: obj(["name", "loaderImage"], { name: text }),
    modules: obj(["camera", "animations", "audio", "quiz", "credits"], {
      camera: obj(CAMERA_FRAMING_KEYS),
      animations: obj(["actions"], { actions }),
      audio: obj(["ambientSound"]),
      quiz: obj(["question", "choices", "explanation"], {
        question: text,
        choices: map(obj(["text", "correct"], { text })),
        explanation: text,
      }),
      credits: obj(["assets"], { assets: map(obj(["asset", "title", "author", "license", "source"])) }),
    }),
  })(edit);
}

/** Texte du fichier tel que l'atelier l'écrit (`edit` déjà validé par `editLayerSchema`, ou à valider). */
export function formatEditLayer(edit: unknown, actionOrder: readonly string[]): string {
  return `${JSON.stringify(orderEditLayer(pruneEmpty(edit) ?? {}, actionOrder), null, 2)}\n`;
}

/** Identifiants des actions de la couche 3D brute (`glbi_config`), dans l'ordre du GLB ; `[]` si illisible. */
export function glbActionIds(layer3d: unknown): string[] {
  const actions = isObj(layer3d) && isObj(layer3d.modules) && isObj(layer3d.modules.animations) ? layer3d.modules.animations.actions : undefined;
  if (!Array.isArray(actions)) return [];
  return actions.map((a) => (isObj(a) && typeof a.id === "string" ? a.id : null)).filter((x): x is string => x !== null);
}
