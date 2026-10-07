import type { DioramaConfig3DWithPostProcessing } from "@/types/diorama";

const BASE_URL = process.env.NEXT_PUBLIC_ASSET_BASE_URL || "";

export const curriculum: DioramaConfig3DWithPostProcessing = {
  glb: `${BASE_URL}/models/work-planets.glb`,
  loaderImage: `${BASE_URL}/images/dioramas/work-planets/preview.webp`,
  autoplay: true, // ← Mode tutoriel automatique ou pas
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
    { name: "screen-monitor-actual", color: 0x80f6ff, intensity: 0.05 },
    { name: "screen-monitor-school", color: 0x80f6ff, intensity: 0.05 },
    { name: "screen-monitor-stage", color: 0x80f6ff, intensity: 0.05 },
    { name: "screen-monitor-biotrade", color: 0x80f6ff, intensity: 0.05 },
    { name: "screen-monitor-909", color: 0x80f6ff, intensity: 0.05 },
    { name: "screen-monitor-studio", color: 0x80f6ff, intensity: 0.05 },
    { name: "screen-monitor-silos", color: 0x80f6ff, intensity: 0.05 },
    { name: "screen-monitor-start", color: 0x80f6ff, intensity: 0.05 },
    { name: "bulb_01", color: 0xfff2cc, intensity: 0.8 },
    { name: "bulb_02", color: 0xfff2cc, intensity: 0.8 },
    { name: "bulb_03", color: 0xfff2cc, intensity: 0.8 },
    { name: "bulb_04", color: 0xfff2cc, intensity: 0.8 },
    { name: "bulb_05", color: 0xfff2cc, intensity: 0.8 },
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
      sceneSound: `${BASE_URL}/sounds/voices/voix-POI-start.mp3`,
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
          autoplay: true,
          icon: `${BASE_URL}/icons/nerd-icon.webp`,
          ambientSound: `${BASE_URL}/sounds/Decode_The_Matrix/Decrypt_the_Night.mp3`,
          sceneSound: `${BASE_URL}/sounds/voices/voix-POI-david_00.mp3`,
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
              name: "perso_david_00",
              type: "armature",
              clipName: "perso_david_00_action",
              autoplay: true,
              loop: false,
              placeholderMesh: "perso_david_00_placeholder",
              transitionFrames: 8
            }
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
                time: 0.1,
                text: {
                  fr: "WebDioramaLoader est un projet personnel",
                  en: "WebDioramaLoader is a personal project",
                  es: "WebDioramaLoader es un proyecto personal"
                },
                characterId: "nerd"
              },
              {
                time: 3.0,
                text: [
                  {
                    fr: "c'est un framework de visualisation 3D pour le web",
                    en: "It is a 3D visualisation framework for the web",
                    es: "Es un marco de visualización 3D para la web"
                  },
                  {
                    fr: "créant des expériences narratives immersives",
                    en: "creating immersive narrative experiences",
                    es: "creando experiencias narrativas inmersivas"
                  }
                ],
                characterId: "nerd"
              },
              {
                time: 8.0,
                text: {
                    fr: "Développé en Next.js et Three.js",
                    en: "Developed in Next.js and Three.js",
                    es: "Desarrollado en Next.js y Three.j"
                  },
                characterId: "nerd"
              },
              {
                time: 11.0,
                text: [
                  {
                    fr: "il offre une navigation par points d'intérêt",
                    en: "it offers navigation by points of interest",
                    es: "Ofrece navegación por puntos de interés"
                  },
                  {
                    fr: "des transitions caméra fluides",
                    en: "smooth camera transitions",
                    es: "transiciones fluidas de cámaras"
                  },
                  {
                    fr: "et un système audio avancé",
                    en: "and an advanced audio system",
                    es: "y un sistema de audio avanzado"
                  },
                ],
                characterId: "nerd"
              },
              {
                time: 18.0,
                text: [
                  {
                    fr: "Le framework intègre : post-processing WebGL",
                    en: "The framework integrates: WebGL post-processing",
                    es: "El marco integra: posprocesamiento WebGL"
                  },
                  {
                    fr: "stockage des assets en cache pour usage hors ligne",
                    en: "caching assets for offline use",
                    es: "almacenamiento de activos en caché para uso sin conexión"
                  },
                ],
                characterId: "nerd"
              },
              {
                time: 23.0,
                text: {
                    fr: "et supporte l'animation 2D, via des spritesheets et des vidéos",
                    en: "and supports 2D animation via spritesheets and videoss",
                    es: "y admite animación 2D, a través de hojas de sprites y vídeos."
                  },
                characterId: "nerd"
              },
              {
                time: 27.0,
                text: {
                    fr: "avec un système de dialogue interactifs",
                    en: "with an interactive dialogue system",
                    es: "con un sistema de diálogo interactivo"
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
        }
      ],
      elements: [ // elements posssedant une animation dans le glb
        {
          name: "clouds_00",
          type: "mesh",
          clipName: "clouds_00_Action",
          autoplay: false,
          loop: false
        }
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
            time: 0.1,
            text: {
              fr: "Bonjour et bienvenue dans mon folio",
              en: "Hello and welcome to my portfolio",
              es: "Hola y bienvenidos a mi portafolio"
            },
            characterId: "nerd"
          },
          {
            time: 2.0,
            text: [
              {
                fr: "Vous pouvez vous déplacer dans la galaxie de mes expériences",
                en: "You can travel through the galaxy of my experiences",
                es: "Puedes moverte por la galaxia de mis experiencias"
              },
              {
                fr: "en utilisant la barre de boutons situé en haut ou à gauche de cet écran",
                en: "using the button bar at the top or left of this screen",
                es: "utilizando la barra de botones situada en la parte superior o izquierda de esta pantalla"
              }
            ],
            characterId: "nerd"
          },
          {
            time: 8.5,
            text: {
                fr: "Pour chaque planète un bouton \"ça bosse\", vous donnera plus de précisions sur mes missions",
                en: "For each planet, a ‘It's working’ button will give you more details about my missions",
                es: "Para cada planeta, un botón «ça bosse» (funciona) le dará más detalles sobre mis misiones"
              },
            characterId: "nerd"
          },
          {
            time: 13.5,
            text: [
              {
                fr: "À chaque étape de mon parcours, une fenêtre apparaîtra en haut de l'écran",
                en: "At each stage of my journey, a window will appear at the top of the screen",
                es: "En cada etapa de mi recorrido, aparecerá una ventana en la parte superior de la pantalla"
              },
              {
                fr: "et vous permettra d'accéder à plus de précisions",
                en: "and will allow you to access more details",
                es: "y le permitirá acceder a más detalles"
              }
            ],
            characterId: "nerd"
          },
          {
            time: 20,
            text: {
                fr: "Vous trouverez mon CV en cliquant sur le bouton à droite",
                en: "Let's go and see what's happening further on!",
                es: "¡Vamos a ver qué pasa más allá!"
              },
            characterId: "nerd"
          },
          {
            time: 23,
            text: {
                fr: "Enfin vous trouverez plus d'informations en cliquant sur le bouton \"i\" en haut à droite",
                en: "Finally, you can find more information by clicking on the ‘i’ button at the top right",
                es: "Encontrará mi CV haciendo clic en el botón de la derecha"
              },
            characterId: "nerd"
          },
          {
            time: 28,
            text: {
                fr: "Bonne balade et belle journée !",
                en: "Have a nice walk and a lovely day!",
                es: "¡Que disfrutes del paseo y que tengas un buen día!"
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
      autoplay: true,
      icon: `${BASE_URL}/icons/school.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Analog_Lovers.mp3`,
      sceneSound: `${BASE_URL}/sounds/voices/voix-POI-work_planet-01.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "x",
      minDistance: 2.2,
      maxDistance: 4,
      minPolarAngle: 0.6,
      maxPolarAngle: 1.42,
      minAzimuthAngle: -1.24,
      maxAzimuthAngle: -1.8,
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
          autoplay: true,
          icon: `${BASE_URL}/icons/nerd-icon.webp`,
          ambientSound: `${BASE_URL}/sounds/Decode_The_Matrix/Mainframe_Pulse.mp3`,
          sceneSound: `${BASE_URL}/sounds/voices/voix-POI-david_01.mp3`,
          zoom: 0.2,
          lookAxis: "x",
          minDistance: 0.35,
          maxDistance: 0.58,
          minPolarAngle: 1,
          maxPolarAngle: 1.27,
          minAzimuthAngle: -1.14,
          maxAzimuthAngle: 1.94,
          enableZoom: true,
          elements: [
            {
              name: "perso_david_01",
              type: "armature",
              clipName: "perso_david_01_action",
              autoplay: false,
              loop: false,
              placeholderMesh: "perso_david_01_placeholder",
              transitionFrames: 8
            }
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
                time: 0.1,
                text: {
                  fr: "À l’ENI école informatique j’ai obtenu un Bac+2 de Développeur Web et Web Mobile",
                  en: "At ENI computer school, I obtained a two-year degree in Web and Mobile Web Development",
                  es: "En la escuela de informática ENI obtuve un título de dos años como desarrollador web y web móvil"
                },
                characterId: "nerd"
              },
              {
                time: 5.0,
                text: [
                  {
                    fr: "Cette formation m’a permis d’acquérir des bases solides en programmation",
                    en: "This training course enabled me to acquire a solid foundation in programming",
                    es: "Esta formación me ha permitido adquirir una base sólida en programación"
                  },
                  {
                    fr: "en conception d’interfaces",
                    en: "in interface design",
                    es: "en diseño de interfaces"
                  },
                  {
                    fr: "et en développement full-stack",
                    en: "and full-stack development",
                    es: "y desarrollo full-stack"
                  }
                ],
                characterId: "nerd"
              },
              {
                time: 12.0,
                text: {
                    fr: "J’ai ensuite poursuivi à MyDigitalSchool",
                    en: "I then continued at MyDigitalSchool",
                    es: "Después continué en MyDigitalSchool"
                  },
                characterId: "nerd"
              },
              {
                time: 15.0,
                text: 
                  {
                    fr: "où j’ai obtenu un Bac+3 de Concepteur-Développeur d’Applications",
                    en: "where I obtained a Bachelor's degree in Application Design and Development",
                    es: "donde obtuve un título universitario de tres años como diseñador y desarrollador de aplicaciones"
                  },
                characterId: "nerd"
              },
              {
                time: 19.0,
                text: {
                    fr: "avec un apprentissage orienté projets concrets et technologies modernes",
                    en: "with project-based learning focused on real-world applications and modern technologies",
                    es: "con un aprendizaje orientado a proyectos concretos y tecnologías modernas"
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
            time: 0.1,
            text: {
              fr: "L’ENI école informatique forme aux métiers du développement",
              en: "ENI computer school provides training in development professions",
              es: "La escuela informática ENI imparte formación en profesiones relacionadas con el desarrollo"
            },
            characterId: "nerd"
          },
          {
            time: 3.0,
            text: [
              {
                fr: "et des technologies numériques",
                en: "and digital technologies",
                es: "y tecnologías digitales"
              },
              {
                fr: "Son enseignement est orienté pratique",
                en: "His teaching is practice-oriented",
                es: "Su enseñanza está orientada a la práctica."
              },
              {
                fr: "avec un fort ancrage technique",
                en: "with a strong technical foundation",
                es: "con un sólido arraigo técnico"
              }
            ],
            characterId: "nerd"
          },
          {
            time: 9.0,
            text: {
                fr: "MyDigitalSchool est une école du digital",
                en: "MyDigitalSchool is a digital school",
                es: "MyDigitalSchool es una escuela digital"
              },
            characterId: "nerd"
          },
          {
            time: 12.0,
            text: {
                fr: "proposant des formations web, design et marketing numérique",
                en: "offering training in web, design and digital marketing",
                es: "que ofrece formación en web, diseño y marketing digital"
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
      autoplay: true,
      icon: `${BASE_URL}/icons/village.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Smooth_by_Design.mp3`,
      sceneSound: `${BASE_URL}/sounds/voices/voix-POI-work_planet-02.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "z",
      minDistance: 2.2,
      maxDistance: 4,
      minPolarAngle: 0.3,
      maxPolarAngle: 1.42,
      minAzimuthAngle: 0.24,
      maxAzimuthAngle: 4,
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
          autoplay: true,
          icon: `${BASE_URL}/icons/nerd-icon.webp`,
          ambientSound: `${BASE_URL}/sounds/Decode_The_Matrix/Quantum_Access.mp3`,
          sceneSound: `${BASE_URL}/sounds/voices/voix-POI-david_02.mp3`,
          zoom: 0.2,
          lookAxis: "x",
          minDistance: 0.45,
          maxDistance: 1.1,
          minPolarAngle: 1,
          maxPolarAngle: 1.27,
          minAzimuthAngle: -0.64,
          maxAzimuthAngle: 2.84,
          enableZoom: true,
          elements: [
            {
              name: "perso_david_02",
              type: "armature",
              clipName: "perso_david_02_action",
              autoplay: false,
              loop: false,
              placeholderMesh: "perso_david_02_placeholder",
              transitionFrames: 8
            }
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
                time: 0.1,
                text: {
                  fr: "Terre de Pixels est une agence de communication multimédia",
                  en: "Terre de Pixels is a multimedia communications agency",
                  es: "Terre de Pixels es una agencia de comunicación multimedia"
                },
                characterId: "nerd"
              },
              {
                time: 3.0,
                text: 
                  {
                    fr: "créative et orientée production web",
                    en: "creative and web production-oriented",
                    es: "creativa y orientada a la producción web"
                  },
                characterId: "nerd"
              },
              {
                time: 6.0,
                text: 
                  {
                    fr: "J’y ai développé un plugin PHP pour la gestion du temps de travail sur WordPress",
                    en: "I developed a PHP plugin for managing working hours on WordPress",
                    es: "Desarrollé un plugin PHP para la gestión del tiempo de trabajo en WordPress"
                  },
                characterId: "nerd"
              },
              {
                time: 10.0,
                text: 
                  {
                    fr: "et conçu plusieurs interfaces utilisateurs",
                    en: "and designed several user interfaces",
                    es: "y diseñado varias interfaces de usuario"
                  },
                characterId: "nerd"
              },
              {
                time: 12.5,
                text: 
                  {
                    fr: "Je mettais en place une gestion des données en temps réel",
                    en: "I was setting up real-time data management",
                    es: "Estaba implementando un sistema de gestión de datos en tiempo real"
                  },
                characterId: "nerd"
              },
              {
                time: 15.0,
                text: {
                    fr: "pour répondre aux besoins de l’agence",
                    en: "to meet the agency's needs",
                    es: "para satisfacer las necesidades de la agencia"
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
              fr: "Terre de Pixels est une agence de communication basée dans le Maine-et-Loire",
              en: "Terre de Pixels is a communications agency based in Maine-et-Loire",
              es: "Terre de Pixels es una agencia de comunicación con sede en Maine-et-Loire"
            },
            characterId: "nerd"
          },
          {
            time: 4.5,
            text: [
              {
                fr: "Elle conçoit des supports graphiques",
                en: "She designs graphic materials",
                es: "Diseña soportes gráficos"
              },
              {
                fr: "des contenus vidéo",
                en: "video content",
                es: "contenidos de vídeo"
              },
              {
                fr: "et des solutions web sur-mesure",
                en: "and tailor-made web solutions",
                es: "y soluciones web a medida"
              }
            ],
            characterId: "nerd"
          },
          {
            time: 10.5,
            text: {
                fr: "Son ambition : accompagner chaque entreprise",
                en: "His ambition: to support every company",
                es: "Su ambición: acompañar a cada empresa"
              },
            characterId: "nerd"
          },
          {
            time: 13.0,
            text: {
                fr: "pour renforcer sa visibilité et son image",
                en: "to enhance its visibility and image",
                es: "para reforzar su visibilidad y su imagen"
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
      autoplay: true,
      icon: `${BASE_URL}/icons/buildings-icon.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Midnight_Hardware.mp3`,
      sceneSound: `${BASE_URL}/sounds/voices/voix-POI-work_planet-03.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "x",
      minDistance: 1.8,
      maxDistance: 4,
      minPolarAngle: 0.9,
      maxPolarAngle: 1.62,
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
          autoplay: true,
          icon: `${BASE_URL}/icons/nerd-icon.webp`,
          ambientSound: `${BASE_URL}/sounds/Decode_The_Matrix/Shadow_Firewall.mp3`,
          sceneSound: `${BASE_URL}/sounds/voices/voix-POI-david_03.mp3`,
          zoom: 0.2,
          lookAxis: "x",
          minDistance: 0.45,
          maxDistance: 0.62,
          minPolarAngle: 1,
          maxPolarAngle: 1.27,
          minAzimuthAngle: -2.24,
          maxAzimuthAngle: 1.54,
          enableZoom: true,
          elements: [
            {
              name: "perso_david_03",
              type: "armature",
              clipName: "perso_david_03_action",
              autoplay: false,
              loop: false,
              placeholderMesh: "perso_david_03_placeholder",
              transitionFrames: 8
            }
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
                time: 0.1,
                text: {
                  fr: "Actual est un acteur majeur des ressources humaines en France",
                  en: "Actual is a major player in human resources in France",
                  es: "Actual es una empresa líder en recursos humanos en Francia"
                },
                characterId: "nerd"
              },
              {
                time: 3.0,
                text: 
                  {
                    fr: "spécialisé dans l’emploi et l’accompagnement",
                    en: "specialising in employment and support",
                    es: "especializado en empleo y acompañamiento"
                  },
                characterId: "nerd"
              },
              {
                time: 6.0,
                text: {
                    fr: "J’ai participé à la modernisation d’un SaaS de gestion RH",
                    en: "I participated in the modernisation of an HR management SaaS solution",
                    es: "Participé en la modernización de un SaaS de gestión de recursos humanos"
                  },
                characterId: "nerd"
              },
              {
                time: 9.0,
                text: 
                  {
                    fr: "et au développement d’applications full-stack dédiées aux tests et outils internes",
                    en: "and the development of full-stack applications dedicated to internal testing and tools",
                    es: "y al desarrollo de aplicaciones full-stack dedicadas a pruebas y herramientas internas"
                  },
                characterId: "nerd"
              },
              {
                time: 13.0,
                text: {
                    fr: "Je réalisais aussi l’optimisation de bases de données",
                    en: "I also carried out database optimisation",
                    es: "También me encargaba de la optimización de bases de datos"
                  },
                characterId: "nerd"
              },
              {
                time: 16.0,
                text: {
                    fr: "la maintenance",
                    en: "maintenance",
                    es: "el mantenimiento"
                  },
                characterId: "nerd"
              },
              {
                time: 17.5,
                text: {
                    fr: "et l’analyse technique des besoins",
                    en: "and technical analysis of requirements",
                    es: "y el análisis técnico de las necesidades"
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
            text: [
              {
                fr: "Actual est un groupe français spécialisé dans l’emploi",
                en: "Actual is a French group specialising in employment",
                es: "Actual es un grupo francés especializado en empleo"
              },
              {
                fr: "l’intérim et l’accompagnement des talents",
                en: "la gestión temporal y el acompañamiento de talentos",
                es: "temporary staffing and talent support"
              }
            ],
            characterId: "nerd"
          },
          {
            time: 5.5,
            text: [
              {
                fr: "Il propose un large ensemble de services RH",
                en: "It offers a wide range of HR services",
                es: "Ofrece una amplia gama de servicios de recursos humanos"
              },
              {
                fr: "destinés aux entreprises comme aux candidats",
                en: "intended for companies and candidates alike",
                es: "destinados tanto a empresas como a candidatos"
              }
            ],
            characterId: "nerd"
          },
          {
            time: 10.5,
            text: {
                fr: "Son objectif est simple",
                en: "His objective is straightforward",
                es: "Su objetivo es sencillo"
              },
            characterId: "nerd"
          },
          {
            time: 12.5,
            text: {
                fr: "faciliter l’accès à un emploi durable sur tout le territoire",
                en: "facilitate access to sustainable employment throughout the country",
                es: "facilitar el acceso a un empleo sostenible en todo el territorio"
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
      autoplay: true,
      icon: `${BASE_URL}/icons/village_2.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Velvet_Circuits.mp3`,
      sceneSound: `${BASE_URL}/sounds/voices/voix-POI-work_planet-04.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "x",
      minDistance: 2,
      maxDistance: 4,
      minPolarAngle: 0.8,
      maxPolarAngle: 1.42,
      minAzimuthAngle: -2.34,
      maxAzimuthAngle: 1.54,
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
          autoplay: true,
          icon: `${BASE_URL}/icons/nerd-icon.webp`,
          ambientSound: `${BASE_URL}/sounds/Decode_The_Matrix/Override_the_Core.mp3`,
          sceneSound: `${BASE_URL}/sounds/voices/voix-POI-david_04.mp3`,
          zoom: 0.2,
          lookAxis: "x",
          minDistance: 0.45,
          maxDistance: 1.1,
          minPolarAngle: 1,
          maxPolarAngle: 1.27,
          minAzimuthAngle: -2.84,
          maxAzimuthAngle: 0.64,
          enableZoom: true,
          elements: [
            {
              name: "perso_david_04",
              type: "armature",
              clipName: "perso_david_04_action",
              autoplay: false,
              loop: false,
              placeholderMesh: "perso_david_04_placeholder",
              transitionFrames: 8
            }
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
                time: 0.1,
                text: {
                  fr: "DL Studio Web est une agence orientée web 3D",
                  en: "DL Studio Web is a 3D web-oriented agency",
                  es: "DL Studio Web es una agencia especializada en web 3D"
                },
                characterId: "nerd"
              },
              {
                time: 3.0,
                text: {
                  fr: "dédiée à la création d’expériences interactives",
                  en: "dedicated to creating interactive experiences",
                  es: "dedicada a la creación de experiencias interactivas"
                },
                characterId: "nerd"
              },
              {
                time: 6.5,
                text: [
                  {
                    fr: "J’y ai développé des applications full-stack",
                    en: "I developed full-stack applications there",
                    es: "Allí desarrollé aplicaciones full-stack"
                  },
                  {
                    fr: "et expérimenté autour de Three.js et WebGL",
                    en: "and experienced with Three.js and WebGL",
                    es: "y con experiencia en Three.js y WebGL"
                  }
                ],
                characterId: "nerd"
              },
              {
                time: 12.0,
                text: {
                    fr: "incluant la création d’un framework interne pour le rendu 3D",
                    en: "including the creation of an internal framework for 3D rendering",
                    es: "incluyendo la creación de un marco interno para el renderizado 3D"
                  },
                characterId: "nerd"
              },
              {
                time: 15.5,
                text: {
                    fr: "Je gérais également l’activité",
                    en: "I also managed the business",
                    es: "También gestionaba la actividad"
                  },
                characterId: "nerd"
              },
              {
                time: 17.5,
                text: {
                    fr: "la communication",
                    en: "communication",
                    es: "la comunicación"
                  },
                characterId: "nerd"
              },
              {
                time: 19.0,
                text: {
                    fr: "et la promotion de l’agence",
                    en: "and the promotion of the agency",
                    es: "y la promoción de la agencia"
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
              fr: "DL Studio Web est une entreprise que j'ai fondé en 2022",
              en: "DL Studio Web is a company I founded in 2022",
              es: "DL Studio Web es una empresa que fundé en 2022"
            },
            characterId: "nerd"
          },
          {
            time: 3.5,
            text: {
              fr: "afin de proposer aux acteurs économiques locaux",
              en: "in order to offer local economic players",
              es: "con el fin de ofrecer a los agentes económicos locales"
            },
            characterId: "nerd"
          },
          {
            time: 5.5,
            text: {
                fr: "des prestation de communication originales",
                en: "original communication services",
                es: "servicios de comunicación originales"
              },
            characterId: "nerd"
          },
          {
            time:8.0,
            text: {
                fr: "et décalées grâce à des sites web en 3D",
                en: "and offset thanks to 3D websites",
                es: "y desplazadas gracias a sitios web en 3D"
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
      autoplay: true,
      icon: `${BASE_URL}/icons/factory.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Afterglow_Funk.mp3`,
      sceneSound: `${BASE_URL}/sounds/voices/voix-POI-work_planet-05.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "x",
      minDistance: 2.2,
      maxDistance: 3.5,
      minPolarAngle: 0.5,
      maxPolarAngle: 1.42,
      minAzimuthAngle: -3.64,
      maxAzimuthAngle: 0.84,
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
          autoplay: true,
          icon: `${BASE_URL}/icons/nerd-icon.webp`,
          ambientSound: `${BASE_URL}/sounds/Decode_The_Matrix/Inject_The_Code.mp3`,
          sceneSound: `${BASE_URL}/sounds/voices/voix-POI-david_05.mp3`,
          zoom: 0.2,
          lookAxis: "x",
          minDistance: 0.45,
          maxDistance: 1.1,
          minPolarAngle: 1,
          maxPolarAngle: 1.27,
          minAzimuthAngle: -3.64,
          maxAzimuthAngle: -0.44,
          enableZoom: true,
          elements: [
            {
              name: "perso_david_05",
              type: "armature",
              clipName: "perso_david_05_action",
              autoplay: false,
              loop: false,
              placeholderMesh: "perso_david_05_placeholder",
              transitionFrames: 8
            }
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
                time: 0.1,
                text: {
                  fr: "909 développe des solutions digitales variées pour ses clients",
                  en: "909 develops a variety of digital solutions for its clients",
                  es: "909 desarrolla diversas soluciones digitales para sus clientes"
                },
                characterId: "nerd"
              },
              {
                time: 3.5,
                text: {
                  fr: "allant des ERP aux plateformes e-commerce",
                  en: "ranging from ERP systems to e-commerce platforms",
                  es: "desde ERP hasta plataformas de comercio electrónico"
                },
                characterId: "nerd"
              },
              {
                time: 6.0,
                text: 
                  {
                    fr: "J’y ai encadré une équipe tout en concevant et maintenant",
                    en: "I managed a team there while designing and maintaining",
                    es: "Allí dirigí un equipo mientras diseñaba y mantenía"
                  },
                characterId: "nerd"
              },
              {
                time: 9.0,
                text: 
                  {
                    fr: "des applications web en MERN et LAMP",
                    en: "MERN and LAMP web applications",
                    es: "aplicaciones web en MERN y LAMP"
                  },
                characterId: "nerd"
              },
              {
                time: 11.0,
                text: 
                  {
                    fr: "ainsi que des applications mobiles",
                    en: "as well as mobile applications",
                    es: "así como aplicaciones móviles"
                  },
                characterId: "nerd"
              },
              {
                time: 13.5,
                text: 
                  {
                    fr: "Je m’occupais du DevOps",
                    en: "I was in charge of DevOps",
                    es: "Me encargaba de DevOps"
                  },
                characterId: "nerd"
              },
              {
                time: 15.0,
                text: {
                    fr: "de la gestion serveur",
                    en: "server management",
                    es: "de la gestión del servidor"
                  },
                characterId: "nerd"
              },
              {
                time: 16.5,
                text: {
                    fr: "du ticketing",
                    en: "ticketing",
                    es: "de la venta de entradas"
                  },
                characterId: "nerd"
              },
              {
                time: 17.5,
                text: {
                    fr: "et de la revue de code pour garantir la qualité des livrables",
                    en: "and code review to ensure the quality of deliverables",
                    es: "y revisión del código para garantizar la calidad de los entregables"
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
            time: 0.1,
            text: {
              fr: "Itancia est un groupe spécialisé dans les technologies de communication",
              en: "Itancia is a group specialising in communication technologies",
              es: "Itancia es un grupo especializado en tecnologías de la comunicación"
            },
            characterId: "nerd"
          },
          {
            time: 5.0,
            text: [
              {
                fr: "Il propose des services de distribution",
                en: "It offers distribution services",
                es: "Ofrece servicios de distribución"
              },
              {
                fr: "de reconditionnement",
                en: "reconditioning",
                es: "de reacondicionamiento"
              },
              {
                fr: "et de logistique écoresponsable",
                en: "and environmentally responsible logistics",
                es: "y logística ecológica"
              }
            ],
            characterId: "nerd"
          },
          {
            time: 11.5,
            text: {
                fr: "Itancia accompagne ses clients",
                en: "Itancia supports its customers",
                es: "Itancia acompaña a sus clientes"
              },
            characterId: "nerd"
          },
          {
            time: 13.0,
            text: {
                fr: "dans tous leurs projets IT et télécom",
                en: "in all their IT and telecommunications projects",
                es: "en todos sus proyectos de TI y telecomunicaciones"
              },
            characterId: "nerd"
          },
          {
            time: 16.0,
            text: {
                fr: "909 était une entreprise de ce groupe",
                en: "909 was a company in this group",
                es: "909 era una empresa de este grupo"
              },
            characterId: "nerd"
          },
          {
            time: 19.0,
            text: {
                fr: "dont l'activité était dédié au service après-vente",
                en: "whose activity was dedicated to after-sales service",
                es: "cuya actividad se dedicaba al servicio posventa"
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
        fr: "Eaux usées...",
        en: "Wastewater...",
        es: "Aguas residuales..."
      },
      emptyName: "work_planet-06",
      autoplay: true,
      icon: `${BASE_URL}/icons/hangar.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Chill_Deluxe.mp3`,
      sceneSound: `${BASE_URL}/sounds/voices/voix-POI-work_planet-06.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "x",
      minDistance: 2.2,
      maxDistance: 4,
      minPolarAngle: 0.5,
      maxPolarAngle: 1.52,
      minAzimuthAngle: 1.74,
      maxAzimuthAngle: -1.14,
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
          autoplay: true,
          icon: `${BASE_URL}/icons/nerd-icon.webp`,
          ambientSound: `${BASE_URL}/sounds/Decode_The_Matrix/Neon_Encryption.mp3`,
          sceneSound: `${BASE_URL}/sounds/voices/voix-POI-david_06.mp3`,
          zoom: 0.2,
          lookAxis: "x",
          minDistance: 0.45,
          maxDistance: 1.1,
          minPolarAngle: 1,
          maxPolarAngle: 1.27,
          minAzimuthAngle: 0.64,
          maxAzimuthAngle: 3.84,
          enableZoom: true,
          elements: [
            {
              name: "perso_david_06",
              type: "armature",
              clipName: "perso_david_06_action",
              autoplay: false,
              loop: false,
              placeholderMesh: "perso_david_06_placeholder",
              transitionFrames: 8
            }
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
                time: 0.1,
                text: {
                  fr: "Biotrade est une entreprise dédiée au traitement de l’eau pour les professionnels",
                  en: "Biotrade is a company dedicated to water treatment for professionals",
                  es: "Biotrade es una empresa dedicada al tratamiento del agua para profesionaleso"
                },
                characterId: "nerd"
              },
              {
                time: 3.5,
                text: {
                  fr: "avec des solutions techniques adaptées aux usages industriels",
                  en: "with technical solutions tailored to industrial applications",
                  es: "con soluciones técnicas adaptadas a los usos industriales"
                },
                characterId: "nerd"
              },
              {
                time: 7.0,
                text: {
                  fr: "J’y ai conçu et développé un SaaS complet de GMAO en Symfony,",
                  en: "I designed and developed a complete CMMS SaaS solution in Symfony,",
                  es: "Allí diseñé y desarrollé un completo SaaS de GMAO en Symfony,"
                },
                characterId: "nerd"
              },
              {
                time: 11.0,
                text: {
                  fr: "React, Next et MariaDB",
                  en: "React, Next and MariaDB",
                  es: "React, Next y MariaDB"
                },
                characterId: "nerd"
              },
              {
                time: 13.5,
                text: {
                  fr: "dans un cadre agile avec Jira",
                  en: "in an agile environment with Jira",
                  es: "en un entorno ágil con Jira"
                },
                characterId: "nerd"
              },
              {
                time: 15.0,
                text: {
                  fr: "Je gérais le versioning",
                  en: "I managed versioning",
                  es: "Me encargaba de la gestión de versiones"
                },
                characterId: "nerd"
              },
              {
                time: 17.0,
                text: {
                  fr: "les déploiements continus",
                  en: "continuous deployments",
                  es: "los despliegues continuos"
                },
                characterId: "nerd"
              },
              {
                time: 18.5,
                text: {
                  fr: "et l’ensemble des bonnes pratiques nécessaires à un produit fiable et évolutif",
                  en: "and all the best practices necessary for a reliable and scalable product",
                  es: "y todas las buenas prácticas necesarias para obtener un producto fiable y evolutivo"
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
            time: 0.1,
            text: {
              fr: "Biotrade est une société dédiée au traitement de l’eau",
              en: "Biotrade is a company dedicated to water treatment",
              es: "Biotrade es una empresa dedicada al tratamiento del agua"
            },
            characterId: "nerd"
          },
          {
            time: 3.0,
            text: 
              {
                fr: "pour des usages professionnels",
                en: "for professional use",
                es: "para uso profesional"
              },
            characterId: "nerd"
          },
          {
            time: 5.0,
            text: 
              {
                fr: "Elle conçoit des solutions techniques adaptées aux secteurs industriels",
                en: "It designs technical solutions tailored to industrial sectors",
                es: "Diseña soluciones técnicas adaptadas a los sectores industriales"
              },
            characterId: "nerd"
          },
          {
            time: 8.0,
            text: {
                fr: "et environnementaux",
                en: "and environmental",
                es: "y medioambientales"
              },
            characterId: "nerd"
          },
          {
            time: 10.5,
            text: {
                fr: "Son engagement : offrir des installations performantes",
                en: "His commitment: to provide high-performance facilities",
                es: "Su compromiso: ofrecer instalaciones eficientes"
              },
            characterId: "nerd"
          },
          {
            time: 13.0,
            text: {
                fr: "et durables",
                en: "and sustainable",
                es: "y duraderos"
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
        fr: "Soja en masse...",
        en: "Soybeans in bulk...",
        es: "Soja a granel..."
      },
      emptyName: "work_planet-07",
      autoplay: true,
      icon: `${BASE_URL}/icons/silos.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Plastic_Emotions.mp3`,
      sceneSound: `${BASE_URL}/sounds/voices/voix-POI-work_planet-07.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "x",
      minDistance: 2.2,
      maxDistance: 4,
      minPolarAngle: 0.8,
      maxPolarAngle: 1.42,
      minAzimuthAngle: 1.44,
      maxAzimuthAngle: -1.24,
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
          autoplay: true,
          icon: `${BASE_URL}/icons/nerd-icon.webp`,
          ambientSound: `${BASE_URL}/sounds/Decode_The_Matrix/Bypass_Reality.mp3`,
          sceneSound: `${BASE_URL}/sounds/voices/voix-POI-david_07.mp3`,
          zoom: 0.2,
          lookAxis: "x",
          minDistance: 0.45,
          maxDistance: 1.1,
          minPolarAngle: 1,
          maxPolarAngle: 1.27,
          minAzimuthAngle: 0.64,
          maxAzimuthAngle: 4.44,
          enableZoom: true,
          elements: [
            {
              name: "perso_david_07",
              type: "armature",
              clipName: "perso_david_07_action",
              autoplay: false,
              loop: false,
              placeholderMesh: "perso_david_07_placeholder",
              transitionFrames: 8
            }
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
                time: 0.1,
                text: {
                  fr: "Les Silos du Touch sont spécialisés dans la filière du soja alimentaire",
                  en: "Les Silos du Touch specialises in the edible soybean sector",
                  es: "Les Silos du Touch se especializan en el sector de la soja alimentaria"
                },
                characterId: "nerd"
              },
              {
                time: 4.0,
                text: {
                  fr: "et gèrent stockage, tri et distribution",
                  en: "and manage storage, sorting and distribution",
                  es: "y gestionan el almacenamiento, la clasificación y la distribución"
                },
                characterId: "nerd"
              },
              {
                time: 7.0,
                text: {
                  fr: "J’y assure la maintenance et l’évolution d’un ERP sous Dolibarr",
                  en: "I am responsible for the maintenance and development of an ERP system using Dolibarr",
                  es: "Me encargo del mantenimiento y la evolución de un ERP bajo Dolibarr"
                },
                characterId: "nerd"
              },
              {
                time: 10.0,
                text: {
                  fr: "tout en développant de nouvelles fonctionnalités en PHP",
                  en: "while developing new features in PHP",
                  es: "al tiempo que se desarrollan nuevas funcionalidades en PHP"
                },
                characterId: "nerd"
              },
              {
                time: 13.0,
                text: {
                  fr: "J’optimise également des applications internes en Slim et Vue.js",
                  en: "I also optimise internal applications in Slim and Vue.js",
                  es: "También optimizo aplicaciones internas en Slim y Vue.js"
                },
                characterId: "nerd"
              },
              {
                time: 17.0,
                text: {
                  fr: "pour améliorer les outils métiers au quotidien",
                  en: "to improve everyday business tools",
                  es: "para mejorar las herramientas profesionales en el día a día"
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
              fr: "Les Silos du Touch travaillent autour du soja alimentaire",
              en: "Les Silos du Touch works with edible soybeans",
              es: "Les Silos du Touch trabaja con soja alimentaria"
            },
            characterId: "nerd"
          },
          {
            time: 3.5,
            text: [
              {
                fr: "Ils assurent le stockage",
                en: "They provide storage",
                es: "Se encargan del almacenamiento"
              },
              {
                fr: "le tri",
                en: "sorting",
                es: "la clasificación"
              },
              {
                fr: "et la valorisation de la production locale",
                en: "and promoting local production",
                es: "y la valorización de la producción local"
              }
            ],
            characterId: "nerd"
          },
          {
            time: 9.0,
            text: {
                fr: "L’entreprise accompagne les agriculteurs",
                en: "The company supports farmers",
                es: "La empresa acompaña a los agricultores"
              },
            characterId: "nerd"
          },
          {
            time: 11.5,
            text: {
                fr: "pour développer une filière de qualité",
                en: "to develop a quality sector",
                es: "para desarrollar un sector de calidad"
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
    {
      type: "spot",
      emptyName: "spot_bulb",
      color: 0xfff2cc,
      intensity: 0.15,
      distance: 8,
      angle: Math.PI / 2,
      penumbra: 1,
    },
    {
      type: "spot",
      emptyName: "spot_bulb_01",
      color: 0xfff2cc,
      intensity: 0.15,
      distance: 8,
      angle: Math.PI / 2,
      penumbra: 1,
    },
    {
      type: "spot",
      emptyName: "spot_bulb_02",
      color: 0xfff2cc,
      intensity: 0.15,
      distance: 8,
      angle: Math.PI / 2,
      penumbra: 1,
    },
    {
      type: "spot",
      emptyName: "spot_bulb_04",
      color: 0xfff2cc,
      intensity: 0.15,
      distance: 8,
      angle: Math.PI / 2,
      penumbra: 1,
    },
    {
      type: "spot",
      emptyName: "spot_bulb_05",
      color: 0xfff2cc,
      intensity: 0.15,
      distance: 8,
      angle: Math.PI / 2,
      penumbra: 1,
    },
  ],
  bulbs: [ // couleur et emit des ampoules
    // { emptyName: "bulb_01", color: 0xfff2cc, intensity: 0.5, emissiveIntensity: 1.5, distance: 10 },
    // { emptyName: "bulb_02", color: 0xfff2cc, intensity: 0.5, emissiveIntensity: 1.2, distance: 8 },
    // { emptyName: "bulb_03", color: 0xfff2cc, intensity: 0.5, emissiveIntensity: 1.2, distance: 8 },
    // { emptyName: "bulb_04", color: 0xfff2cc, intensity: 0.5, emissiveIntensity: 1.2, distance: 8 },
    // { emptyName: "bulb_05", color: 0xfff2cc, intensity: 0.5, emissiveIntensity: 1.2, distance: 8 },
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
