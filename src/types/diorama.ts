// 🔹 Type pour éléments animés attachés à un POI
export type AnimatedElement = {
  name: string;      // Nom de l'objet ou armature dans la scène
  type: "armature" | "mesh"; 
  clipName: string;  // Nom du clip à jouer
  autoplay: boolean; 
  loop: boolean;
};

export type POI = {
  id: string;
  label: string;
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
};

export type CameraStep = {
  poi: string;        // ID du POI vers lequel déplacer la caméra
  time: number;       // moment de déclenchement (en secondes)
  duration?: number;  // durée du déplacement (optionnel, ms)
};

export type POIWithElements = POI & {
  elements?: AnimatedElement[];
};

export interface POIWithCameraPath extends POIWithElements {
  cameraPath?: CameraStep[];
}

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

export type DioramaVideo = {
  name: string;          // Object name in Blender
  src: string;           // Path to the video
  materialIndex?: number; // Optional: which material index to apply it to
  loop?: boolean;        // Default true
  muted?: boolean;       // Default true
  autoplay?: boolean;    // Default true
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

export type DioramaConfig3D = {
  glb: string;
  name: string;
  pois: POI[];
  navigationType: string, 
  videos?: DioramaVideo[];
  loaderImage?: string;
  lights?: DioramaLight[];
  bulbs?: DioramaBulb[];
  toonOutline?: ToonOutlineConfig; // 🔥 nouvel objet
};

export type DioramaConfig3DWithVideos = DioramaConfig3D & {
  videos?: DioramaVideo[];
  loaderImage?: string;
};