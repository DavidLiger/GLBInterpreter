// Onglet Caméra (A4, spec-atelier-glbi.md §10.2) : saisie du cadrage orbital, distincte de `modules.camera` d'`edit.json`.
// Unités de la saisie : mètres pour les distances, degrés pour les angles (écrits en radians, arrondis à 6 décimales),
// `zoom` dans [0, 1] (décision du 13/10 : distance de départ = minDistance + zoom × (maxDistance − minDistance)).
// Règles d'enregistrement (logique d'A3, décision du 15/10, option B) : seuls les champs valides sont enregistrés ; un champ
// illisible ou hors des bornes du contrat, et les deux bornes d'une paire incohérente (min > max, refusée par
// `editLayerSchema`), restent dans la page et sont signalés dans « Saisie incomplète ». Un champ que l'onglet n'a pas
// modifié garde la valeur lue dans le fichier, au bit près (pas d'aller-retour degrés → radians).
// Fonctions pures, imports relatifs : testées par `npm run test:engine` (tsx).
import * as THREE from "three";
import { applyOrbitConstraints, orbitPosition, resolveOrbit, type OrbitConstraints, type OrbitFrame, type OrbitFraming } from "../components/diorama/lib/orbitFraming";

export type CameraNumKey = "zoom" | "minDistance" | "maxDistance" | "minPolarAngle" | "maxPolarAngle" | "minAzimuthAngle" | "maxAzimuthAngle";
export type LookAxis = "" | "x" | "y" | "z";

export const CAMERA_NUM_KEYS: readonly CameraNumKey[] = [
  "zoom",
  "minDistance",
  "maxDistance",
  "minPolarAngle",
  "maxPolarAngle",
  "minAzimuthAngle",
  "maxAzimuthAngle",
];

const ANGLE_KEYS: readonly CameraNumKey[] = ["minPolarAngle", "maxPolarAngle", "minAzimuthAngle", "maxAzimuthAngle"];
export const isAngleKey = (k: CameraNumKey) => ANGLE_KEYS.includes(k);

/** Libellés des champs (onglet, messages « Saisie incomplète »). */
export const CAMERA_LABELS: Record<CameraNumKey | "lookAxis" | "enableZoom", string> = {
  zoom: "zoom de départ",
  minDistance: "distance minimale",
  maxDistance: "distance maximale",
  minPolarAngle: "angle polaire minimal",
  maxPolarAngle: "angle polaire maximal",
  minAzimuthAngle: "azimut minimal",
  maxAzimuthAngle: "azimut maximal",
  lookAxis: "axe de vue",
  enableZoom: "zoom à la molette ou au pincement",
};

/** Bornes du contrat (`src/schema/glbi.ts`, `cameraFramingShape`), dans les unités du fichier. */
const EPS = 1e-6;
const RANGES: Record<CameraNumKey, { min: number; max: number; minExclusive?: boolean; text: string }> = {
  zoom: { min: 0, max: 1, text: "[0, 1]" },
  minDistance: { min: 0, max: Infinity, text: "≥ 0 m" },
  maxDistance: { min: 0, max: Infinity, minExclusive: true, text: "> 0 m" },
  minPolarAngle: { min: 0, max: Math.PI + EPS, text: "[0°, 180°]" },
  maxPolarAngle: { min: 0, max: Math.PI + EPS, text: "[0°, 180°]" },
  minAzimuthAngle: { min: -2 * Math.PI - EPS, max: 2 * Math.PI + EPS, text: "[−360°, 360°]" },
  maxAzimuthAngle: { min: -2 * Math.PI - EPS, max: 2 * Math.PI + EPS, text: "[−360°, 360°]" },
};

const PAIRS: readonly [CameraNumKey, CameraNumKey][] = [
  ["minDistance", "maxDistance"],
  ["minPolarAngle", "maxPolarAngle"],
  ["minAzimuthAngle", "maxAzimuthAngle"],
];

export interface CameraFields {
  /** Saisie : mètres, degrés, ou `zoom` dans [0, 1] ; `""` = champ absent (valeur par défaut du lecteur). */
  text: Record<CameraNumKey, string>;
  lookAxis: LookAxis;
  enableZoom: boolean;
}

