import type { DioramaConfig3DWithPostProcessing } from "@/types/diorama";

const BASE_URL = process.env.NEXT_PUBLIC_ASSET_BASE_URL || "";

export const street: DioramaConfig3DWithPostProcessing = {
  glb: `${BASE_URL}/models/street.glb`,
  loaderImage: `${BASE_URL}/icons/dioramas/test_street/street-preview.png`,
  name: "La place du village",
  navigationType: "fps",
  postProcessing: {
    bloom: {
      enabled: true,
      strength: 0.2,
      radius: 0.5,
      threshold: 1.0,
    },
    ssao: {
      enabled: true,
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
      enabled: true,
      exposure: 1.3,
      type: "Linear",
    },
  },
  emissiveObjects: [
    { name: "bulb_01", color: 0xfff2cc, intensity: 2.5 },
    { name: "bulb_02", color: 0xfff2cc, intensity: 2.0 },
    { name: "TVScreen", color: 0x4488ff, intensity: 0.1 },
    { name: "TVScreen2", color: 0x4488ff, intensity: 0.2 },
  ],
  pois: [
    {
      id: "start",
      label: "Vue initiale",
      emptyName: "start",
      icon: `${BASE_URL}/icons/dioramas/test_street/start.png`,
      ambientSound: `${BASE_URL}/sounds/aquatic_ambience.mp3`,
      sceneSound: "/sounds/goofy_Ahh_trap_short.mp3",
      zoom: 0.5,
      lookAxis: "x",
      minDistance: 0.1,
      maxDistance: 20,
      minPolarAngle: 0,
      maxPolarAngle: 1.57,
      minAzimuthAngle: -3.14,
      maxAzimuthAngle: 3.14,
      enableZoom: true,
      elements: [
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
        }
      ],
      dialogue: {
        characters: [
          { id: "hero", name: "Alex", image: `${BASE_URL}/images/dioramas/test_street/characters/icone-elf.png` },
          { id: "guide", name: "Luna", image: `${BASE_URL}/images/dioramas/test_street/characters/icone-goblin.png` }
        ],
        lines: [
          {
            time: 0.5,
            text: "Salut ! Bienvenue dans le diorama.",
            characterId: "hero"
          },
          {
            time: 3.0,
            text: [
              "Ici, tu peux explorer la scène en 3D.",
              "Tu peux zoomer, tourner la caméra, et cliquer sur les points d'intérêt.",
              "Amuse-toi bien !"
            ],
            characterId: "guide"
          },
          {
            time: 12.5,
            text: "Allons voir ce qu’il se passe plus loin !",
            characterId: "hero"
          }
        ]
      },
      cameraPath: [
        { point: "start_01", target: "start_01_track", time: 3.0, duration: 3.0, zoom: 0.3 },
        { point: "start_02", target: "start_02_track", time: 8.0, duration: 4.0, zoom: 0.8 }
      ],
      dofConfig: {
        focus: 8.0,
        aperture: 0.015,
        maxblur: 0.01,
      },
    },
    {
      id: "window",
      label: "Fenêtre appartement",
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
      children: [
        {
          id: "apartment",
          label: "Appartement",
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
              label: "Coffre",
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
          label: "Door",
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
      label: "Fenêtre appartement 2",
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
  videos: [
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
  lights: [
    {
      type: "ambient",
      color: 0xffe0cc,
      intensity: 0.5,
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
  bulbs: [
    { emptyName: "bulb_01", color: 0xfff2cc, intensity: 2, emissiveIntensity: 1.5, distance: 10 },
    { emptyName: "bulb_02", color: 0xfff2cc, intensity: 1.8, emissiveIntensity: 1.2, distance: 8 },
  ],
  toonOutline: {
    defaultThickness: 0.001,
    defaultColor: [0, 0, 0],
    defaultAlpha: 0.9,
    defaultKeepAlive: true,
  },
  credits: {
    description: "Scène 3D immersive du village. Explore les différents points d’intérêt et découvre la vie du quartier.",
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
