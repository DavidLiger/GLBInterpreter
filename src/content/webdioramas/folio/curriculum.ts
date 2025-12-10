import type { DioramaConfig3DWithPostProcessing } from "@/types/diorama";

const BASE_URL = process.env.NEXT_PUBLIC_ASSET_BASE_URL || "";

export const curriculum: DioramaConfig3DWithPostProcessing = {
  glb: `${BASE_URL}/models/work-planets.glb`,
  loaderImage: `${BASE_URL}/images/dioramas/work-planets/preview.webp`,
  autoplay: true, // ← Mode tutoriel automatique ou pas
  deviceTester: {
    enabled: false,
    testDuration: 10000,
    minFPS: 25,
    minGPUTier: 1,
  },
  name: {
    fr: "David Liger",
    en: "David Liger",
    es: "David Liger"
  },
//   postProcessing: {
//     bloom: {
//       enabled: false,
//       strength: 0.2,
//       radius: 0.5,
//       threshold: 1.0,
//     },
//     ssao: {
//       enabled: false,
//       kernelRadius: 32,
//       minDistance: 0.001,
//       maxDistance: 0.15,
//     },
//     dof: {
//       enabled: false, // Activé dynamiquement selon le POI
//       focus: 5.0,
//       aperture: 0.02,
//       maxblur: 0.015,
//     },
//     toneMapping: {
//       enabled: false,
//       exposure: 1.3,
//       type: "Linear",
//     },
//   },
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
        fr: "Chez David",
        en: "At David's",
        es: "En casa de David"
      },
      emptyName: "start",
      icon: `${BASE_URL}/icons/mountain.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Electric_Leisure.mp3`,
      sceneSound: `${BASE_URL}/sounds/Digital_Galaxy/Airwave_Romance.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "x",
      minDistance: 2.4,
      maxDistance: 4,
      minPolarAngle: 0.1,
      maxPolarAngle: 1.32,
      minAzimuthAngle: 2.24,
      maxAzimuthAngle: -0.2,
      enableZoom: true,
      children: [ // POIs enfant
        {
          id: "david_00",
          label: {
            fr: "çà bosse...",
            en: "It's working...",
            es: "¡Vamos allá!"
          },
          emptyName: "david_00",
          icon: `${BASE_URL}/icons/nerd-icon.webp`,
          ambientSound: `${BASE_URL}/sounds/Decode_The_Matrix/Decrypt_the_Night.mp3`,
          sceneSound: `${BASE_URL}/sounds/Decode_The_Matrix/Boot_the_System.mp3`,
          zoom: 0.2,
          lookAxis: "x",
          minDistance: 0.55,
          maxDistance: 1.1,
          minPolarAngle: 1,
          maxPolarAngle: 1.27,
          minAzimuthAngle: 1.14,
          maxAzimuthAngle: 4.14,
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
          effects: {
            enabled: true,
            skybox: {
              intensity: 0.8,
              tint: "#ffd9b3",
              texture: `${BASE_URL}/images/dioramas/work-planets/space_hdr_texture_of_stars.webp`,
            }
          }
        }
      ],
      elements: [ // elements posssedant une animation dans le glb
        {
          name: "clouds_00",
          type: "mesh",
          clipName: "clouds_00_Action",
          autoplay: false,
          loop: false
        },
      ],
      dialogue: {
        characters: [
          { 
            id: "nerd", 
            name: { fr: "David", en: "David", es: "David" }, 
            image: `${BASE_URL}/icons/nerd-icon.webp` 
          }
        ],
        lines: [
          {
            time: 0.5,
            text: {
              fr: "Salut ! Bienvenue dans le diorama ma poule.",
              en: "Hi! Welcome to the diorama.",
              es: "¡Hola! Bienvenido al diorama."
            },
            characterId: "nerd"
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
            characterId: "nerd"
          },
          {
            time: 12.5,
            text: {
                fr: "Allons voir ce qu’il se passe plus loin !",
                en: "Let's go and see what's happening further on!",
                es: "¡Vamos a ver qué pasa más allá!"
              },
            characterId: "nerd"
          }
        ]
      },
      cameraPath: [ // pour le déplacement automatisé de la caméra durant l'animation
        { point: "start_01", target: "start_01_track", time: 3.0, duration: 3.0, zoom: 0.3 },
        { point: "start_02", target: "start_02_track", time: 8.0, duration: 4.0, zoom: 0.8 }
      ],
      dofConfig: { // focus et blur autour (à utiliser sur des scènes fixes)
        focus: 8.0,
        aperture: 0.015,
        maxblur: 0.01,
      },
      effects: {
        enabled: true,
        skybox: {
          intensity: 0.8,
          tint: "#ffd9b3",
          texture: `${BASE_URL}/images/dioramas/work-planets/space_hdr_texture_of_stars.webp`,
        }
      }
    },
    {
      id: "work_planet-01",
      label: {
        fr: "À l'école...",
        en: "At school...",
        es: "En la escuela..."
      },
      emptyName: "work_planet-01",
      icon: `${BASE_URL}/icons/school.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Analog_Lovers.mp3`,
      sceneSound: `${BASE_URL}/sounds/Digital_Galaxy/Slowdrive_Frequencies.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "x",
      minDistance: 2.2,
      maxDistance: 4,
      minPolarAngle: 0.3,
      maxPolarAngle: 1.42,
      minAzimuthAngle: -1.24,
      maxAzimuthAngle: -2,
      enableZoom: true,
      children: [ // POIs enfant
        {
          id: "david_01",
          label: {
            fr: "çà bosse...",
            en: "It's working...",
            es: "¡Vamos allá!"
          },
          emptyName: "david_01",
          icon: `${BASE_URL}/icons/nerd-icon.webp`,
          ambientSound: `${BASE_URL}/sounds/Decode_The_Matrix/Mainframe_Pulse.mp3`,
          sceneSound: `${BASE_URL}/sounds/Decode_The_Matrix/Bypass_Reality.mp3`,
          zoom: 0.2,
          lookAxis: "x",
          minDistance: 0.01,
          maxDistance: 1.1,
          minPolarAngle: 1,
          maxPolarAngle: 1.27,
          minAzimuthAngle: -0.84,
          maxAzimuthAngle: 1.84,
          enableZoom: true,
          effects: {
            enabled: true,
            skybox: {
              intensity: 0.8,
              tint: "#ffd9b3",
              texture: `${BASE_URL}/images/dioramas/work-planets/space_hdr_texture_of_stars.webp`,
            }
          }
        }
      ],
      elements: [ // elements posssedant une animation dans le glb
        {
          name: "clouds_01",
          type: "mesh",
          clipName: "clouds_01_Action",
          autoplay: false,
          loop: false
        },
      ],
      dialogue: {
        characters: [
          { 
            id: "nerd", 
            name: { fr: "David", en: "David", es: "David" }, 
            image: `${BASE_URL}/icons/nerd-icon.webp` 
          }
        ],
        lines: [
          {
            time: 0.5,
            text: {
              fr: "Salut ! Bienvenue dans le diorama mon poulet.",
              en: "Hi! Welcome to the diorama.",
              es: "¡Hola! Bienvenido al diorama."
            },
            characterId: "nerd"
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
            characterId: "nerd"
          },
          {
            time: 12.5,
            text: {
                fr: "Allons voir ce qu’il se passe plus loin !",
                en: "Let's go and see what's happening further on!",
                es: "¡Vamos a ver qué pasa más allá!"
              },
            characterId: "nerd"
          }
        ]
      },
      effects: {
        enabled: true,
        skybox: {
          intensity: 0.8,
          tint: "#ffd9b3",
          texture: `${BASE_URL}/images/dioramas/work-planets/space_hdr_texture_of_stars.webp`,
        }
      }
    },
    {
      id: "work_planet-02",
      label: {
        fr: "En stage...",
        en: "On work placement...",
        es: "En prácticas..."
      },
      emptyName: "work_planet-02",
      icon: `${BASE_URL}/icons/village.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Smooth_by_Design.mp3`,
      sceneSound: `${BASE_URL}/sounds/Digital_Galaxy/Digital_Bossa.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "x",
      minDistance: 2.2,
      maxDistance: 4,
      minPolarAngle: 0.3,
      maxPolarAngle: 1.42,
      minAzimuthAngle: -1.24,
      maxAzimuthAngle: -2,
      enableZoom: true,
      children: [ // POIs enfant
        {
          id: "david_02",
          label: {
            fr: "çà bosse...",
            en: "It's working...",
            es: "¡Vamos allá!"
          },
          emptyName: "david_02",
          icon: `${BASE_URL}/icons/nerd-icon.webp`,
          ambientSound: `${BASE_URL}/sounds/Decode_The_Matrix/Quantum_Access.mp3`,
          sceneSound: `${BASE_URL}/sounds/Decode_The_Matrix/Neon_Encryption.mp3`,
          zoom: 0.2,
          lookAxis: "x",
          minDistance: 0.45,
          maxDistance: 1.1,
          minPolarAngle: 1,
          maxPolarAngle: 1.27,
          minAzimuthAngle: -0.64,
          maxAzimuthAngle: 1.84,
          enableZoom: true,
          effects: {
            enabled: true,
            skybox: {
              intensity: 0.8,
              tint: "#ffd9b3",
              texture: `${BASE_URL}/images/dioramas/work-planets/space_hdr_texture_of_stars.webp`,
            }
          }
        }
      ],
      elements: [ // elements posssedant une animation dans le glb
        {
          name: "clouds_02",
          type: "mesh",
          clipName: "clouds_02_Action",
          autoplay: false,
          loop: false
        },
      ],
      dialogue: {
        characters: [
          { 
            id: "nerd", 
            name: { fr: "David", en: "David", es: "David" }, 
            image: `${BASE_URL}/icons/nerd-icon.webp` 
          }
        ],
        lines: [
          {
            time: 0.5,
            text: {
              fr: "Salut ! Bienvenue dans le diorama mon poulet.",
              en: "Hi! Welcome to the diorama.",
              es: "¡Hola! Bienvenido al diorama."
            },
            characterId: "nerd"
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
            characterId: "nerd"
          },
          {
            time: 12.5,
            text: {
                fr: "Allons voir ce qu’il se passe plus loin !",
                en: "Let's go and see what's happening further on!",
                es: "¡Vamos a ver qué pasa más allá!"
              },
            characterId: "nerd"
          }
        ]
      },
      effects: {
        enabled: true,
        skybox: {
          intensity: 0.8,
          tint: "#ffd9b3",
          texture: `${BASE_URL}/images/dioramas/work-planets/space_hdr_texture_of_stars.webp`,
        }
      }
    },
    {
      id: "work_planet-03",
      label: {
        fr: "Travail temporaire...",
        en: "Temporary work...",
        es: "Trabajo temporal..."
      },
      emptyName: "work_planet-03",
      icon: `${BASE_URL}/icons/buildings-icon.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Midnight_Hardware.mp3`,
      sceneSound: `${BASE_URL}/sounds/Digital_Galaxy/Neon_Soul_Systems.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "x",
      minDistance: 2.2,
      maxDistance: 4,
      minPolarAngle: 0.3,
      maxPolarAngle: 1.42,
      minAzimuthAngle: -1.24,
      maxAzimuthAngle: -2,
      enableZoom: true,
      children: [ // POIs enfant
        {
          id: "david_03",
          label: {
            fr: "çà bosse...",
            en: "It's working...",
            es: "¡Vamos allá!"
          },
          emptyName: "david_03",
          icon: `${BASE_URL}/icons/nerd-icon.webp`,
          ambientSound: `${BASE_URL}/sounds/Decode_The_Matrix/Shadow_Firewall.mp3`,
          sceneSound: `${BASE_URL}/sounds/Decode_The_Matrix/Inject_The_Code.mp3`,
          zoom: 0.2,
          lookAxis: "x",
          minDistance: 0.45,
          maxDistance: 1.1,
          minPolarAngle: 1,
          maxPolarAngle: 1.27,
          minAzimuthAngle: -0.64,
          maxAzimuthAngle: 1.84,
          enableZoom: true,
          effects: {
            enabled: true,
            skybox: {
              intensity: 0.8,
              tint: "#ffd9b3",
              texture: `${BASE_URL}/images/dioramas/work-planets/space_hdr_texture_of_stars.webp`,
            }
          }
        }
      ],
      elements: [ // elements posssedant une animation dans le glb
        {
          name: "clouds_03",
          type: "mesh",
          clipName: "clouds_03_Action",
          autoplay: false,
          loop: false
        },
      ],
      dialogue: {
        characters: [
          { 
            id: "nerd", 
            name: { fr: "David", en: "David", es: "David" }, 
            image: `${BASE_URL}/icons/nerd-icon.webp` 
          }
        ],
        lines: [
          {
            time: 0.5,
            text: {
              fr: "Salut ! Bienvenue dans le diorama mon poulet.",
              en: "Hi! Welcome to the diorama.",
              es: "¡Hola! Bienvenido al diorama."
            },
            characterId: "nerd"
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
            characterId: "nerd"
          },
          {
            time: 12.5,
            text: {
                fr: "Allons voir ce qu’il se passe plus loin !",
                en: "Let's go and see what's happening further on!",
                es: "¡Vamos a ver qué pasa más allá!"
              },
            characterId: "nerd"
          }
        ]
      },
      effects: {
        enabled: true,
        skybox: {
          intensity: 0.8,
          tint: "#ffd9b3",
          texture: `${BASE_URL}/images/dioramas/work-planets/space_hdr_texture_of_stars.webp`,
        }
      }
    },
    {
      id: "work_planet-04",
      label: {
        fr: "Studio Web 3D...",
        en: "3D Web Studio...",
        es: "Estudio web 3D..."
      },
      emptyName: "work_planet-04",
      icon: `${BASE_URL}/icons/village_2.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Velvet_Circuits.mp3`,
      sceneSound: `${BASE_URL}/sounds/Digital_Galaxy/Plastic_Emotions.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "x",
      minDistance: 2.2,
      maxDistance: 4,
      minPolarAngle: 0.3,
      maxPolarAngle: 1.42,
      minAzimuthAngle: -1.24,
      maxAzimuthAngle: -2,
      enableZoom: true,
      children: [ // POIs enfant
        {
          id: "david_04",
          label: {
            fr: "çà bosse...",
            en: "It's working...",
            es: "¡Vamos allá!"
          },
          emptyName: "david_04",
          icon: `${BASE_URL}/icons/nerd-icon.webp`,
          ambientSound: `${BASE_URL}/sounds/Decode_The_Matrix/Override_the_Core.mp3`,
          sceneSound: `${BASE_URL}/sounds/Decode_The_Matrix/Glitch_Ritual.mp3`,
          zoom: 0.2,
          lookAxis: "x",
          minDistance: 0.45,
          maxDistance: 1.1,
          minPolarAngle: 1,
          maxPolarAngle: 1.27,
          minAzimuthAngle: -0.64,
          maxAzimuthAngle: 1.84,
          enableZoom: true,
          effects: {
            enabled: true,
            skybox: {
              intensity: 0.8,
              tint: "#ffd9b3",
              texture: `${BASE_URL}/images/dioramas/work-planets/space_hdr_texture_of_stars.webp`,
            }
          }
        }
      ],
      elements: [ // elements posssedant une animation dans le glb
        {
          name: "clouds_04",
          type: "mesh",
          clipName: "clouds_04_Action",
          autoplay: false,
          loop: false
        },
      ],
      dialogue: {
        characters: [
          { 
            id: "nerd", 
            name: { fr: "David", en: "David", es: "David" }, 
            image: `${BASE_URL}/icons/nerd-icon.webp` 
          }
        ],
        lines: [
          {
            time: 0.5,
            text: {
              fr: "Salut ! Bienvenue dans le diorama mon poulet.",
              en: "Hi! Welcome to the diorama.",
              es: "¡Hola! Bienvenido al diorama."
            },
            characterId: "nerd"
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
            characterId: "nerd"
          },
          {
            time: 12.5,
            text: {
                fr: "Allons voir ce qu’il se passe plus loin !",
                en: "Let's go and see what's happening further on!",
                es: "¡Vamos a ver qué pasa más allá!"
              },
            characterId: "nerd"
          }
        ]
      },
      effects: {
        enabled: true,
        skybox: {
          intensity: 0.8,
          tint: "#ffd9b3",
          texture: `${BASE_URL}/images/dioramas/work-planets/space_hdr_texture_of_stars.webp`,
        }
      }
    },
    {
      id: "work_planet-05",
      label: {
        fr: "Reconditionnons...",
        en: "Let's recondition...",
        es: "Reacondicionemos..."
      },
      emptyName: "work_planet-05",
      icon: `${BASE_URL}/icons/factory.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Afterglow_Funk.mp3`,
      sceneSound: `${BASE_URL}/sounds/Digital_Galaxy/Chill_Deluxe.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "x",
      minDistance: 2.2,
      maxDistance: 4,
      minPolarAngle: 0.3,
      maxPolarAngle: 1.42,
      minAzimuthAngle: -1.24,
      maxAzimuthAngle: -2,
      enableZoom: true,
      children: [ // POIs enfant
        {
          id: "david_05",
          label: {
            fr: "çà bosse...",
            en: "It's working...",
            es: "¡Vamos allá!"
          },
          emptyName: "david_05",
          icon: `${BASE_URL}/icons/nerd-icon.webp`,
          ambientSound: `${BASE_URL}/sounds/Decode_The_Matrix/Inject_The_Code.mp3`,
          sceneSound: `${BASE_URL}/sounds/Decode_The_Matrix/Shadow_Firewall.mp3`,
          zoom: 0.2,
          lookAxis: "x",
          minDistance: 0.45,
          maxDistance: 1.1,
          minPolarAngle: 1,
          maxPolarAngle: 1.27,
          minAzimuthAngle: -0.64,
          maxAzimuthAngle: 1.84,
          enableZoom: true,
          effects: {
            enabled: true,
            skybox: {
              intensity: 0.8,
              tint: "#ffd9b3",
              texture: `${BASE_URL}/images/dioramas/work-planets/space_hdr_texture_of_stars.webp`,
            }
          }
        }
      ],
      elements: [ // elements posssedant une animation dans le glb
        {
          name: "clouds_05",
          type: "mesh",
          clipName: "clouds_05_Action",
          autoplay: false,
          loop: false
        },
      ],
      dialogue: {
        characters: [
          { 
            id: "nerd", 
            name: { fr: "David", en: "David", es: "David" }, 
            image: `${BASE_URL}/icons/nerd-icon.webp` 
          }
        ],
        lines: [
          {
            time: 0.5,
            text: {
              fr: "Salut ! Bienvenue dans le diorama mon poulet.",
              en: "Hi! Welcome to the diorama.",
              es: "¡Hola! Bienvenido al diorama."
            },
            characterId: "nerd"
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
            characterId: "nerd"
          },
          {
            time: 12.5,
            text: {
                fr: "Allons voir ce qu’il se passe plus loin !",
                en: "Let's go and see what's happening further on!",
                es: "¡Vamos a ver qué pasa más allá!"
              },
            characterId: "nerd"
          }
        ]
      },
      effects: {
        enabled: true,
        skybox: {
          intensity: 0.8,
          tint: "#ffd9b3",
          texture: `${BASE_URL}/images/dioramas/work-planets/space_hdr_texture_of_stars.webp`,
        }
      }
    },
    {
      id: "work_planet-06",
      label: {
        fr: "L'usage de l'eau...",
        en: "Water usage...",
        es: "El uso del agua..."
      },
      emptyName: "work_planet-06",
      icon: `${BASE_URL}/icons/hangar.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Chill_Deluxe.mp3`,
      sceneSound: `${BASE_URL}/sounds/Digital_Galaxy/Afterglow_Funk.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "x",
      minDistance: 2.2,
      maxDistance: 4,
      minPolarAngle: 0.3,
      maxPolarAngle: 1.42,
      minAzimuthAngle: -1.24,
      maxAzimuthAngle: -2,
      enableZoom: true,
      children: [ // POIs enfant
        {
          id: "david_06",
          label: {
            fr: "çà bosse...",
            en: "It's working...",
            es: "¡Vamos allá!"
          },
          emptyName: "david_06",
          icon: `${BASE_URL}/icons/nerd-icon.webp`,
          ambientSound: `${BASE_URL}/sounds/Decode_The_Matrix/Neon_Encryption.mp3`,
          sceneSound: `${BASE_URL}/sounds/Decode_The_Matrix/Quantum_Access.mp3`,
          zoom: 0.2,
          lookAxis: "x",
          minDistance: 0.45,
          maxDistance: 1.1,
          minPolarAngle: 1,
          maxPolarAngle: 1.27,
          minAzimuthAngle: -0.64,
          maxAzimuthAngle: 1.84,
          enableZoom: true,
          effects: {
            enabled: true,
            skybox: {
              intensity: 0.8,
              tint: "#ffd9b3",
              texture: `${BASE_URL}/images/dioramas/work-planets/space_hdr_texture_of_stars.webp`,
            }
          }
        }
      ],
      elements: [ // elements posssedant une animation dans le glb
        {
          name: "clouds_06",
          type: "mesh",
          clipName: "clouds_06_Action",
          autoplay: false,
          loop: false
        },
      ],
      dialogue: {
        characters: [
          { 
            id: "nerd", 
            name: { fr: "David", en: "David", es: "David" }, 
            image: `${BASE_URL}/icons/nerd-icon.webp` 
          }
        ],
        lines: [
          {
            time: 0.5,
            text: {
              fr: "Salut ! Bienvenue dans le diorama mon poulet.",
              en: "Hi! Welcome to the diorama.",
              es: "¡Hola! Bienvenido al diorama."
            },
            characterId: "nerd"
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
            characterId: "nerd"
          },
          {
            time: 12.5,
            text: {
                fr: "Allons voir ce qu’il se passe plus loin !",
                en: "Let's go and see what's happening further on!",
                es: "¡Vamos a ver qué pasa más allá!"
              },
            characterId: "nerd"
          }
        ]
      },
      effects: {
        enabled: true,
        skybox: {
          intensity: 0.8,
          tint: "#ffd9b3",
          texture: `${BASE_URL}/images/dioramas/work-planets/space_hdr_texture_of_stars.webp`,
        }
      }
    },
    {
      id: "work_planet-07",
      label: {
        fr: "Graines de soja...",
        en: "Soybeans...",
        es: "Semillas de soja..."
      },
      emptyName: "work_planet-07",
      icon: `${BASE_URL}/icons/silos.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Plastic_Emotions.mp3`,
      sceneSound: `${BASE_URL}/sounds/Digital_Galaxy/Velvet_Circuits.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "x",
      minDistance: 2.2,
      maxDistance: 4,
      minPolarAngle: 0.3,
      maxPolarAngle: 1.42,
      minAzimuthAngle: -1.24,
      maxAzimuthAngle: -2,
      enableZoom: true,
      children: [ // POIs enfant
        {
          id: "david_07",
          label: {
            fr: "çà bosse...",
            en: "It's working...",
            es: "¡Vamos allá!"
          },
          emptyName: "david_07",
          icon: `${BASE_URL}/icons/nerd-icon.webp`,
          ambientSound: `${BASE_URL}/sounds/Decode_The_Matrix/Bypass_Reality.mp3`,
          sceneSound: `${BASE_URL}/sounds/Decode_The_Matrix/Mainframe_Pulse.mp3`,
          zoom: 0.2,
          lookAxis: "x",
          minDistance: 0.45,
          maxDistance: 1.1,
          minPolarAngle: 1,
          maxPolarAngle: 1.27,
          minAzimuthAngle: -0.64,
          maxAzimuthAngle: 1.84,
          enableZoom: true,
          effects: {
            enabled: true,
            skybox: {
              intensity: 0.8,
              tint: "#ffd9b3",
              texture: `${BASE_URL}/images/dioramas/work-planets/space_hdr_texture_of_stars.webp`,
            }
          }
        }
      ],
      elements: [ // elements posssedant une animation dans le glb
        {
          name: "clouds_07",
          type: "mesh",
          clipName: "clouds_07_Action",
          autoplay: false,
          loop: false
        },
      ],
      dialogue: {
        characters: [
          { 
            id: "nerd", 
            name: { fr: "David", en: "David", es: "David" }, 
            image: `${BASE_URL}/icons/nerd-icon.webp` 
          }
        ],
        lines: [
          {
            time: 0.5,
            text: {
              fr: "Salut ! Bienvenue dans le diorama mon poulet.",
              en: "Hi! Welcome to the diorama.",
              es: "¡Hola! Bienvenido al diorama."
            },
            characterId: "nerd"
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
            characterId: "nerd"
          },
          {
            time: 12.5,
            text: {
                fr: "Allons voir ce qu’il se passe plus loin !",
                en: "Let's go and see what's happening further on!",
                es: "¡Vamos a ver qué pasa más allá!"
              },
            characterId: "nerd"
          }
        ]
      },
      effects: {
        enabled: true,
        skybox: {
          intensity: 0.8,
          tint: "#ffd9b3",
          texture: `${BASE_URL}/images/dioramas/work-planets/space_hdr_texture_of_stars.webp`,
        }
      }
    },
  ],
  videos: [ // pour les videostextures
    // {
    //   name: "TVScreen",
    //   src: `${BASE_URL}/videos/test_street/Cab_Calloway_1933.mp4`,
    //   materialIndex: 0,
    //   loop: true,
    //   muted: true,
    // },
    // {
    //   name: "TVScreen",
    //   src: "https://webdiorama-proxy.david-liger-pro.workers.dev/assets/1/spritesheets/spritesheet_TV-screen.webp",
    //   type: "spritesheet",
    //   spritesheet: {
    //     columns: 8,
    //     rows: 6,
    //     totalFrames: 48,
    //     fps: 24,
    //     mode: "loop"
    //   }
    // },
    // {
    //   name: "TVScreen2",
    //   src: `${BASE_URL}/videos/test_street/Cab_Calloway_Minnie.mp4`,
    //   autoplay: true,
    // },
  ],
  lights: [ // règlages des lumières
    {
      type: "ambient",
      color: 0xffffff,
      intensity: 0.6,
    },
    {
      type: "spot",
      emptyName: "spot_01", // pointe vers spot_01_target (ajout de _target derrière le nom du emptyname)
      color: 0xfff2cc,
      intensity: 1.5,
      distance: 10,
      angle: Math.PI / 2,
      penumbra: 0.3,
    },
    {
      type: "spot",
      emptyName: "spot_02",
      color: 0xfff2cc,
      intensity: 1.5,
      distance: 8,
      angle: Math.PI / 2,
      penumbra: 0.5,
    },
    {
      type: "spot",
      emptyName: "spot_03",
      color: 0xfff2cc,
      intensity: 1.5,
      distance: 8,
      angle: Math.PI / 2,
      penumbra: 0.5,
    },
    {
      type: "spot",
      emptyName: "spot_04",
      color: 0xfff2cc,
      intensity: 1.5,
      distance: 8,
      angle: Math.PI / 2,
      penumbra: 0.5,
    },
    {
      type: "spot",
      emptyName: "spot_05",
      color: 0xfff2cc,
      intensity: 1.5,
      distance: 8,
      angle: Math.PI / 2,
      penumbra: 0.5,
    },
    {
      type: "spot",
      emptyName: "spot_06",
      color: 0xfff2cc,
      intensity: 1.5,
      distance: 8,
      angle: Math.PI / 2,
      penumbra: 0.5,
    },
    {
      type: "spot",
      emptyName: "spot_07",
      color: 0xfff2cc,
      intensity: 1.5,
      distance: 8,
      angle: Math.PI / 2,
      penumbra: 0.5,
    },
    {
      type: "spot",
      emptyName: "spot_08",
      color: 0xfff2cc,
      intensity: 1.5,
      distance: 8,
      angle: Math.PI / 2,
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