export interface CameraForm extends CameraFields {
  /** État à la lecture du fichier : un champ resté égal garde sa valeur d'origine (`orig`). */
  init: CameraFields;
  /** `modules.camera` tel que lu dans `edit.json` (`undefined` si absent). */
  orig: Record<string, unknown> | undefined;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const RAD = Math.PI / 180;
export const toDeg = (rad: number) => rad / RAD;
const round = (v: number, decimals: number) => {
  const r = Math.round(v * 10 ** decimals) / 10 ** decimals;
  return Object.is(r, -0) ? 0 : r;
};

/** Nombre affiché sans zéros inutiles (séparateur « . »). */
export function fmt(v: number, decimals: number): string {
  return String(round(v, decimals));
}

/** Texte d'un champ à partir d'une valeur du fichier (radians pour les angles). */
function textOf(k: CameraNumKey, v: unknown): string {
  if (v === undefined || v === null) return "";
  if (!finite(v)) return String(v);
  return isAngleKey(k) ? fmt(toDeg(v), 4) : String(v);
}

export function emptyCameraFields(): CameraFields {
  return {
    text: { zoom: "", minDistance: "", maxDistance: "", minPolarAngle: "", maxPolarAngle: "", minAzimuthAngle: "", maxAzimuthAngle: "" },
    lookAxis: "",
    enableZoom: true,
  };
}

/** Formulaire depuis `modules.camera` lu dans `edit.json` (lecture tolérante). */
export function cameraFormFromRaw(raw: unknown): CameraForm {
  const c = isObj(raw) ? raw : undefined;
  const f = emptyCameraFields();
  if (c) {
    for (const k of CAMERA_NUM_KEYS) f.text[k] = textOf(k, c[k]);
    f.lookAxis = c.lookAxis === "x" || c.lookAxis === "y" || c.lookAxis === "z" ? c.lookAxis : "";
    f.enableZoom = c.enableZoom !== false;
  }
  return { ...f, init: { ...f, text: { ...f.text } }, orig: c };
}

/** Champs du formulaire remplacés (la référence `init`/`orig` du fichier est gardée). */
export type CameraPatch = Partial<Omit<CameraFields, "text">> & { text?: Partial<Record<CameraNumKey, string>> };

export function withFields(form: CameraForm, fields: CameraPatch): CameraForm {
  return { ...form, ...fields, text: { ...form.text, ...fields.text } };
}

/** L'onglet n'a rien changé depuis la lecture du fichier. */
export function cameraUntouched(form: CameraForm): boolean {
  return (
    CAMERA_NUM_KEYS.every((k) => form.text[k] === form.init.text[k]) &&
    form.lookAxis === form.init.lookAxis &&
    form.enableZoom === form.init.enableZoom
  );
}

export interface CameraIssue {
  field: CameraNumKey;
  message: string;
}

/** Valeur d'un champ dans les unités du fichier, ou un message. */
function parseField(form: CameraForm, k: CameraNumKey): { value?: number; issue?: string } {
  const text = form.text[k].trim();
  if (text === "") return {};
  // Champ inchangé : valeur du fichier, au bit près (si elle est lisible).
  if (form.text[k] === form.init.text[k] && finite(form.orig?.[k])) return checkRange(k, form.orig[k] as number, text);
  const n = Number(text.replace(",", ".").replace("−", "-"));
  if (!Number.isFinite(n)) return { issue: `${CAMERA_LABELS[k]} : « ${text} » n'est pas un nombre, non enregistré` };
  return checkRange(k, isAngleKey(k) ? round(n * RAD, 6) : n, text);
}

function checkRange(k: CameraNumKey, v: number, text: string): { value?: number; issue?: string } {
  const r = RANGES[k];
  const low = r.minExclusive ? v <= r.min : v < r.min;
  if (low || v > r.max) {
    const unit = isAngleKey(k) ? "°" : k === "zoom" ? "" : " m";
    return { issue: `${CAMERA_LABELS[k]} : ${text}${unit} hors de ${r.text}, non enregistré` };
  }
  return { value: v };
}

/**
 * `modules.camera` à enregistrer (champs valides seulement, dans les unités du fichier) et champs signalés. Inchangé depuis
 * la lecture et lisible : le cadrage du fichier tel quel (A3 le conservait déjà). `undefined` : pas de cadrage (valeurs par défaut).
 */
export function cameraLayerOf(form: CameraForm): { camera: Obj | undefined; issues: CameraIssue[] } {
  const issues: CameraIssue[] = [];
  const values: Partial<Record<CameraNumKey, number>> = {};
  for (const k of CAMERA_NUM_KEYS) {
    const p = parseField(form, k);
    if (p.issue) issues.push({ field: k, message: `cadrage : ${p.issue}` });
    else if (p.value !== undefined) values[k] = p.value;
  }
  // Paire incohérente (min > max) : refusée par le contrat ; aucune des deux bornes n'est enregistrée.
  for (const [lo, hi] of PAIRS) {
    const a = values[lo];
    const b = values[hi];
    if (a !== undefined && b !== undefined && a > b) {
      delete values[lo];
      delete values[hi];
      issues.push({
        field: lo,
        message: `cadrage : ${CAMERA_LABELS[lo]} (${form.text[lo].trim()}) > ${CAMERA_LABELS[hi]} (${form.text[hi].trim()}), aucune des deux bornes n'est enregistrée`,
      });
    }
  }
  const camera: Obj = { ...values };
  if (form.lookAxis) camera.lookAxis = form.lookAxis === form.init.lookAxis && form.orig ? form.orig.lookAxis : form.lookAxis;
  // `enableZoom` vaut vrai par défaut : écrit seulement s'il est faux, ou tel que lu s'il n'a pas changé.
  if (form.enableZoom === form.init.enableZoom) {
    if (form.orig && "enableZoom" in form.orig) camera.enableZoom = form.orig.enableZoom;
  } else if (!form.enableZoom) camera.enableZoom = false;
  // Inchangé et lisible : le cadrage du fichier tel quel (un cadrage illisible écrit à la main est signalé champ par champ).
  if (cameraUntouched(form) && !issues.length) return { camera: form.orig, issues };
  return { camera: Object.keys(camera).length ? camera : undefined, issues };
}

/** Cadrage effectif de la saisie (champs valides seulement), tel que le lecteur le recevrait après enregistrement. */
export function framingOf(form: CameraForm): OrbitFraming {
  const { camera } = cameraLayerOf(form);
  const out: OrbitFraming = {};
  if (!camera) return out;
  for (const k of CAMERA_NUM_KEYS) if (finite(camera[k])) out[k] = camera[k] as number;
  if (camera.lookAxis === "x" || camera.lookAxis === "y" || camera.lookAxis === "z") out.lookAxis = camera.lookAxis;
  if (typeof camera.enableZoom === "boolean") out.enableZoom = camera.enableZoom;
  return out;
}

/** Vue de la caméra autour de la cible, dans la convention d'`OrbitControls` (`lib/orbitFraming.ts`). */
export interface OrbitView {
  /** Distance à la cible (m). */
  distance: number;
  /** Angle polaire (rad) : 0 = au-dessus. */
  polarAngle: number;
  /** Azimut (rad) dans ]−π, π] : 0 = caméra sur +Z du glTF (face Blender), π/2 = +X. */
  azimuthAngle: number;
}

export function viewOf(camera: THREE.Vector3, target: THREE.Vector3): OrbitView {
  const s = new THREE.Spherical().setFromVector3(new THREE.Vector3().subVectors(camera, target));
  return { distance: s.radius, polarAngle: s.phi, azimuthAngle: s.theta };
}

/** Texte d'un champ « pris dans la vue actuelle ». `zoom` : position de la distance actuelle dans [min, max] du cadrage. */
export function takeFromView(k: CameraNumKey, view: OrbitView, range: { minDistance: number; maxDistance: number }): string {
  switch (k) {
    case "zoom": {
      const span = range.maxDistance - range.minDistance;
      const z = span > 0 ? (view.distance - range.minDistance) / span : 0;
      return fmt(Math.min(1, Math.max(0, z)), 4);
    }
    case "minDistance":
    case "maxDistance":
      return fmt(view.distance, 3);
    case "minPolarAngle":
    case "maxPolarAngle":
      return fmt(toDeg(view.polarAngle), 2);
    default:
      return fmt(toDeg(view.azimuthAngle), 2);
  }
}

/** Caméra et contrôles du lecteur (poignée `onEngineReady`, A4), réduits à ce que l'onglet utilise. */
export interface LiveCamera {
  camera: { position: THREE.Vector3 };
  controls: OrbitConstraints & { target: THREE.Vector3; update: () => unknown };
  radius: number;
}

/**
 * Pose le cadrage `framing` sur le lecteur, en place (sans remonter le lecteur ni relire le GLB) : bornes et réglages des
 * contrôles (ou bornes levées si `bounds` est faux, pour explorer au-delà), et caméra placée à la vue de départ si
 * `moveToStart`. Même calcul que le lecteur au chargement (`resolveOrbit` sur le rayon mesuré, cible = `controls.target`,
 * posée par le lecteur à la position monde de l'empty). Renvoie le cadrage résolu.
 */
export function applyFramingInPlace(live: LiveCamera, framing: OrbitFraming, opts: { bounds: boolean; moveToStart: boolean }): OrbitFrame {
  const frame = resolveOrbit(framing, live.radius);
  const c = live.controls;
  applyOrbitConstraints(
    c,
    opts.bounds
      ? frame
      : {
          ...frame,
          minDistance: 0,
          maxDistance: Infinity,
          minPolarAngle: 0,
          maxPolarAngle: Math.PI,
          minAzimuthAngle: -Infinity,
          maxAzimuthAngle: Infinity,
          enableZoom: true,
        },
  );
  if (opts.moveToStart) orbitPosition(c.target, frame, live.camera.position);
  c.update();
  return frame;
}
