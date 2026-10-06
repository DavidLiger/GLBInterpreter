"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Lang = "fr" | "en" | "es";

export const translations = {
  fr: {
    header: {
      titleLine1: "Éditions",
      titleLine2: "Liger",
      subtitle: "Livres augmentés",
      cta: {
        label: "C'est quoi un livre augmenté ?",
        shortLabel: "Livre augmenté ?"
      }
    },
    bookSection: {
      title: "Les livres",
      detailLink: "En savoir +"
    },
    bookCover: {
      publisher: "Éditions Liger",
      notFinalImage: "Image non contractuelle"
    },
    bookModal: {
      release: "📅 Sortie prévue le : ",
      dateToBeAnnounced: "Date à venir",
      notAvailableInLanguage: "Ce livre n'est pas disponible en français. Changez de langue pour voir les versions disponibles.",
      changeLanguage: "Changer de langue"
    },
    collectionsSection: {
      title: "Les collections"
    },
    howItWorks: {
      title: "C'est quoi un livre augmenté ?",
      text: "Scannez un QR code dans un livre augmenté, c'est plonger instantanément au cœur de l'histoire : explorez des décors 3D fidèles au récit, naviguez librement entre les lieux emblématiques, rencontrez les personnages qui s'animent sous vos yeux.\n\nAucune application à installer, tout se passe dans votre navigateur. Une fois téléchargé, l'expérience reste accessible même hors connexion.\n\nDécouvrez notre démo interactive !",      
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
    bookDetails: {
      author: "Auteur",
      description: "Description",
      pages: "Nombre de pages",
      format: "Format",
      isbn13: "ISBN-13",
      isbn10: "ISBN-10",
      publicationDate: "Date de parution",
      publisher: "Éditeur",
      language: "Langue",
      price: "Prix",
      binding: "Reliure",
      weight: "Poids",
      ean: "EAN",
      targetAge: "Âge recommandé",
      genre: "Genre",
      collection: "Collection"
    },
    books: {
        "SF-01": {
          title: "Titre du Livre SF",
          summary: "Résumé rapide du livre SF...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Des vaisseaux spatiaux aux confins de l'univers ",
              author: "Jules Verne",
              description: "Une exploration fascinante des confins de l'univers...",
              pages: "320",
              format: "14 x 21 cm",
              isbn13: "978-2-XXXXX-XXX-X",
              isbn10: "2-XXXXX-XXX-X",
              language: "Français",
              price: "19,90 €",
              binding: "Broché",
              weight: "450 g",
              ean: "9782XXXXXXXXX",
              targetAge: "12 ans et +",
              genre: "Science-Fiction"
            }
          ]
        },
        "Fantasy-01" : {
          title: "Titre du Livre Fantastique",
          summary: "Résumé rapide...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Des forêts enchantées et des créatures mythiques",
              author: "Jules Verne",
              description: "Une exploration fascinante des confins de l'univers...",
              pages: "320",
              format: "14 x 21 cm",
              isbn13: "978-2-XXXXX-XXX-X",
              isbn10: "2-XXXXX-XXX-X",
              language: "Français",
              price: "19,90 €",
              binding: "Broché",
              weight: "450 g",
              ean: "9782XXXXXXXXX",
              targetAge: "12 ans et +",
              genre: "Science-Fiction"
            }
          ]
        },
        "Fantasy-02" : {
          title: "Titre du Livre Fantastique",
          summary: "Résumé rapide...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Des quêtes épiques et des sortilèges puissants",
              author: "Jules Verne",
              description: "Une exploration fascinante des confins de l'univers...",
              pages: "320",
              format: "14 x 21 cm",
              isbn13: "978-2-XXXXX-XXX-X",
              isbn10: "2-XXXXX-XXX-X",
              language: "Français",
              price: "19,90 €",
              binding: "Broché",
              weight: "450 g",
              ean: "9782XXXXXXXXX",
              targetAge: "12 ans et +",
              genre: "Science-Fiction" 
            }
          ]
        },
        "Fantasy-03" : {
          title: "Titre du Livre Fantastique",
          summary: "Résumé rapide...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Des forêts enchantées et des créatures mythiques",
              author: "Jules Verne",
              description: "Une exploration fascinante des confins de l'univers...",
              pages: "320",
              format: "14 x 21 cm",
              isbn13: "978-2-XXXXX-XXX-X",
              isbn10: "2-XXXXX-XXX-X",
              language: "Français",
              price: "19,90 €",
              binding: "Broché",
              weight: "450 g",
              ean: "9782XXXXXXXXX",
              targetAge: "12 ans et +",
              genre: "Science-Fiction" 
            }
          ]
        },
        "Polar-01": {
          title: "Titre du Livre Policier",
          summary: "Résumé rapide...",
          releaseDate: "Premier semestre 2026",
          dispo: true,
          details: [
            { text: "Des scènes de crime minutieusement reconstituées",
              coverImage: "policier-detail2.jpg",
              author: "Jules Verne",
              description: "Une exploration fascinante des confins de l'univers...",
              pages: "320",
              format: "14 x 21 cm",
              isbn13: "978-2-XXXXX-XXX-X",
              isbn10: "2-XXXXX-XXX-X",
              language: "Français",
              price: "19,90 €",
              binding: "Broché",
              weight: "450 g",
              ean: "9782XXXXXXXXX",
              targetAge: "12 ans et +",
              genre: "Science-Fiction" 
            }
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
        shortLabel: "Augmented book?"
      }
    },
    bookSection: {
      title: "The Books",
      detailLink: "Learn more"
    },
    bookCover: {
      publisher: "Éditions Liger",
      notFinalImage: "Not final cover"
    },
    bookModal: {
      release: "📅 Scheduled release date : ",
      dateToBeAnnounced: "Date to be announced",
      notAvailableInLanguage: "This book is not available in English. Change language to see available versions.",
      changeLanguage: "Change language"
    },
    collectionsSection: {
      title: "Collections"
    },
    howItWorks: {
      title: "What is an augmented book?",
      text: "Scan a QR code in an augmented book and instantly immerse yourself in the heart of the story: explore 3D settings faithful to the narrative, navigate freely between iconic locations, and meet characters who come to life before your eyes. No app to install, everything happens in your browser. Once downloaded, the experience remains accessible even when you're offline. Discover our interactive demo!",
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
    bookDetails: {
      author: "Author",
      description: "Description",
      pages: "Number of pages",
      format: "Format",
      isbn13: "ISBN-13",
      isbn10: "ISBN-10",
      publicationDate: "Publication date",
      publisher: "Publisher",
      language: "Language",
      price: "Price",
      binding: "Binding",
      weight: "Weight",
      ean: "EAN",
      targetAge: "Recommended age",
      genre: "Genre",
      collection: "Collection"
    },
    books: {
        "SF-01": {
          title: "Title of SF Book",
          summary: "Quick summary of SF book...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Spaceships at the edge of the universe ",
              author: "Jules Verne",
              description: "A fascinating exploration of the outer reaches of the universe..",
              pages: "320",
              format: "14 x 21 cm",
              isbn13: "978-2-XXXXX-XXX-X",
              isbn10: "2-XXXXX-XXX-X",
              language: "English",
              price: "19,90 €",
              binding: "Paperback",
              weight: "450 g",
              ean: "9782XXXXXXXXX",
              targetAge: "12 years and older",
              genre: "Science Fiction"
            }
          ]
        },
        "Fantasy-01" : {
          title: "Title of Fantasy Book",
          summary: "Quick summary...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Enchanted forests and mythical creatures",
              author: "Jules Verne",
              description: "A fascinating exploration of the outer reaches of the universe..",
              pages: "320",
              format: "14 x 21 cm",
              isbn13: "978-2-XXXXX-XXX-X",
              isbn10: "2-XXXXX-XXX-X",
              language: "English",
              price: "19,90 €",
              binding: "Paperback",
              weight: "450 g",
              ean: "9782XXXXXXXXX",
              targetAge: "12 years and older",
              genre: "Science Fiction"
            }
          ]
        },
        "Fantasy-02" : {
          title: "Title of Fantasy Book",
          summary: "Quick summary...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Epic quests and powerful spells",
              author: "Jules Verne",
              description: "A fascinating exploration of the outer reaches of the universe..",
              pages: "320",
              format: "14 x 21 cm",
              isbn13: "978-2-XXXXX-XXX-X",
              isbn10: "2-XXXXX-XXX-X",
              language: "English",
              price: "19,90 €",
              binding: "Paperback",
              weight: "450 g",
              ean: "9782XXXXXXXXX",
              targetAge: "12 years and older",
              genre: "Science Fiction"
            }
          ]
        },
        "Fantasy-03" : {
          title: "Title of Fantasy Book",
          summary: "Quick summary...",
          releaseDate: "",
          dispo: false,
          details: [
            { text: "Enchanted forests and mythical creatures",
              author: "Jules Verne",
              description: "A fascinating exploration of the outer reaches of the universe..",
              pages: "320",
              format: "14 x 21 cm",
              isbn13: "978-2-XXXXX-XXX-X",
              isbn10: "2-XXXXX-XXX-X",
              language: "English",
              price: "19,90 €",
              binding: "Paperback",
              weight: "450 g",
              ean: "9782XXXXXXXXX",
              targetAge: "12 years and older",
              genre: "Science Fiction"
            }
          ]
        },
        "Polar-01": {
          title: "Title of the Detective Novel",
          summary: "Quick summary...",
          releaseDate: "First half of 2026",
          dispo: true,
          details: [
            { text: "Meticulously reconstructed crime scenes",
              coverImage: "policier-detail2.jpg",
              author: "Jules Verne",
              description: "A fascinating exploration of the outer reaches of the universe..",
              pages: "320",
              format: "14 x 21 cm",
              isbn13: "978-2-XXXXX-XXX-X",
              isbn10: "2-XXXXX-XXX-X",
              language: "English",
              price: "19,90 €",
              binding: "Paperback",
              weight: "450 g",
              ean: "9782XXXXXXXXX",
              targetAge: "12 years and older",
              genre: "Science Fiction"
            }
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
        shortLabel: "¿Libro aumentado?"
      }
    },
    bookSection: {
      title: "Los libros",
      detailLink: "Saber más"
    },
    bookCover: {
      publisher: "Éditions Liger",
      notFinalImage: "Imagen no contractual"
    },
    bookModal: {
      release: "📅 Salida prevista para el : ",
      dateToBeAnnounced: "Fecha por determinar",
      notAvailableInLanguage: "Este libro no está disponible en español. Cambie de idioma para ver las versiones disponibles.",
      changeLanguage: "Cambiar idioma"
    },
    collectionsSection: {
      title: "Las colecciones"
    },
    howItWorks: {
      title: "¿Qué es un libro aumentado?",
      text: "Escanear un código QR en un libro aumentado es sumergirse instantáneamente en el corazón de la historia: explore decorados en 3D fieles al relato, navegue libremente entre los lugares emblemáticos, conozca a los personajes que cobran vida ante sus ojos.\n\nNo es necesario instalar ninguna aplicación, todo se hace desde su navegador. Una vez descargada, la experiencia sigue siendo accesible incluso sin conexión. \n\n¡Descubre nuestra demo interactiva!",      
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
    bookDetails: {
      author: "Autor",
      description: "Descripción",
      pages: "Número de páginas",
      format: "Formato",
      isbn13: "ISBN-13",
      isbn10: "ISBN-10",
      publicationDate: "Fecha de publicación",
      publisher: "Editorial",
      language: "Idioma",
      price: "Precio",
      binding: "Encuadernación",
      weight: "Peso",
      ean: "EAN",
      targetAge: "Edad recomendada",
      genre: "Género",
      collection: "Colección"
    },
    books: {
        // "SF-01": {
        //   title: "Título del libro de ciencia ficción",
        //   summary: "Breve resumen del libro de ciencia ficción...",
        //   releaseDate: "",
        //   dispo: true,
        //   details: [
        //     { text: "Naves espaciales en los confines del universo " }
        //   ]
        // },
        "Fantasy-01" : {
          title: "Título del libro fantástico",
          summary: "Resumen rápido...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Bosques encantados y criaturas míticas",
              author: "Jules Verne",
              description: "Una fascinante exploración de los confines del universo...",
              pages: "320",
              format: "14 x 21 cm",
              isbn13: "978-2-XXXXX-XXX-X",
              isbn10: "2-XXXXX-XXX-X",
              language: "Español",
              price: "19,90 €",
              binding: "Broché",
              weight: "450 g",
              ean: "9782XXXXXXXXX",
              targetAge: "12 years and older",
              genre: "Cienca Ficcion"
            }
          ]
        },
        "Fantasy-02" : {
          title: "Título del libro fantástico",
          summary: "Resumen rápido...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Misiones épicas y hechizos poderosos",
              author: "Jules Verne",
              description: "Una fascinante exploración de los confines del universo...",
              pages: "320",
              format: "14 x 21 cm",
              isbn13: "978-2-XXXXX-XXX-X",
              isbn10: "2-XXXXX-XXX-X",
              language: "Español",
              price: "19,90 €",
              binding: "Broché",
              weight: "450 g",
              ean: "9782XXXXXXXXX",
              targetAge: "12 years and older",
              genre: "Cienca Ficcion"
            }
          ]
        },
        "Fantasy-03" : {
          title: "Título del libro fantástico",
          summary: "Resumen rápido...",
          releaseDate: "",
          dispo: true,
          details: [
            { text: "Bosques encantados y criaturas míticas",
              author: "Jules Verne",
              description: "Una fascinante exploración de los confines del universo...",
              pages: "320",
              format: "14 x 21 cm",
              isbn13: "978-2-XXXXX-XXX-X",
              isbn10: "2-XXXXX-XXX-X",
              language: "Español",
              price: "19,90 €",
              binding: "Broché",
              weight: "450 g",
              ean: "9782XXXXXXXXX",
              targetAge: "12 years and older",
              genre: "Cienca Ficcion"
            }
          ]
        },
        "Polar-01": {
          title: "Título del Libro Policíaco",
          summary: "Resumen rápido...",
          releaseDate: "Primer semestre de 2026",
          dispo: true,
          details: [
            { text: "Escenas del crimen minuciosamente reconstituidas ",
              coverImage: "policier-detail2.jpg",
              author: "Jules Verne",
              description: "Una fascinante exploración de los confines del universo...",
              pages: "320",
              format: "14 x 21 cm",
              isbn13: "978-2-XXXXX-XXX-X",
              isbn10: "2-XXXXX-XXX-X",
              language: "Español",
              price: "19,90 €",
              binding: "Broché",
              weight: "450 g",
              ean: "9782XXXXXXXXX",
              targetAge: "12 years and older",
              genre: "Cienca Ficcion"
            }
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
  
  // ✅ Détecter la langue UNIQUEMENT côté client
  useEffect(() => {
    // 1. D'abord vérifier localStorage
    const saved = localStorage.getItem("homepage-lang");
    if (saved && ["fr", "en", "es"].includes(saved)) {
      setLangState(saved as Lang);
      return;
    }
    
    // 2. Sinon détecter depuis le navigateur
    const browserLang = navigator.language.split("-")[0];
    
    if (["fr", "en", "es"].includes(browserLang)) {
      setLangState(browserLang as Lang);
    }
    
  }, []);
  
  // ✅ Fonction pour changer la langue + sauvegarder
  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem("homepage-lang", newLang);
  };
  
  return (
    <HomeTranslationContext.Provider value={{ lang, setLang, t: translations[lang] as any }}>
      {children}
    </HomeTranslationContext.Provider>
  );
}

export function useHomeTranslation() {
  const context = useContext(HomeTranslationContext);
  if (!context) throw new Error("useHomeTranslation must be used within HomeTranslationProvider");
  return context;
}
