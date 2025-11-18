"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Lang = "fr" | "en" | "es";

interface TranslationContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: any; // Vos traductions
}

const TranslationContext = createContext<TranslationContextType | null>(null);

export function TranslationProvider({ children }: { children: ReactNode }) {
  // ✅ Fonction pour détecter la langue
  const detectLanguage = (): Lang => {
    // 1. D'abord vérifier localStorage
    const saved = localStorage.getItem("webdiorama-lang");
    if (saved && ["fr", "en", "es"].includes(saved)) {
      return saved as Lang;
    }
    
    // 2. Sinon détecter depuis le navigateur
    const browserLang = navigator.language.split("-")[0]; // "fr-FR" → "fr"
    
    if (["fr", "en", "es"].includes(browserLang)) {
      return browserLang as Lang;
    }
    
    // 3. Par défaut : français
    return "fr";
  };
  
  const [lang, setLangState] = useState<Lang>("fr"); // Valeur par défaut temporaire
  const [mounted, setMounted] = useState(false);
  
  // ✅ Détecter la langue au mount (côté client uniquement)
  useEffect(() => {
    const detected = detectLanguage();
    setLangState(detected);
    setMounted(true);
    console.log("🌍 Langue détectée:", detected);
  }, []);
  
  // ✅ Fonction pour changer la langue + sauvegarder
  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem("webdiorama-lang", newLang);
    console.log("💾 Langue sauvegardée:", newLang);
  };
  
  // ✅ Vos traductions (exemple minimal)
  const t = {
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
      cacheChecking: "Vérification du cache...",
      modalTitle: "📦 Téléchargement du livre",
      modalMessage: "Télécharger toutes les scènes du livre pour une utilisation hors ligne",
      storageInfo: "Espace disponible : ",
      modalSize: "Taille estimée : ~500 MB",
      cancel: "Annuler",
      download: "Télécharger",
      downloading: "Téléchargement...",
      filesProgress: "fichiers", // "{downloaded} / {total} fichiers"
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
      cacheChecking: "Checking cache...",
      modalTitle: "📦 Download book",
      modalMessage: "Download all scenes for offline use.",
      storageInfo: "Available space : ",
      modalSize: "Estimated size: ~500 MB",
      cancel: "Cancel",
      download: "Download",
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
      cacheChecking: "Comprobando la caché...",
      modalTitle: "📦 Descargar libro",
      modalMessage: "Descarga todas las escenas para uso sin conexión.",
      storageInfo: "Espacio disponible : ",
      modalSize: "Tamaño estimado: ~500 MB",
      cancel: "Cancelar",
      download: "Descargar",
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
    }
  }
};
  
  // ✅ Ne pas render avant le mount (évite hydration mismatch)
  if (!mounted) {
    return null;
  }
  
  return (
    <TranslationContext.Provider value={{ lang, setLang, t }}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) throw new Error("useTranslation doit être dans TranslationProvider");
  return context;
}