"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Lang = "fr" | "en" | "es";

const translations = {
  fr: {
    loader: { start: "Cliquer pour commencer", startMobile: "Toucher pour commencer", browserWarning: "⚠️ Pour une expérience optimale, utilisez Chrome ou Brave" },
    info: {
      title: "Informations",
      rotate: "Tourner la scène",
      zoom: "Zoomer",
      poi: "Cliquer sur les icônes des lieux",
      sound: "Activer / désactiver le son",
      subtitles: "Afficher / masquer les textes",
      music: "Musiques :",
      sounds: "Bruitages :",
      licenses: "Licences :",
      rotateMobile: "(glisser avec un doigt)",
      rotateDesktop: "(cliquer-glisser souris)",
      zoomMobile: "(pincer deux doigts)",
      zoomDesktop: "(molette souris)",
      recommendedBrowsers: "Navigateurs recommandés : Chrome, Brave, Safari (iOS)"
    },
    downloadSuggestion: {
      title: "Gagnez du temps !",
      message: "Téléchargez tous les dioramas pour en profiter plus facilement",
      action: "Télécharger"
    },
    bookDownload: {
      required: "Téléchargement requis pour accéder à la scène",
      cacheChecking: "Vérification du cache...",
      modalTitle: "📦 Téléchargement du livre",
      modalMessage: "Télécharger toutes les scènes du livre pour une utilisation hors ligne",
      storageInfo: "Espace disponible : ",
      modalSize: "Taille estimée : ~500 MB",
      cancel: "Annuler",
      download: "Télécharger",
      downloadAssets: "📥 Télécharger les assets",
      downloading: "Téléchargement...",
      filesProgress: "fichiers",
      retry: "Réessayer",
      close: "Fermer"
    },
    webglErrorScreen: {
      title: "Oups, tout le monde s'est endormi !",
      technicalMessageWebglError: "(Le contexte 3D a fait une sieste)",
      technicalMessageWebglNotError: "(Le navigateur n'a pas voulu se réveiller)",
      boutonTitle : "Allez, debout là-dedans !",
      boutonSubTitle : "Relancer l'application",
      technicalNote : "💡 Si le problème persiste, fermez complètement l'onglet puis fermer le navigateur et rouvrez le lien"
    },
    reload: {
      sleep: "Mise en veille...",
      preparing: "Préparation de la scène...",
      optimizing: "Optimisation mémoire GPU"
    }
  },
  en: {
    loader: { start: "Click to start", startMobile: "Tap to start", browserWarning: "⚠️ For optimal experience, use Chrome or Brave" },
    info: {
      title: "Information",
      rotate: "Rotate scene",
      zoom: "Zoom",
      poi: "Click on location icons",
      sound: "Toggle sound",
      subtitles: "Show / hide text",
      music: "Music:",
      sounds: "Sound effects:",
      licenses: "Licenses:",
      rotateMobile: "(swipe with one finger)",
      rotateDesktop: "(click and drag with the mouse)",
      zoomMobile: "(pinch with two fingers)",
      zoomDesktop: "(mouse wheel)",
      recommendedBrowsers: "Recommended browsers: Chrome, Brave, Safari (iOS)"
    },
    downloadSuggestion: {
      title: "Save time!",
      message: "Download all dioramas to enjoy them more easily",
      action: "Download"
    },
    bookDownload: {
      required: "Download required to access the scene",
      cacheChecking: "Checking cache...",
      modalTitle: "📦 Download book",
      modalMessage: "Download all scenes for offline use.",
      storageInfo: "Available space : ",
      modalSize: "Estimated size: ~500 MB",
      cancel: "Cancel",
      download: "Download",
      downloadAssets: "📥 Download assets",
      downloading: "Downloading...",
      filesProgress: "files",
      retry: "Try again",
      close: "Close"
    },
    webglErrorScreen: {
      title: "Oops, everyone has fallen asleep!",
      technicalMessageWebglError: "(The 3D context took a nap)",
      technicalMessageWebglNotError: "(The browser did not want to wake up)",
      boutonTitle : "Come on, get up in there!",
      boutonSubTitle : "Restart the application",
      technicalNote : "💡 If the problem persists, close the tab completely, then close the browser and reopen the link."
    },
    reload: {
      sleep: "Standby mode...",
      preparing: "Preparing the stage...",
      optimizing: "GPU memory optimisation"
    }
  },
  es: {
    loader: { start: "Clic para comenzar", startMobile: "Toca para comenzar", browserWarning: "⚠️ Para una experiencia óptima, use Chrome o Brave" },
    info: {
      title: "Información",
      rotate: "Girar escena",
      zoom: "Zoom",
      poi: "Hacer clic en los iconos",
      sound: "Activar / desactivar sonido",
      subtitles: "Mostrar / ocultar texto",
      music: "Música:",
      sounds: "Efectos de sonido:",
      licenses: "Licencias:",
      rotateMobile: "(deslizar con un dedo)",
      rotateDesktop: "(hacer clic y arrastrar con el ratón)",
      zoomMobile: "(pellizcar con dos dedos)",
      zoomDesktop: "(rueda del ratón)",
      recommendedBrowsers: "Navegadores recomendados: Chrome, Brave, Safari (iOS)"
    },
    downloadSuggestion: {
      title: "¡Ahorra tiempo!",
      message: "Descarga todos los dioramas para disfrutarlos más fácilmente",
      action: "Descargar"
    },
    bookDownload: {
      required: "Descarga necesaria para acceder a la escena",
      cacheChecking: "Comprobando la caché...",
      modalTitle: "📦 Descargar libro",
      modalMessage: "Descarga todas las escenas para uso sin conexión.",
      storageInfo: "Espacio disponible : ",
      modalSize: "Tamaño estimado: ~500 MB",
      cancel: "Cancelar",
      download: "Descargar",
      downloadAssets: "📥 Descargar los recursos",
      downloading: "Descargando...",
      filesProgress: "archivos",
      retry: "Reintentar",
      close: "Cerrar"
    },
    webglErrorScreen: {
      title: "¡Vaya, todo el mundo se ha quedado dormido!",
      technicalMessageWebglError: "(El contexto 3D se ha tomado un descanso)",
      technicalMessageWebglNotError: "(El navegador no se ha querido despertar)",
      boutonTitle : "¡Vamos, levántate!",
      boutonSubTitle : "Reiniciar la aplicación",
      technicalNote : "💡 Si el problema persiste, cierre completamente la pestaña, cierre el navegador y vuelva a abrir el enlace."
    },
    reload: {
      sleep: "Modo de espera...",
      preparing: "Preparación del escenario...",
      optimizing: "Optimización de la memoria GPU"
    }
  }
};

interface TranslationContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: typeof translations.fr;
}

const TranslationContext = createContext<TranslationContextType | null>(null);

export function TranslationProvider({ children }: { children: ReactNode }) {
  // ✅ Fonction pour détecter la langue
  const detectLanguage = (): Lang => {
    if (typeof window === "undefined") return "fr"; // SSR fallback
    
    // 1. D'abord vérifier localStorage
    const saved = localStorage.getItem("webdiorama-lang");
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
  
  const [lang, setLangState] = useState<Lang>(() => detectLanguage()); // ✅ Initialiser avec la fonction
  
  // ✅ Détecter la langue au mount (côté client uniquement)
  useEffect(() => {
    const detected = detectLanguage();
    if (detected !== lang) {
      setLangState(detected);
    }
    console.log("🌍 Langue détectée:", detected);
  }, []);
  
  // ✅ Fonction pour changer la langue + sauvegarder
  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem("webdiorama-lang", newLang);
      console.log("💾 Langue sauvegardée:", newLang);
    }
  };
  
  // ✅ TOUJOURS render le provider (pas de return null)
  return (
    <TranslationContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) throw new Error("useTranslation must be used within TranslationProvider");
  return context;
}