export type TranslatedString = { fr: string; en: string; es: string };

// 🔹 Type pour éléments animés attachés à un POI
export type AnimatedElement = {
  name: string;      // Nom de l'objet ou armature dans la scène
  type: "armature" | "mesh"; 
  clipName: string;  // Nom du clip à jouer
  autoplay: boolean; 
  loop: boolean;
};

export type DialogueCharacter = {
  id: string;              // identifiant unique (ex: "hero", "guide")
  name?: TranslatedString;           // nom affiché (optionnel)
  image: string;           // image/avatar du personnage
};

export type DialogueLine = {
  time: number;            // moment d’apparition (en secondes)
  text: TranslatedString | TranslatedString[];          // texte à afficher
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

export interface DOFConfig {
  focus: number;
  aperture?: number;
  maxblur?: number;
}

export type POI = {
  id: string;
  label: TranslatedString;
  emptyName: string;
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
  effects?: {
    enabled?: boolean;
    particles?: {
      type: string;        // ex: 'leaves', 'snow', 'embers'
      intensity?: number;  // 0..1
      color?: string;      // hex ou string CSS
      area?: [number, number, number];
      texture?: string; 
    };
    skybox?: {
      texture?: string;    // nom de fichier HDR ou jpg
      intensity?: number;  // 0..1
      tint?: string;       // couleur
    };
    lighting?: {
      temperature?: number;       // en Kelvin
      ambientIntensity?: number;  // 0..1
    };
  };
};


export type POIWithElements = POI & {
  elements?: AnimatedElement[];
  cameraPath?: POICameraStep[];
};

export type OrbitParams = {
  minDistance?: number;
  maxDistance?: number;
  minPolarAngle?: number;
  maxPolarAngle?: number;
  minAzimuthAngle?: number;
  maxAzimuthAngle?: number;
  enableZoom?: boolean;
  enablePan?: boolean;
  dampingFactor?: number;
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

export interface DeviceTesterConfig {
  enabled: boolean;
  testDuration: number;
  minFPS: number;
  minGPUTier: number;
  skipIfPreviouslyTested?: boolean;
}

export type DioramaConfig3D = {
  glb: string;
  name: TranslatedString;
  pois: POI[];
  // navigationType: string, 
  videos?: DioramaVideo[];
  loaderImage?: string;
  lights?: DioramaLight[];
  bulbs?: DioramaBulb[];
  toonOutline?: ToonOutlineConfig; // 🔥 nouvel objet
  credits?: DioramaCredits;
  autoplay?: boolean;
  deviceTester?: DeviceTesterConfig;
};

export interface DioramaCredits {
  description?: TranslatedString; // Texte d'intro ou aide
  music?: { title: string; author?: string; source?: string }[];
  sounds?: { title: string; source?: string }[];
  licenses?: string[]; // CC0, CC-BY, etc.
  year?: string;
  project?: string;
}

export type DioramaConfig3DWithVideos = DioramaConfig3D & {
  videos?: DioramaVideo[];
  loaderImage?: string;
};

export interface DioramaConfig3DWithPostProcessing extends DioramaConfig3DWithVideos {
  postProcessing?: PostProcessingConfig;
  emissiveObjects?: Array<{
    name: string;
    color: number;
    intensity: number;
  }>;
}