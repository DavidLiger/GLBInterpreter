// Cadrage orbital d'un POI (P-17 à P-21, C-08, Î10b ; décisions de David du 13/10 et du 14/10/2026).
//
// Une seule convention, celle d'`OrbitControls` (coordonnées sphériques de three, axe Y vers le haut) :
//   - angle polaire φ : 0 = caméra au-dessus de la cible, π/2 = à l'horizontale ;
//   - azimut θ : 0 = caméra sur l'axe +Z du glTF, c'est-à-dire la **vue de face de Blender** (pavé numérique 1) :
//     le sujet est modélisé tourné vers −Y dans Blender, axe converti en +Z par l'export glTF ; π/2 = caméra sur +X.
// Le calcul de la vue de départ et les bornes posées sur les contrôles utilisent cette même convention (avant Î10b, la
// vue de départ prenait l'azimut 0 sur +X et les contrôles le recadraient de 90° à la première interaction).
//
// `zoom` (décision du 13/10) : position de départ dans la plage de distance, entre 0 (au plus près, `minDistance`) et 1
// (au plus loin, `maxDistance`) : `distance = minDistance + zoom × (maxDistance − minDistance)`, 0,5 par défaut.
// Indépendant de l'échelle du modèle. (`zoom` des étapes de `cameraPath`, module réservé, garde une distance.)
//
// Valeurs par défaut (décision du 14/10), champ par champ, quand `modules.camera` (couche éditoriale) ne les donne pas :
//   - distances : `minDistance = 1,5 × r`, `maxDistance = 6 × r`, `r` = rayon de la sphère englobante de la scène
//     chargée ; départ à `zoom` 0,5, donc 3,75 × r ;
//   - angle polaire : bornes [0, π/2] (pas de vue sous le sol) ; départ à 70° (20° au-dessus de l'horizontale), ou au
//     milieu des bornes polaires si l'une d'elles est déclarée ;
//   - azimut : pas de borne ; départ à 0 (face), ou au milieu des bornes si les deux sont déclarées. Le milieu est
//     `(min + max) / 2`, sans normaliser la différence : pour [−3,14 ; 3,14], il vaut 0 (P-18, P-19) ;
//   - `lookAxis` (sans bornes d'azimut) : `"x"` place la caméra sur +X (profil), `"y"` et `"z"` de face ;
//   - `enableZoom` vrai, pas de déplacement latéral, amortissement 0,05.
// Ce module est pur (pas de dépendance au DOM) : testé par `npm run test:engine`.
import * as THREE from "three";

/** Champs de cadrage d'un POI (sous-ensemble de `POI`, `types/diorama.ts`). */
export interface OrbitFraming {
  zoom?: number;
  lookAxis?: "x" | "y" | "z";
  minDistance?: number;
  maxDistance?: number;
  minPolarAngle?: number;
  maxPolarAngle?: number;
  minAzimuthAngle?: number;
  maxAzimuthAngle?: number;
  enableZoom?: boolean;
  enablePan?: boolean;
  dampingFactor?: number;
}

/** Cadrage complet, sans valeur manquante : vue de départ et bornes des contrôles. */
export interface OrbitFrame {
  minDistance: number;
  maxDistance: number;
  distance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  polarAngle: number;
  minAzimuthAngle: number;
  maxAzimuthAngle: number;
  azimuthAngle: number;
  enableZoom: boolean;
  enablePan: boolean;
  dampingFactor: number;
}

export const ORBIT_DEFAULTS = {
  minDistanceFactor: 1.5,
  maxDistanceFactor: 6,
  zoom: 0.5,
  polarAngle: (70 * Math.PI) / 180,
  minPolarAngle: 0,
  maxPolarAngle: Math.PI / 2,
  dampingFactor: 0.05,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);

/** Rayon de la sphère englobante de `root` (au moins 1e-3 ; 1 si la scène est vide). */
export function sceneRadius(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return 1;
  const r = box.getBoundingSphere(new THREE.Sphere()).radius;
  return num(r) && r > 0 ? Math.max(r, 1e-3) : 1;
}

