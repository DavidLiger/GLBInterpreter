"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Lang = "fr" | "en" | "es";

const translations = {
  fr: {
    header: {
      titleLine1: "Éditions",
      titleLine2: "Liger",
      subtitle: "Livres augmentés",
      cta: {
        label: "C'est quoi un livre augmenté ?",
        shortLabel: "C'est quoi ?"
      }
    },
    bookSection: {
      title: "Les livres",
      detailLink: "En savoir +"
    },
    bookModal: {
      release: "📅 Sortie prévue le : ",
      dateToBeAnnounced: "Date à venir"
    },
    collectionsSection: {
      title: "Les collections"
    },
    howItWorks: {
      title: "C'est quoi un livre augmenté ?",
      text: "Scannez un QR code dans le livre et plongez instantanément dans des scènes 3D complètes : explorez les décors en détail, naviguez entre les lieux emblématiques, rencontrez les personnages animés et vivez votre lecture comme jamais auparavant.\n\nPas d'application à installer, tout fonctionne directement dans votre navigateur. Une fois téléchargé, explorez même hors ligne.\n\nEssayez notre démo pour découvrir l'expérience !",      
      demoTitle: "Essayez maintenant !",
      demoButton: "Lancez la démo 3D",
      scanTitle: "Scannez avec votre téléphone",
      scanSubtitle: "Utilisez l'appareil photo de votre smartphone",
      scanSubtitle2: "pour scanner ce QR code"
    },
    amazonButton: {
      title: "Acheter sur Amazon",
      shortTitle: "Acheter"
    },
    collections: {
      scifi: {
        name: "Science-Fiction",
        subtitle: "Les livres de la collection",
        description: "Explorez des mondes futuristes et des technologies avancées à travers nos récits de science-fiction captivants.",
        details: [
          { text: "Des vaisseaux spatiaux aux confins de l'univers" },
          { text: "Des civilisations extraterrestres fascinantes" }
        ],
      },
      fantasy: {
        name: "Fantastique",
        subtitle: "Les livres de la collection",
        description: "Plongez dans des univers magiques peuplés de créatures légendaires et de héros extraordinaires.",
        details: [
          { text: "Des forêts enchantées et des créatures mythiques" },
          { text: "Des quêtes épiques et des sortilèges puissants" }
        ]
      },
      thriller: {
        name: "Policier",
        subtitle: "Les livres de la collection",
        description: "Résolvez des énigmes complexes et suivez des enquêtes palpitantes dans nos thrillers policiers.",
        details: [
          { text: "Des scènes de crime minutieusement reconstituées" },
          { text: "Des indices à découvrir en 3D" }
        ]
      }
    },
    books: {
        "SF-01": {
          title: "Titre du Livre SF",
          summary: "Résumé rapide du livre SF...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Des vaisseaux spatiaux aux confins de l'univers " }
          ]
        },
        "Fantasy-01" : {
          title: "Titre du Livre Fantastique",
          summary: "Résumé rapide...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Des forêts enchantées et des créatures mythiques" }
          ]
        },
        "Fantasy-02" : {
          title: "Titre du Livre Fantastique",
          summary: "Résumé rapide...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Des quêtes épiques et des sortilèges puissants" }
          ]
        },
        "Fantasy-03" : {
          title: "Titre du Livre Fantastique",
          summary: "Résumé rapide...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Des forêts enchantées et des créatures mythiques" }
          ]
        },
        "Polar-01": {
          title: "Titre du Livre Policier",
          summary: "Résumé rapide...",
          releaseDate: "Premier semestre 2026",
          dispo: true,
          details: [
            { text: "Des scènes de crime minutieusement reconstituées" }
          ]
        }
    },
    footer: {
      copyright: "© 2025 Les Éditions Liger — Tous droits réservés"
    }
  },
  en: {
    header: {
      titleLine1: "Éditions",
      titleLine2: "Liger",
      subtitle: "Augmented Books",
      cta: {
        label: "What is an augmented book?",
        shortLabel: "What is it?"
      }
    },
    bookSection: {
      title: "The Books",
      detailLink: "Learn more"
    },
    bookModal: {
      release: "📅 Scheduled release date : ",
      dateToBeAnnounced: "Date to be announced"
    },
    collectionsSection: {
      title: "Collections"
    },
    howItWorks: {
      title: "What is an augmented book?",
      text: "Scan a QR code in the book and instantly immerse yourself in full 3D scenes: explore the settings in detail, navigate between iconic locations, meet animated characters and experience your reading like never before.\n\nNo app to install, everything works directly in your browser. Once downloaded, you can even explore offline.\n\nTry our demo to discover the experience!",
      demoTitle: "Try it now !",
      demoButton: "Start the 3D demo",
      scanTitle: "Scan with your phone",
      scanSubtitle: "Use your smartphone's camera",
      scanSubtitle2: "to scan this QR code"
    },
    amazonButton: {
      title: "Buy on Amazon",
      shortTitle: "Buy"
    },
    collections: {
      scifi: {
        name: "Science Fiction",
        subtitle: "The books in the collection",
        description: "Explore futuristic worlds and advanced technologies through our captivating science fiction stories.",
        details: [
          { text: "Spaceships at the edge of the universe" },
          { text: "Fascinating alien civilisations" }
        ],
      },
      fantasy: {
        name: "Fantasy",
        subtitle: "The books in the collection",
        description: "Dive into magical universes populated with legendary creatures and extraordinary heroes.",
        details: [
          { text: "Enchanted forests and mythical creatures" },
          { text: "Epic quests and powerful spells" }
        ],
      },
      thriller: {
        name: "Thriller",
        subtitle: "The books in the collection",
        description: "Solve complex riddles and follow thrilling investigations in our police thrillers.",
        details: [
          { text: "Meticulously reconstructed crime scenes’" },
          { text: "Clues to discover in 3D" }
        ]
      }
    },
    books: {
        "SF-01": {
          title: "Title of SF Book",
          summary: "Quick summary of SF book...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Spaceships at the edge of the universe " }
          ]
        },
        "Fantasy-01" : {
          title: "Title of Fantasy Book",
          summary: "Quick summary...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Enchanted forests and mythical creatures" }
          ]
        },
        "Fantasy-02" : {
          title: "Title of Fantasy Book",
          summary: "Quick summary...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Epic quests and powerful spells" }
          ]
        },
        "Fantasy-03" : {
          title: "Title of Fantasy Book",
          summary: "Quick summary...",
          releaseDate: "",
          dispo: false,
          details: [
            { text: "Enchanted forests and mythical creatures" }
          ]
        },
        "Polar-01": {
          title: "Title of the Detective Novel",
          summary: "Quick summary...",
          releaseDate: "First half of 2026",
          dispo: true,
          details: [
            { text: "Meticulously reconstructed crime scenes" }
          ]
        }
    },
    footer: {
      copyright: "© 2025 Éditions Liger — All rights reserved"
    }
  },
  es: {
    header: {
      titleLine1: "Éditions",
      titleLine2: "Liger",
      subtitle: "Libros aumentados",
      cta: {
        label: "¿Qué es un libro aumentado?",
        shortLabel: "¿Qué es?"
      }
    },
    bookSection: {
      title: "Los libros",
      detailLink: "Saber más"
    },
    bookModal: {
      release: "📅 Salida prevista para el : ",
      dateToBeAnnounced: "Fecha por determinar"
    },
    collectionsSection: {
      title: "Las colecciones"
    },
    howItWorks: {
      title: "¿Qué es un libro aumentado?",
      text: "Escanea un código QR del libro y sumérgete al instante en escenas 3D completas: explora los decorados con todo detalle, navega entre lugares emblemáticos, conoce a los personajes animados y vive tu lectura como nunca antes lo habías hecho.\n\nNo es necesario instalar ninguna aplicación, todo funciona directamente en tu navegador. Una vez descargado, explora incluso sin conexión.\n\n¡Prueba nuestra demo para descubrir la experiencia!",      
      demoTitle: "¡Pruébelo ahora!",
      demoButton: "Iniciar la demostración en 3D",
      scanTitle: "Escanee con su teléfono",
      scanSubtitle: "Utilice la cámara de su smartphone",
      scanSubtitle2: "para escanear este código QR"
    },
    amazonButton: {
      title: "Comprar en Amazon",
      shortTitle: "Comprar"
    },
    collections: {
      scifi: {
        name: "Ciencia Ficción",
        subtitle: "Los libros de la colección",
        description: "Explore mundos futuristas y tecnologías avanzadas a través de nuestros cautivadores relatos de ciencia ficción.",
        details: [
          { text: "Naves espaciales en los confines del universo" },
          { text: "Fascinantes civilizaciones extraterrestres" }
        ]
      },
      fantasy: {
        name: "Fantasía",
        subtitle: "Los libros de la colección",
        description: "Sumérjase en universos mágicos poblados de criaturas legendarias y héroes extraordinarios.",
        details: [
          { text: "Bosques encantados y criaturas míticas"},
          { text: "Misiones épicas y hechizos poderosos"}
        ],
      },
      thriller: {
        name: "Policíaco",
        subtitle: "Los libros de la colección",
        description: "Resuelva enigmas complejos y siga investigaciones apasionantes en nuestros thrillers policíacos.",
         details: [
          { text: "Escenas del crimen minuciosamente reconstituidas" },
          { text: "Pistas por descubrir en 3D" }
        ]
      }
    },
    books: {
        "SF-01": {
          title: "Título del libro de ciencia ficción",
          summary: "Breve resumen del libro de ciencia ficción...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Naves espaciales en los confines del universo " }
          ]
        },
        "Fantasy-01" : {
          title: "Título del libro fantástico",
          summary: "Resumen rápido...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Bosques encantados y criaturas míticas"}
          ]
        },
        "Fantasy-02" : {
          title: "Título del libro fantástico",
          summary: "Resumen rápido...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Misiones épicas y hechizos poderosos"}
          ]
        },
        "Fantasy-03" : {
          title: "Título del libro fantástico",
          summary: "Resumen rápido...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Bosques encantados y criaturas míticas"}
          ]
        },
        "Polar-01": {
          title: "Título del Libro Policíaco",
          summary: "Resumen rápido...",
          releaseDate: "Primer semestre de 2026",
          dispo: true,
          details: [
            { text: "Escenas del crimen minuciosamente reconstituidas " }
          ]
        }
    },
    footer: {
      copyright: "© 2025 Éditions Liger — Todos los derechos reservados"
    }
  }
};

