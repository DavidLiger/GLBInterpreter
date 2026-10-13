// Type interne du moteur de scène (POI, éléments animés, modules réservés de la console).
//
// Type unique (C-01 à C-04, Î10) : l'entrée du lecteur est typée par le schéma Zod (`src/schema/glbi.ts`) :
//   - scène v1 : `BuiltScene` (`scenes/<id>.json` validé au build), traduite en `DioramaConfig3D` par
//     `sceneToEngineConfig` (`src/components/book/readerScene.ts`) : un seul POI nommé `start` (V-04) ;
//   - fixture de développement (`src/content/fixtures/`) : écrite directement dans ce type, hors schéma v1, parce
//     qu'elle utilise les modules réservés (POI hiérarchiques, cameraPath, dialogues, vidéos, lumières, post-processing…).
// Les textes traduits sont ceux du schéma (`LocalizedText`) ; il n'y a plus d'alias de config (`…WithVideos`,
// `…WithPostProcessing`, `POIWithElements`) : `DioramaConfig3D` et `POI` portent tous les champs.
import type { LocalizedText } from "@/schema/glbi";

// 🔹 Type pour éléments animés attachés à un POI
export type AnimatedElement = {
  name: string;      // Nom de l'objet ou armature dans la scène
  type: "armature" | "mesh"; 
  clipName: string;  // Nom du clip à jouer
  autoplay: boolean; 
  loop: boolean;
  placeholderMesh?: string; // ✅ NOUVEAU : nom du mesh placeholder
  transitionFrames?: number;
  facialSpritesheets?: Array<{
    meshName: string;
    src: string;
    columns: number;
    rows: number;
    totalFrames: number;
    fps: number;
    mode: 'loop' | 'controlled';
  }>;
};

export type DialogueCharacter = {
  id: string;              // identifiant unique (ex: "hero", "guide")
  name?: LocalizedText;           // nom affiché (optionnel)
  image: string;           // image/avatar du personnage
};

export type DialogueLine = {
  time: number;            // moment d’apparition (en secondes)
  text: LocalizedText | LocalizedText[];          // texte à afficher
  characterId: string;     // id du personnage qui parle
};

export type POIDialogue = {
  characters: DialogueCharacter[]; // tous les personnages impliqués
  lines: DialogueLine[];           // les répliques synchronisées
};

export type POICameraStep = {
  point: string;       // Nom du Empty vers lequel déplacer la caméra
  target?: string;     // (optionnel) Empty vers lequel orienter la caméra
  time: number;        // Temps en secondes où le mouvement commence
  duration?: number;   // Durée de la transition (en secondes)
  zoom?: number;
};

export interface POIEffects {
  enabled: boolean;
  particles?: { // ✅ Optionnel
    type: "leaves" | "snow" | "rain" | "dust" | "sparkles";
    intensity?: number;
    color?: string | number;
    area?: [number, number, number];
    texture?: string;
  };
  skybox?: { // ✅ Optionnel
    texture: string;
    tint?: string;
    intensity?: number;
  };
  lighting?: { // ✅ Optionnel
    temperature?: number;
    ambientIntensity?: number;
  };
}

export interface DOFConfig {
  focus: number;
  aperture?: number;
  maxblur?: number;
}

/**
 * Point d'intérêt : un empty de la scène (`emptyName`, nom Blender, voir `lib/nodeNames.ts`) et son cadrage orbital.
 * Convention (C-17, V-04) : le POI de départ s'appelle `start` ; une scène v1 n'a que lui.
 */
export type POI = {
  id: string;
  label: LocalizedText;
  emptyName: string;
  autoplay?: boolean;
  icon?: string;
  ambientSound?: string;
  sceneSound?: string;  
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
  children?: POI[];
  elements?: AnimatedElement[];
  dialogue?: POIDialogue;
  cameraPath?: POICameraStep[];
  cameraPathTarget?: string;
  dofConfig?: DOFConfig;
  effects?: POIEffects; 
};


// Dans src/types/diorama.ts
export type DioramaVideo = {
  name: string;          // Object name in Blender
  src: string;           // Path to the video
  materialIndex?: number;
  loop?: boolean;
  muted?: boolean;
  autoplay?: boolean;
  type?: 'video' | 'spritesheet';
  spritesheet?: {                  
    columns: number;
    rows: number;
    totalFrames: number;
    fps?: number;
    mode?: 'loop' | 'controlled';
  };
};

export type DioramaLight = {
  type: "ambient" | "directional" | "spot";
  emptyName?: string; // optionnel, seulement pour les spots
  color?: number;
  intensity?: number;
  distance?: number; // pour spot
  angle?: number;    // pour spot
  penumbra?: number; // pour spot
};

export type DioramaBulb = {
  emptyName: string; // mesh représentant l'ampoule
  color?: number;
  intensity?: number; // intensité de la lumière réelle
  distance?: number; // portée
  emissiveIntensity?: number; // intensité d'émission du matériau
};

export type ToonOutlineConfig = {
  defaultThickness?: number; // épaisseur du contour
  defaultColor?: [number, number, number]; // RGB 0-1 ou 0-255
  defaultAlpha?: number; // opacité
  defaultKeepAlive?: boolean; // garde le contour actif
};

export interface PostProcessingConfig {
  bloom?: {
    enabled: boolean;
    strength?: number;
    radius?: number;
    threshold?: number;
  };
  ssao?: {
    enabled: boolean;
    kernelRadius?: number;
    minDistance?: number;
    maxDistance?: number;
  };
  dof?: {
    enabled: boolean;
    focus?: number;
    aperture?: number;
    maxblur?: number;
  };
  toneMapping?: {
    enabled: boolean;
    exposure?: number;
    type?: "ACESFilmic" | "Linear" | "Reinhard" | "Cineon";
  };
}

/** Configuration d'une scène pour le moteur (voir l'en-tête). */
export type DioramaConfig3D = {
  glb: string;
  name: LocalizedText;
  pois: POI[];
  // navigationType: string, 
  videos?: DioramaVideo[];
  loaderImage?: string;
  lights?: DioramaLight[];
  bulbs?: DioramaBulb[];
  toonOutline?: ToonOutlineConfig; // 🔥 nouvel objet
  credits?: DioramaCredits;
  autoplay?: boolean;
  /** Module réservé (post-processing). */
  postProcessing?: PostProcessingConfig;
  /** Module réservé (objets émissifs, avec le post-processing). */
  emissiveObjects?: Array<{
    name: string;
    color: number;
    intensity: number;
  }>;
};

export interface DioramaCredits {
  description?: LocalizedText; // Texte d'intro ou aide
  music?: { title: string; author?: string; source?: string }[];
  sounds?: { title: string; source?: string }[];
  licenses?: string[]; // CC0, CC-BY, etc.
  year?: string;
  project?: string;
}
