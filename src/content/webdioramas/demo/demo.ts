import type { DioramaConfig3DWithPostProcessing } from "@/types/diorama";

const BASE_URL = process.env.NEXT_PUBLIC_ASSET_BASE_URL || "";

export const demo: DioramaConfig3DWithPostProcessing = {
  glb: `${BASE_URL}/models/demo.glb`,
  loaderImage: `${BASE_URL}/images/preview.webp`,
  autoplay: true, // ← Mode tutoriel automatique ou pas
  deviceTester: {
    enabled: true,
    testDuration: 10000,
    minFPS: 25,
    minGPUTier: 1,
  },
  name: {
    fr: "Démonstration",
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
        fr: "Bienvenue",
        en: "At David's",
        es: "En casa de David"
      },
      emptyName: "start",
      icon: `${BASE_URL}/icons/magnifier.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Electric_Leisure.mp3`,
      sceneSound: `${BASE_URL}/sounds/voices/voix-POI-start.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "x",
      minDistance: 3.4,
      maxDistance: 8,
      minPolarAngle: 0.7,
      maxPolarAngle: 1.36,
      minAzimuthAngle: -2.24,
      maxAzimuthAngle: 2.0,
      enableZoom: true,
      children: [ // POIs enfant
        {
          id: "poi_Sherlock",
          label: {
            fr: "Sherlock",
            en: "It's working...",
            es: "¡Vamos allá!"
          },
          emptyName: "poi_Sherlock",
          autoplay: true,
          icon: `${BASE_URL}/icons/deerstalker-hat.webp`,
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
    },
    {
      id: "poi_Alice",
      label: {
        fr: "L'heure du thé",
        en: "At school...",
        es: "En la escuela..."
      },
      emptyName: "poi_Alice",
      autoplay: true,
      icon: `${BASE_URL}/icons/tea-cup.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Analog_Lovers.mp3`,
      sceneSound: `${BASE_URL}/sounds/voices/voix-POI-work_planet-01.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "x",
      minDistance: 2.2,
      maxDistance: 3.8,
      minPolarAngle: 0.7,
      maxPolarAngle: 1.42,
      minAzimuthAngle: -2.44,
      maxAzimuthAngle: 1.2,
      enableZoom: true,
      children: [ // POIs enfant
        {
          id: "poi_perso_Alice",
          label: {
            fr: "Alice",
            en: "It's working...",
            es: "¡Vamos allá!"
          },
          emptyName: "poi_perso_Alice",
          autoplay: true,
          icon: `${BASE_URL}/icons/white-rabbit.webp`,
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
    },
    {
      id: "poi_Treasure_Island",
      label: {
        fr: "À la plage",
        en: "On work placement...",
        es: "En prácticas..."
      },
      emptyName: "poi_Treasure_Island",
      autoplay: true,
      icon: `${BASE_URL}/icons/blue-anchor.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Smooth_by_Design.mp3`,
      sceneSound: `${BASE_URL}/sounds/voices/voix-POI-work_planet-02.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "z",
      minDistance: 2.6,
      maxDistance: 4.2,
      minPolarAngle: 1.2,
      maxPolarAngle: 1.52,
      minAzimuthAngle: 0.24,
      maxAzimuthAngle: 4,
      enableZoom: true,
      children: [ // POIs enfant
        {
          id: "poi_perso_Treasure",
          label: {
            fr: "Jim Hawkins",
            en: "It's working...",
            es: "¡Vamos allá!"
          },
          emptyName: "poi_perso_Treasure",
          autoplay: true,
          icon: `${BASE_URL}/icons/treasure-map.webp`,
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
    },
    {
      id: "poi_Abyss",
      label: {
        fr: "Au fond",
        en: "On work placement...",
        es: "En prácticas..."
      },
      emptyName: "poi_Abyss",
      autoplay: true,
      icon: `${BASE_URL}/icons/hublot.webp`,
      ambientSound: `${BASE_URL}/sounds/Digital_Galaxy/Smooth_by_Design.mp3`,
      sceneSound: `${BASE_URL}/sounds/voices/voix-POI-work_planet-02.mp3`,
      zoom: 0.5, // règlages de la camera sur ce POI (jusqu'à enableZoom)
      lookAxis: "z",
      minDistance: 2.2,
      maxDistance: 3.8,
      minPolarAngle: 1.1,
      maxPolarAngle: 1.32,
      minAzimuthAngle: 0.24,
      maxAzimuthAngle: 4,
      enableZoom: true,
      children: [ // POIs enfant
        {
          id: "poi_Nemo",
          label: {
            fr: "Nemo",
            en: "It's working...",
            es: "¡Vamos allá!"
          },
          emptyName: "poi_Nemo",
          autoplay: true,
          icon: `${BASE_URL}/icons/trident.webp`,
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
    }
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
      intensity: 0.8,
    },
    {
      type: "spot",
      emptyName: "spot_01", // pointe vers spot_01_target (ajout de _target derrière le nom du emptyname)
      color: 0xfff2cc,
      intensity: 0.8,
      distance: 10,
      angle: Math.PI / 2,
      penumbra: 0.3,
    },
    {
      type: "spot",
      emptyName: "spot_02", // pointe vers spot_01_target (ajout de _target derrière le nom du emptyname)
      color: 0xfff2cc,
      intensity: 0.8,
      distance: 10,
      angle: Math.PI / 2,
      penumbra: 0.5,
    },
    {
      type: "spot",
      emptyName: "spot_03",
      color: 0xfff2cc,
      intensity: 0.8,
      distance: 10,
      angle: Math.PI / 2,
      penumbra: 0.5,
    },
    {
      type: "spot",
      emptyName: "spot_04",
      color: 0xfff2cc,
      intensity: 0.8,
      distance: 10,
      angle: Math.PI / 2,
      penumbra: 0.5,
    },
    {
      type: "spot",
      emptyName: "spot_05",
      color: 0xfff2cc,
      intensity: 0.8,
      distance: 10,
      angle: Math.PI / 2,
      penumbra: 0.5,
    },
    {
      type: "spot",
      emptyName: "spot_poi_Alice",
      color: 0xfff2cc,
      intensity: 7.5,
      distance: 100,
      angle: Math.PI / 2.5,
      penumbra: 0.5,
    },
    {
      type: "spot",
      emptyName: "spot_poi_Alice_02",
      color: 0xfff2cc,
      intensity: 7.5,
      distance: 100,
      angle: Math.PI / 2.5,
      penumbra: 0.5,
    },
    {
      type: "spot",
      emptyName: "spot_poi_Treasure_Island",
      color: 0xfff2cc,
      intensity: 7.5,
      distance: 100,
      angle: Math.PI / 3.5,
      penumbra: 0.5,
    },
    {
      type: "spot",
      emptyName: "spot_poi_Treasure_Island_02",
      color: 0xfff2cc,
      intensity: 7.5,
      distance: 100,
      angle: Math.PI / 3.5,
      penumbra: 0.5,
    },
    {
      type: "spot",
      emptyName: "spot_poi_Abyss",
      color: 0xfff2cc,
      intensity: 7.5,
      distance: 100,
      angle: Math.PI / 3.5,
      penumbra: 0.5,
    },
    {
      type: "spot",
      emptyName: "spot_poi_Abyss_02",
      color: 0xfff2cc,
      intensity: 7.5,
      distance: 100,
      angle: Math.PI / 3.5,
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