interface HomeTranslationContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: typeof translations.fr;
}

const HomeTranslationContext = createContext<HomeTranslationContextType | null>(null);

export function HomeTranslationProvider({ children }: { children: ReactNode }) {
  // ✅ TOUJOURS initialiser avec "fr" (valeur statique SSR-safe)
  const [lang, setLangState] = useState<Lang>("fr");
  const [mounted, setMounted] = useState(false); // ✅ AJOUTER
  
  // ✅ Détecter la langue UNIQUEMENT côté client
  useEffect(() => {
    // 1. D'abord vérifier localStorage
    const saved = localStorage.getItem("homepage-lang");
    if (saved && ["fr", "en", "es"].includes(saved)) {
      setLangState(saved as Lang);
      setMounted(true);
      return;
    }
    
    // 2. Sinon détecter depuis le navigateur
    const browserLang = navigator.language.split("-")[0];
    
    if (["fr", "en", "es"].includes(browserLang)) {
      setLangState(browserLang as Lang);
    }
    
    setMounted(true);
    console.log("🏠 Langue homepage détectée:", lang);
  }, []);
  
  // ✅ Fonction pour changer la langue + sauvegarder
  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem("homepage-lang", newLang);
    console.log("💾 Langue homepage sauvegardée:", newLang);
  };
  
  // ✅ Ne rien afficher jusqu'à ce que la langue soit détectée
  if (!mounted) {
    return null; // Ou un loader minimal
  }
  
  return (
    <HomeTranslationContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </HomeTranslationContext.Provider>
  );
}

export function useHomeTranslation() {
  const context = useContext(HomeTranslationContext);
  if (!context) throw new Error("useHomeTranslation must be used within HomeTranslationProvider");
  return context;
}
