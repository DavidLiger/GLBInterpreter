// Noms des nœuds du GLB côté lecteur (Î10, point 5 ; C-18, C-19).
//
// Convention : la configuration (scène v1 comme fixture) désigne un objet, une armature ou un empty par son **nom Blender**,
// c'est-à-dire le nom du nœud glTF. `GLTFLoader` ne le garde pas tel quel dans `Object3D.name` : il le passe par
// `PropertyBinding.sanitizeNodeName` (retire `.`, `:`, `[`, `]`, `/`, remplace les espaces par `_`) et ajoute `_1`, `_2`…
// aux doublons ; le nom d'origine reste dans `userData.name`. Le lecteur ne cherche donc **jamais** un nœud par
// `getObjectByName(nomBrut)` : il passe par l'index ci-dessous, qui range chaque nœud sous son nom d'origine
// (`userData.name`) et, si la clé est libre, sous son nom assaini.
//
// Les noms de clips (`AnimationClip.name`) ne sont pas réécrits par `GLTFLoader`.
// Spec v1 (`spec-extras-blender.md` §3) : noms Blender en `^[A-Za-z0-9_]+$`, donc identiques après assainissement ;
// l'index sert surtout à la fixture et aux GLB qui ne suivent pas encore la règle.
import * as THREE from "three";

/** Nom d'origine d'un nœud (nom Blender), à défaut son nom Three.js. */
export function originalNodeName(obj: THREE.Object3D): string {
  const n = obj.userData?.name;
  return typeof n === "string" && n.length > 0 ? n : obj.name;
}

/**
 * Index nom → nœud de toute la hiérarchie `root` : clé = nom d'origine (prioritaire), puis nom assaini s'il est libre.
 * En cas de doublon de nom d'origine, le premier nœud rencontré (parcours en profondeur) est gardé.
 */
export function indexSceneNodes(root: THREE.Object3D, into: Record<string, THREE.Object3D> = {}): Record<string, THREE.Object3D> {
  const sanitized: [string, THREE.Object3D][] = [];
  root.traverse((child) => {
    const original = originalNodeName(child);
    if (original && !(original in into)) into[original] = child;
    if (child.name && child.name !== original) sanitized.push([child.name, child]);
  });
  for (const [name, child] of sanitized) if (!(name in into)) into[name] = child;
  return into;
}

/** Nœud désigné par un nom de la configuration : nom d'origine, sinon même nom passé par la sanitization de Three.js. */
export function findNode(index: Record<string, THREE.Object3D>, name: string): THREE.Object3D | undefined {
  return index[name] ?? index[THREE.PropertyBinding.sanitizeNodeName(name)];
}
