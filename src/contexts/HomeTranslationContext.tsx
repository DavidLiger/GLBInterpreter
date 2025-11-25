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
    collectionsSection: {
      title: "Les collections"
    },
    howItWorks: {
      title: "C'est quoi un livre augmenté ?",
      text: "Nos livres augmentés vous offrent une expérience unique : en scannant un QR code présent dans le livre, vous accédez à des scènes 3D immersives qui donnent vie à l'histoire.\n\nDécouvrez des univers en réalité augmentée, explorez les décors, et plongez dans une nouvelle dimension de lecture.\n\nEssayez notre démo interactive pour découvrir la magie des livres augmentés !"
    },
    amazonButton: {
      title: "Acheter sur Amazon"
    },
    collections: {
      scifi: {
        name: "Science-Fiction",
        description: "Explorez des mondes futuristes et des technologies avancées à travers nos récits de science-fiction captivants.",
        details: [
          { text: "Des vaisseaux spatiaux aux confins de l'univers" },
          { text: "Des civilisations extraterrestres fascinantes" }
        ],
      },
      fantasy: {
        name: "Fantastique",
        description: "Plongez dans des univers magiques peuplés de créatures légendaires et de héros extraordinaires.",
        details: [
          { text: "Des forêts enchantées et des créatures mythiques" },
          { text: "Des quêtes épiques et des sortilèges puissants" }
        ]
      },
      thriller: {
        name: "Policier",
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
          details: [
            { text: "Lorem ipsum dolor sit amet, consectetur adipiscing " }
          ]
        },
        "Fantasy-01" : {
          title: "Titre du Livre Fantastique",
          summary: "Résumé rapide...",
          details: [
            { text: "Lorem ipsum dolor sit amet, consectetur adipiscing " }
          ]
        },
        "Fantasy-02" : {
          title: "Titre du Livre Fantastique",
          summary: "Résumé rapide...",
          details: [
            { text: "Lorem ipsum dolor sit amet, consectetur adipiscing " }
          ]
        },
        "Fantasy-03" : {
          title: "Titre du Livre Fantastique",
          summary: "Résumé rapide...",
          details: [
            { text: "Lorem ipsum dolor sit amet, consectetur adipiscing " }
          ]
        },
        "Polar-01": {
          title: "Titre du Livre Policier",
          summary: "Résumé rapide...",
          details: [
            { text: "Lorem ipsum dolor sit amet, consectetur adipiscing " }
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
    collectionsSection: {
      title: "Collections"
    },
    howItWorks: {
      title: "What is an augmented book?",
      text: "Our augmented books offer you a unique experience: by scanning a QR code in the book, you access immersive 3D scenes that bring the story to life.\n\nDiscover augmented reality universes, explore the settings, and dive into a new dimension of reading.\n\nTry our interactive demo to discover the magic of augmented books!"
    },
    amazonButton: {
      title: "Buy on Amazon"
    },
    collections: {
      scifi: {
        name: "Science Fiction",
        description: "Explore futuristic worlds and advanced technologies through our captivating science fiction stories.",
        details: [
          { text: "Spaceships at the edge of the universe" },
          { text: "Fascinating alien civilisations" }
        ],
      },
      fantasy: {
        name: "Fantasy",
        description: "Dive into magical universes populated with legendary creatures and extraordinary heroes.",
        details: [
          { text: "Enchanted forests and mythical creatures" },
          { text: "Epic quests and powerful spells" }
        ],
      },
      thriller: {
        name: "Thriller",
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
          details: [
            { text: "Lorem ipsum dolor sit amet, consectetur adipiscing " }
          ]
        },
        "Fantasy-01" : {
          title: "Title of Fantasy Book",
          summary: "Quick summary...",
          details: [
            { text: "Lorem ipsum dolor sit amet, consectetur adipiscing " }
          ]
        },
        "Fantasy-02" : {
          title: "Title of Fantasy Book",
          summary: "Quick summary...",
          details: [
            { text: "Lorem ipsum dolor sit amet, consectetur adipiscing " }
          ]
        },
        "Fantasy-03" : {
          title: "Title of Fantasy Book",
          summary: "Quick summary...",
          details: [
            { text: "Lorem ipsum dolor sit amet, consectetur adipiscing " }
          ]
        },
        "Polar-01": {
          title: "Title of the Detective Novel",
          summary: "Quick summary...",
          details: [
            { text: "Lorem ipsum dolor sit amet, consectetur adipiscing " }
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
    collectionsSection: {
      title: "Las colecciones"
    },
    howItWorks: {
      title: "¿Qué es un libro aumentado?",
      text: "Nuestros libros aumentados le ofrecen una experiencia única: al escanear un código QR presente en el libro, accede a escenas 3D inmersivas que dan vida a la historia.\n\nDescubra universos en realidad aumentada, explore los decorados y sumérjase en una nueva dimensión de lectura.\n\n¡Pruebe nuestra demo interactiva para descubrir la magia de los libros aumentados!"
    },
    amazonButton: {
      title: "Comprar en Amazon"
    },
    collections: {
      scifi: {
        name: "Ciencia Ficción",
        description: "Explore mundos futuristas y tecnologías avanzadas a través de nuestros cautivadores relatos de ciencia ficción.",
        details: [
          { text: "Naves espaciales en los confines del universo" },
          { text: "Fascinantes civilizaciones extraterrestres" }
        ]
      },
      fantasy: {
        name: "Fantasía",
        description: "Sumérjase en universos mágicos poblados de criaturas legendarias y héroes extraordinarios.",
        details: [
          { text: "Bosques encantados y criaturas míticas"},
          { text: "Misiones épicas y hechizos poderosos"}
        ],
      },
      thriller: {
        name: "Policíaco",
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
          details: [
            { text: "Lorem ipsum dolor sit amet, consectetur adipiscing " }
          ]
        },
        "Fantasy-01" : {
          title: "Título del libro fantástico",
          summary: "Resumen rápido...",
          details: [
            { text: "Lorem ipsum dolor sit amet, consectetur adipiscing"}
          ]
        },
        "Fantasy-02" : {
          title: "Título del libro fantástico",
          summary: "Resumen rápido...",
          details: [
            { text: "Lorem ipsum dolor sit amet, consectetur adipiscing"}
          ]
        },
        "Fantasy-03" : {
          title: "Título del libro fantástico",
          summary: "Resumen rápido...",
          details: [
            { text: "Lorem ipsum dolor sit amet, consectetur adipiscing"}
          ]
        },
        "Polar-01": {
          title: "Título del Libro Policíaco",
          summary: "Resumen rápido...",
          details: [
            { text: "Lorem ipsum dolor sit amet, consectetur adipiscing " }
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
