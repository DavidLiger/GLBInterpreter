// Éclairage de secours (D-8.10, décision du 13/10/2026 ; Î10b).
//
// Les lumières d'une scène v1 viennent du GLB (`KHR_lights_punctual`, export « Punctual Lights » en Lighting Mode
// Unitless imposé par l'addon) ; celles de la fixture viennent des modules réservés `lights` et `bulbs`. Le lecteur
// n'ajoute rien dès qu'une lumière est présente, et ne pose aucune exposition propre aux lampes du GLB.
// Si la scène chargée n'a **aucune** lumière, il ajoute un éclairage neutre (ciel/sol + directionnelle de face, en
// hauteur) et l'annonce en console : sans lui, la scène s'affiche noire (constat d'Î10a sur `trex`).
import * as THREE from "three";

export const FALLBACK_LIGHTS_NAME = "GLBI_fallback_lights";

/** Vrai si `root` contient au moins une lumière. */
export function hasLights(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse((o) => {
    if ((o as THREE.Light).isLight) found = true;
  });
  return found;
}

/**
 * Ajoute l'éclairage de secours à `scene` si elle n'a aucune lumière. `radius` : rayon de la sphère englobante (place la
 * directionnelle hors de la scène). Renvoie le groupe ajouté, ou `null`.
 */
export function addFallbackLightsIfNone(scene: THREE.Object3D, radius: number, where = "scène"): THREE.Group | null {
  if (hasLights(scene)) return null;
  const r = Number.isFinite(radius) && radius > 0 ? radius : 1;
  const group = new THREE.Group();
  group.name = FALLBACK_LIGHTS_NAME;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.5);
  group.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(0.5 * r, 2 * r, 1.5 * r); // de face (+Z), en hauteur
  group.add(sun);
  group.add(sun.target); // cible à l'origine de la scène

  scene.add(group);
  console.warn(`${where} : aucune lumière dans le GLB, éclairage neutre de secours ajouté (D-8.10) ; exporter les lampes avec « Punctual Lights »`);
  return group;
}
