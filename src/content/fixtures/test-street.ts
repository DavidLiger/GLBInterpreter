// src/content/fixtures/test-street.ts
// Cartouche de test (D-8.3) : sert de livre tant que le livre-démo/livre 1 n'existe pas.
// Contenu de développement uniquement, non destiné à la publication. Les crédits d'origine
// (musique « Aquatic Ambience », sources de sons non vérifiées) ont été retirés en Î4 ;
// les crédits réels sont refaits par asset en Î6 (C-16).
import type { DioramaConfig3DWithPostProcessing } from "@/types/diorama";

// Chemins relatifs à la racine du livre (D-8.1, Î5) : les fichiers sont servis depuis le dossier exporté
// (`public/` en développement). Les médias lourds (models/, sounds/, videos/, spritesheets/,
// icons/dioramas/test_street/) ne sont pas versionnés : à copier localement dans `public/` (voir README).

export const testStreet: DioramaConfig3DWithPostProcessing = {
  glb: `models/street.glb`,
  loaderImage: `icons/dioramas/test_street/street-preview.png`,
  autoplay: true, // ← Mode tutoriel automatique ou pas
  name: {
    fr: "La place du village",
    en: "The Village Square",
    es: "La plaza del pueblo"
  },
  postProcessing: {
    bloom: {
      enabled: false,
      strength: 0.2,
      radius: 0.5,
      threshold: 1.0,
    },
    ssao: {
      enabled: false,
      kernelRadius: 32,
      minDistance: 0.001,
      maxDistance: 0.15,
    },
    dof: {
      enabled: false, // Activé dynamiquement selon le POI
      focus: 5.0,
      aperture: 0.02,
      maxblur: 0.015,
    },
    toneMapping: {
      enabled: false,
      exposure: 1.3,
      type: "Linear",
    },
  },
  emissiveObjects: [ // fait partie du postprocessing
    // { name: "bulb_01", color: 0xfff2cc, intensity: 2.5 },
    // { name: "bulb_02", color: 0xfff2cc, intensity: 2.0 },
    // { name: "TVScreen", color: 0x4488ff, intensity: 0.1 },
    // { name: "TVScreen2", color: 0x4488ff, intensity: 0.2 },
  ],
  pois: [
    {
      id: "start",
      label: {
        fr: "Vue initiale",
        en: "Initial View",
        es: "Vista inicial"
      },
      emptyName: "start",
      icon: `icons/dioramas/test_street/start.png`,
      sceneSound: `sounds/goofy_Ahh_trap_short.mp3`,
      zoom: 0.5, // règlages de la cmera sur ce POI (jusqu'à enableZoom)
      lookAxis: "x",
      minDistance: 1,
      maxDistance: 20,
      minPolarAngle: 0,
      maxPolarAngle: 1.57,
      minAzimuthAngle: -3.14,
      maxAzimuthAngle: 3.14,
      enableZoom: true,
      elements: [ // elements posssedant une animation dans le glb
        {
          name: "Armature",
          type: "armature",
          clipName: "walk",
          autoplay: false,
          loop: false
        },
        {
          name: "ArmatureDonutCycle",
          type: "armature",
          clipName: "Action",
          autoplay: false,
          loop: false
        },
        {
          name: "donutCycle",
          type: "armature",
          clipName: "Action_001",
          autoplay: false,
          loop: false
        },
        {
          name: "DuckArmature_001", // les noms d'armature et d'actions (clipName) doivent tous avoir des _ et non des .
          type: "armature",
          clipName: "Duck_Walk",
          autoplay: false,
          loop: false
        },
        {
          name: "Armature_Velo_001",
          type: "armature",
          clipName: "velo_riding",
          autoplay: false,
          loop: false
        },
        {
          name: "donutCycle_002",
          type: "armature",
          clipName: "perso-riding-velo",
          autoplay: false,
          loop: false
        },
        {
          name: "Armature_Car",
          type: "armature",
          clipName: "car_driving",
          autoplay: false,
          loop: false
        },
        {
          name: "Armature_driver",
          type: "armature",
          clipName: "char_drive_car",
          autoplay: false,
          loop: false
        }
      ],
      dialogue: {
        characters: [
          { 
            id: "hero", 
            name: { fr: "Alex", en: "Alex", es: "Alex" }, 
            image: `images/dioramas/test_street/characters/icone-elf.png` 
          },
          { 
            id: "guide", 
            name: { fr: "Luna", en: "Luna", es: "Luna" }, 
            image: `images/dioramas/test_street/characters/icone-goblin.png` 
          }
        ],
        lines: [
          {
            time: 0.5,
            text: {
              fr: "Salut ! Bienvenue dans le diorama man.",
              en: "Hi! Welcome to the diorama.",
              es: "¡Hola! Bienvenido al diorama."
            },
            characterId: "hero"
          },
          {
            time: 3.0,
            text: [
              {
                fr: "Ici, tu peux explorer la scène en 3D.",
                en: "Here, you can explore the 3D scene.",
                es: "Aquí puedes explorar la escena 3D."
              },
              {
                fr: "Tu peux zoomer, tourner la caméra, et cliquer sur les points d'intérêt.",
                en: "You can zoom in, rotate the camera, and click on points of interest.",
                es: "Puedes ampliar la imagen, girar la cámara y hacer clic en los puntos de interés."
              },
              {
                fr: "Amuse-toi bien !",
                en: "Have fun!",
                es: "¡Que te diviertas!"
              }
            ],
            characterId: "guide"
          },
          {
            time: 12.5,
            text: {
                fr: "Allons voir ce qu’il se passe plus loin !",
                en: "Let's go and see what's happening further on!",
                es: "¡Vamos a ver qué pasa más allá!"
              },
            characterId: "hero"
          }
        ]
      },
      cameraPath: [ // pour le déplacement automatisé de la caméra durant l'animation
        { point: "start_01", target: "start_01_track", time: 3.0, duration: 3.0, zoom: 0.3 },
        { point: "start_02", target: "start_02_track", time: 8.0, duration: 4.0, zoom: 0.8 }
      ],
      dofConfig: { // focus et blur autour (à utiliser sur des cènes fixes)
        focus: 8.0,
        aperture: 0.015,
        maxblur: 0.01,
      },
      effects: {
        enabled: false,
        particles: {
          type: "leaves", 
          intensity: 0.6,
          color: "#ffcc66",
          area: [5, 3, 5],
          texture: `images/textures/leaf.png`,
        },
        skybox: {
          intensity: 0.8,
          tint: "#ffd9b3",
          texture: `images/hdr/city.png`,
        },
        lighting: {
          temperature: 3200,
          ambientIntensity: 0.7
        }
      }
    },
    {
      id: "window",
      label: {
        fr: "Fenêtre appartement",
        en: "Apartment window",
        es: "Ventana de apartamento"
      },
      emptyName: "window",
      icon: `icons/dioramas/test_street/window.png`,
      ambientSound: `sounds/kids_playing.mp3`,
      zoom: 0.2,
      lookAxis: "x",
      minDistance: 0.05,
      maxDistance: 0.1,
      minPolarAngle: 1,
      maxPolarAngle: 1.57,
      minAzimuthAngle: 1.14,
      maxAzimuthAngle: 2.14,
      enableZoom: true,
      elements: [
        {
          name: "ArmatureAppart",
          type: "armature",
          clipName: "walkAppart",
          autoplay: false,
          loop: false,
        },
        {
          name: "Suzanne",
          type: "mesh",
          clipName: "monkeyFly",
          autoplay: false,
          loop: false
        }
      ],
      children: [ // POIs enfant
        {
          id: "apartment",
          label: {
            fr: "Appartement",
            en: "Apartment",
            es: "Apartamento"
          },
          emptyName: "apartment",
          icon: `icons/dioramas/test_street/apartment.png`,
          ambientSound: `sounds/tv_background.mp3`,
          zoom: 0.2,
          lookAxis: "x",
          minDistance: 0.01,
          maxDistance: 0.05,
          minPolarAngle: 1,
          maxPolarAngle: 1.57,
          minAzimuthAngle: 1.14,
          maxAzimuthAngle: 2.14,
          enableZoom: true,
          elements: [
            {
              name: "Suzanne",
              type: "mesh",
              clipName: "monkeyFly",
              autoplay: false,
              loop: false
            }
          ],
          children: [
            {
              id: "coffre",
              label: {
                fr: "Coffre",
                en: "Chest",
                es: "Cofre"
              },
              emptyName: "coffre",
              icon: `icons/dioramas/test_street/coffre.png`,
              ambientSound: `sounds/snoring_guy.mp3`,
              zoom: 0.05,
              lookAxis: "x",
              minDistance: 0.01,
              maxDistance: 0.05,
              minPolarAngle: 1,
              maxPolarAngle: 1.57,
              minAzimuthAngle: 1.14,
              maxAzimuthAngle: 2.14,
              enableZoom: true,
            },
          ],
        },
        {
          id: "door",
          label: {
                fr: "Porte",
                en: "Door",
                es: "Puerta"
              },
          emptyName: "door",
          icon: `icons/dioramas/test_street/apartment.png`,
          ambientSound: `sounds/tv_background.mp3`,
          zoom: 0.2,
          lookAxis: "x",
          minDistance: 0.01,
          maxDistance: 0.05,
          minPolarAngle: 1,
          maxPolarAngle: 1.57,
          minAzimuthAngle: 1.14,
          maxAzimuthAngle: 2.14,
          enableZoom: true,
        }
      ],
      dofConfig: {
        focus: 0.08,
        aperture: 0.04,
        maxblur: 0.02,
      },
    },
    {
      id: "window2",
      label: {
        fr: "Fenêtre appartement 2",
        en: "Apartment window 2",
        es: "Ventana de apartamento 2"
      },
      emptyName: "window2",
      icon: `icons/dioramas/test_street/window.png`,
      ambientSound: `sounds/kids_playing.mp3`,
      sceneSound: `sounds/bonjour_exuberant.mp3`,
      zoom: 0.2,
      lookAxis: "x",
      minDistance: 0.05,
      maxDistance: 0.1,
      minPolarAngle: 1,
      maxPolarAngle: 1.57,
      minAzimuthAngle: 3.14,
      maxAzimuthAngle: 4.14,
      enableZoom: true,
      elements: [
        {
          name: "ArmatureRecoiffage",
          type: "armature",
          clipName: "recoiffageMain",
          autoplay: false,
          loop: false
        },
        {
          name: "Character_Salesman_Male_01012",
          type: "mesh",
          clipName: "bonjour_exuberant_blendshape_data.001",
          autoplay: false,
          loop: false
        }
      ]
    },
  ],
  videos: [ // pour les videostextures
    // {
    //   name: "TVScreen",
    //   src: `videos/test_street/Cab_Calloway_1933.mp4`,
    //   materialIndex: 0,
    //   loop: true,
    //   muted: true,
    // },
    {
      name: "TVScreen",
      src: "spritesheets/spritesheet_TV-screen.webp",
      type: "spritesheet",
      spritesheet: {
        columns: 8,
        rows: 6,
        totalFrames: 48,
        fps: 24,
        mode: "loop"
      }
    },
    {
      name: "TVScreen2",
      src: `videos/test_street/Cab_Calloway_Minnie.mp4`,
      autoplay: true,
    },
  ],
  lights: [ // règlages des lumières
    {
      type: "ambient",
      color: 0xffe0cc,
      intensity: 0.6,
    },
    {
      type: "spot",
      emptyName: "spot_01",
      color: 0xfff2cc,
      intensity: 0.8,
      distance: 10,
      angle: Math.PI / 4,
      penumbra: 0.3,
    },
    {
      type: "spot",
      emptyName: "spot_02",
      color: 0xfff2cc,
      intensity: 0.05,
      distance: 8,
      angle: Math.PI / 3.5,
      penumbra: 0.5,
    },
  ],
  bulbs: [ // couleur et emit des ampoules
    { emptyName: "bulb_01", color: 0xfff2cc, intensity: 2, emissiveIntensity: 1.5, distance: 10 },
    { emptyName: "bulb_02", color: 0xfff2cc, intensity: 1.8, emissiveIntensity: 1.2, distance: 8 },
  ],
  toonOutline: { // ligne de contour
    defaultThickness: 0.001,
    defaultColor: [0, 0, 0],
    defaultAlpha: 0.9,
    defaultKeepAlive: true,
  },
  credits: {
    description: {
      fr: "Scène de test (développement).",
      en: "Test scene (development).",
      es: "Escena de prueba (desarrollo)."
    },
    licenses: ["Contenu de test, non publié"],
    project: "GLBInterpreter – fixture de test",
    year: "2026",
  },
};
