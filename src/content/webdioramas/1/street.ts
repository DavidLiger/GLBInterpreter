import type { DioramaConfig3DWithPostProcessing } from "@/types/diorama";

const BASE_URL = process.env.NEXT_PUBLIC_ASSET_BASE_URL || "";

export const street: DioramaConfig3DWithPostProcessing = {
  glb: `${BASE_URL}/models/street.glb`,
  loaderImage: `${BASE_URL}/icons/dioramas/test_street/street-preview.png`,
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
      icon: `${BASE_URL}/icons/dioramas/test_street/start.png`,
      ambientSound: `${BASE_URL}/sounds/aquatic_ambience.mp3`,
      sceneSound: `${BASE_URL}/sounds/goofy_Ahh_trap_short.mp3`,
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
            image: `${BASE_URL}/images/dioramas/test_street/characters/icone-elf.png` 
          },
          { 
            id: "guide", 
            name: { fr: "Luna", en: "Luna", es: "Luna" }, 
            image: `${BASE_URL}/images/dioramas/test_street/characters/icone-goblin.png` 
          }
        ],
        lines: [
          {
            time: 0.5,
            text: {
              fr: "Salut ! Bienvenue dans le diorama.",
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
              // ...
            ],
            characterId: "guide"
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
          texture: `${BASE_URL}/images/textures/leaf.png`,
        },
        skybox: {
          intensity: 0.8,
          tint: "#ffd9b3",
          texture: `${BASE_URL}/images/hdr/city.png`,
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
      icon: `${BASE_URL}/icons/dioramas/test_street/window.png`,
      ambientSound: `${BASE_URL}/sounds/kids_playing.mp3`,
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
          loop: false
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
          icon: `${BASE_URL}/icons/dioramas/test_street/apartment.png`,
          ambientSound: `${BASE_URL}/sounds/tv_background.mp3`,
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
              icon: `${BASE_URL}/icons/dioramas/test_street/coffre.png`,
              ambientSound: `${BASE_URL}/sounds/snoring_guy.mp3`,
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
          icon: `${BASE_URL}/icons/dioramas/test_street/apartment.png`,
          ambientSound: `${BASE_URL}/sounds/tv_background.mp3`,
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
      icon: `${BASE_URL}/icons/dioramas/test_street/window.png`,
      ambientSound: `${BASE_URL}/sounds/kids_playing.mp3`,
      sceneSound: `${BASE_URL}/sounds/bonjour_exuberant.mp3`,
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
    {
      name: "TVScreen",
      src: `${BASE_URL}/videos/test_street/Cab_Calloway_1933.mp4`,
      materialIndex: 0,
      loop: true,
      muted: true,
    },
    {
      name: "TVScreen2",
      src: `${BASE_URL}/videos/test_street/Cab_Calloway_Minnie.mp4`,
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
    warning: {
      fr: "Navigateurs recommandés : Chrome, Brave, Safari (iOS)",
      en: "Recommended browsers: Chrome, Brave, Safari (iOS)",
      es: "Navegadores recomendados: Chrome, Brave, Safari (iOS)"
    },
    description: {
      fr: "Scène 3D immersive du village...",
      en: "Immersive 3D village scene...",
      es: "Escena 3D inmersiva del pueblo..."
    },
    music: [
      { title: "Aquatic Ambience", author: "David Wise", source: "No royalties - remix version" },
      { title: "Cab Calloway 1933", source: "Domaine public" },
    ],
    sounds: [
      { title: "kids_playing.mp3", source: "freesound.org" },
      { title: "snoring_guy.mp3", source: "mixkit.co" },
    ],
    licenses: ["Copyright", "Les Editions Liger"],
    project: "Diorama 3D Demo",
    year: "2025",
  },
};