/** Résout le cadrage d'un POI : valeurs déclarées, sinon valeurs par défaut (en-tête du fichier). */
export function resolveOrbit(f: OrbitFraming, radius: number): OrbitFrame {
  const r = num(radius) && radius > 0 ? radius : 1;

  // Distances
  let minDistance = num(f.minDistance) ? f.minDistance : ORBIT_DEFAULTS.minDistanceFactor * r;
  let maxDistance = num(f.maxDistance) ? f.maxDistance : ORBIT_DEFAULTS.maxDistanceFactor * r;
  if (!num(f.maxDistance)) maxDistance = Math.max(maxDistance, minDistance);
  if (!num(f.minDistance)) minDistance = Math.min(minDistance, maxDistance);
  if (minDistance > maxDistance) [minDistance, maxDistance] = [maxDistance, minDistance];
  const zoom = clamp(num(f.zoom) ? f.zoom : ORBIT_DEFAULTS.zoom, 0, 1);
  const distance = minDistance + zoom * (maxDistance - minDistance);

  // Angle polaire
  const polarDeclared = num(f.minPolarAngle) || num(f.maxPolarAngle);
  let minPolarAngle = num(f.minPolarAngle) ? f.minPolarAngle : ORBIT_DEFAULTS.minPolarAngle;
  let maxPolarAngle = num(f.maxPolarAngle) ? f.maxPolarAngle : ORBIT_DEFAULTS.maxPolarAngle;
  if (!num(f.maxPolarAngle)) maxPolarAngle = Math.max(maxPolarAngle, minPolarAngle);
  if (!num(f.minPolarAngle)) minPolarAngle = Math.min(minPolarAngle, maxPolarAngle);
  if (minPolarAngle > maxPolarAngle) [minPolarAngle, maxPolarAngle] = [maxPolarAngle, minPolarAngle];
  const polarAngle = polarDeclared
    ? (minPolarAngle + maxPolarAngle) / 2
    : clamp(ORBIT_DEFAULTS.polarAngle, minPolarAngle, maxPolarAngle);

  // Azimut
  const minAzimuthAngle = num(f.minAzimuthAngle) ? f.minAzimuthAngle : -Infinity;
  const maxAzimuthAngle = num(f.maxAzimuthAngle) ? f.maxAzimuthAngle : Infinity;
  const axisAzimuth = f.lookAxis === "x" ? Math.PI / 2 : 0;
  const azimuthAngle =
    num(f.minAzimuthAngle) && num(f.maxAzimuthAngle)
      ? (f.minAzimuthAngle + f.maxAzimuthAngle) / 2
      : clamp(axisAzimuth, minAzimuthAngle, maxAzimuthAngle);

  return {
    minDistance,
    maxDistance,
    distance,
    minPolarAngle,
    maxPolarAngle,
    polarAngle,
    minAzimuthAngle,
    maxAzimuthAngle,
    azimuthAngle,
    enableZoom: f.enableZoom ?? true,
    enablePan: f.enablePan ?? false,
    dampingFactor: f.dampingFactor ?? ORBIT_DEFAULTS.dampingFactor,
  };
}

/** Position de la caméra pour `frame` autour de `target` (convention d'`OrbitControls`). */
export function orbitPosition(target: THREE.Vector3, frame: Pick<OrbitFrame, "distance" | "polarAngle" | "azimuthAngle">, out = new THREE.Vector3()): THREE.Vector3 {
  return out.setFromSphericalCoords(frame.distance, frame.polarAngle, frame.azimuthAngle).add(target);
}

/** Contraintes du cadrage, telles que les porte `OrbitControls`. */
export type OrbitConstraints = Pick<
  OrbitFrame,
  "minDistance" | "maxDistance" | "minPolarAngle" | "maxPolarAngle" | "minAzimuthAngle" | "maxAzimuthAngle" | "enableZoom" | "enablePan" | "dampingFactor"
>;

/** Pose les bornes et réglages de `frame` sur les contrôles. */
export function applyOrbitConstraints(controls: OrbitConstraints, frame: OrbitConstraints): void {
  controls.minDistance = frame.minDistance;
  controls.maxDistance = frame.maxDistance;
  controls.minPolarAngle = frame.minPolarAngle;
  controls.maxPolarAngle = frame.maxPolarAngle;
  controls.minAzimuthAngle = frame.minAzimuthAngle;
  controls.maxAzimuthAngle = frame.maxAzimuthAngle;
  controls.enableZoom = frame.enableZoom;
  controls.enablePan = frame.enablePan;
  controls.dampingFactor = frame.dampingFactor;
}
