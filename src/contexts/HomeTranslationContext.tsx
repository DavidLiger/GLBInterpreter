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
        label: "C'est quoi un livre augmenté ?"
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
        description: "Explorez des mondes futuristes et des technologies avancées à travers nos récits de science-fiction captivants."
      },
      fantasy: {
        name: "Fantastique",
        description: "Plongez dans des univers magiques peuplés de créatures légendaires et de héros extraordinaires."
      },
      thriller: {
        name: "Policier",
        description: "Résolvez des énigmes complexes et suivez des enquêtes palpitantes dans nos thrillers policiers."
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
        label: "What is an augmented book?"
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
        description: "Explore futuristic worlds and advanced technologies through our captivating science fiction stories."
      },
      fantasy: {
        name: "Fantasy",
        description: "Dive into magical universes populated with legendary creatures and extraordinary heroes."
      },
      thriller: {
        name: "Thriller",
        description: "Solve complex riddles and follow thrilling investigations in our police thrillers."
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
        label: "¿Qué es un libro aumentado?"
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
        description: "Explore mundos futuristas y tecnologías avanzadas a través de nuestros cautivadores relatos de ciencia ficción."
      },
      fantasy: {
        name: "Fantasía",
        description: "Sumérjase en universos mágicos poblados de criaturas legendarias y héroes extraordinarios."
      },
      thriller: {
        name: "Policíaco",
        description: "Resuelva enigmas complejos y siga investigaciones apasionantes en nuestros thrillers policíacos."
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
  // ✅ Fonction pour détecter la langue
  const detectLanguage = (): Lang => {
    if (typeof window === "undefined") return "fr"; // SSR fallback
    
    // 1. D'abord vérifier localStorage
    const saved = localStorage.getItem("homepage-lang");
    if (saved && ["fr", "en", "es"].includes(saved)) {
      return saved as Lang;
    }
    
    // 2. Sinon détecter depuis le navigateur
    const browserLang = navigator.language.split("-")[0];
    
    if (["fr", "en", "es"].includes(browserLang)) {
      return browserLang as Lang;
    }
    
    // 3. Par défaut : français
    return "fr";
  };
  
  const [lang, setLangState] = useState<Lang>(() => detectLanguage());
  
  // ✅ Détecter la langue au mount (côté client uniquement)
  useEffect(() => {
    const detected = detectLanguage();
    if (detected !== lang) {
      setLangState(detected);
    }
    console.log("🏠 Langue homepage détectée:", detected);
  }, []);
  
  // ✅ Fonction pour changer la langue + sauvegarder
  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem("homepage-lang", newLang);
      console.log("💾 Langue homepage sauvegardée:", newLang);
    }
  };
  
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
