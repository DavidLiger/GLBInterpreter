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
    install: {
      checking: "Vérification du livre…",
      title: "Installer le livre",
      updateTitle: "Mise à jour du livre",
      repairTitle: "Compléter le livre",
      intro: "Toutes les scènes du livre sont téléchargées une seule fois sur cet appareil. Ensuite, le livre fonctionne sans connexion.",
      updateIntro: "Une nouvelle version du livre est disponible. Seuls les fichiers modifiés sont téléchargés.",
      repairIntro: "Des fichiers du livre manquent sur cet appareil. Ils doivent être retéléchargés.",
      bookSize: "Taille du livre :",
      toDownload: "À télécharger :",
      available: "Espace disponible :",
      lowSpace: "L'espace disponible semble insuffisant. Libérez de la place si le téléchargement échoue.",
      wifi: "Conseil : utilisez le Wi-Fi et laissez l'application ouverte pendant le téléchargement.",
      install: "Installer",
      update: "Mettre à jour",
      keepCurrent: "Continuer avec la version installée",
      downloading: "Téléchargement…",
      files: "fichiers",
      pause: "Mettre en pause",
      resume: "Reprendre",
      retry: "Réessayer",
      paused: "Téléchargement en pause. Ce qui est déjà téléchargé est conservé.",
      errorNetwork: "La connexion a été interrompue. Ce qui est déjà téléchargé est conservé.",
      errorIntegrity: "Un fichier reçu est incorrect. Réessayez ; si le problème continue, le livre en ligne est peut-être en cours de mise à jour.",
      errorQuota: "Espace de stockage insuffisant sur l'appareil. Libérez de la place puis reprenez.",
      errorOther: "Le téléchargement a échoué.",
      offlineTitle: "Connexion requise",
      offline: "Le livre n'est pas encore installé sur cet appareil. Connectez-vous à Internet pour l'installer.",
      unsupportedTitle: "Installation impossible",
      unsupported: "Ce navigateur ne permet pas d'installer le livre (navigation privée ou adresse non sécurisée). Ouvrez le lien dans Safari ou Chrome.",
      invalidTitle: "Livre illisible",
      interrupted: "Le téléchargement précédent s'est arrêté pendant l'étape :",
      newVersion: "Une nouvelle version de l'application est prête.",
      reload: "Recharger",
      megabytes: "Mo"
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
    },
    restart: {
      title: "Scène en pause",
      message: "La scène a été mise en pause pour économiser la mémoire.",
      button: "⚡ Relancer la scène"
    },
    loadError: {
      title: "Impossible de charger la scène",
      message: "Vérifiez votre connexion puis réessayez. Si le problème persiste, fermez l'onglet et rouvrez le lien.",
      button: "Recharger la scène"
    },
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
    install: {
      checking: "Checking the book…",
      title: "Install the book",
      updateTitle: "Book update",
      repairTitle: "Complete the book",
      intro: "All the book's scenes are downloaded once to this device. After that, the book works offline.",
      updateIntro: "A new version of the book is available. Only changed files are downloaded.",
      repairIntro: "Some of the book's files are missing on this device. They must be downloaded again.",
      bookSize: "Book size:",
      toDownload: "To download:",
      available: "Available space:",
      lowSpace: "Available space looks too small. Free up some space if the download fails.",
      wifi: "Tip: use Wi-Fi and keep the app open during the download.",
      install: "Install",
      update: "Update",
      keepCurrent: "Continue with the installed version",
      downloading: "Downloading…",
      files: "files",
      pause: "Pause",
      resume: "Resume",
      retry: "Try again",
      paused: "Download paused. What has already been downloaded is kept.",
      errorNetwork: "The connection was interrupted. What has already been downloaded is kept.",
      errorIntegrity: "A received file is incorrect. Try again; if it keeps happening, the online book may be being updated.",
      errorQuota: "Not enough storage space on the device. Free up some space, then resume.",
      errorOther: "The download failed.",
      offlineTitle: "Connection required",
      offline: "The book is not installed on this device yet. Connect to the Internet to install it.",
      unsupportedTitle: "Installation not possible",
      unsupported: "This browser cannot install the book (private browsing or insecure address). Open the link in Safari or Chrome.",
      invalidTitle: "Unreadable book",
      interrupted: "The previous download stopped during this step:",
      newVersion: "A new version of the app is ready.",
      reload: "Reload",
      megabytes: "MB"
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
    },
    restart: {
      title: "Scene on hold",
      message: "The scene has been paused to save memory.",
      button: "⚡ Restart the scene"
    },
    loadError: {
      title: "The scene could not be loaded",
      message: "Check your connection and try again. If the problem persists, close the tab and reopen the link.",
      button: "Reload the scene"
    },
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
    install: {
      checking: "Comprobando el libro…",
      title: "Instalar el libro",
      updateTitle: "Actualización del libro",
      repairTitle: "Completar el libro",
      intro: "Todas las escenas del libro se descargan una sola vez en este dispositivo. Después, el libro funciona sin conexión.",
      updateIntro: "Hay una nueva versión del libro. Solo se descargan los archivos modificados.",
      repairIntro: "Faltan archivos del libro en este dispositivo. Hay que volver a descargarlos.",
      bookSize: "Tamaño del libro:",
      toDownload: "Por descargar:",
      available: "Espacio disponible:",
      lowSpace: "El espacio disponible parece insuficiente. Libera espacio si la descarga falla.",
      wifi: "Consejo: usa wifi y deja la aplicación abierta durante la descarga.",
      install: "Instalar",
      update: "Actualizar",
      keepCurrent: "Seguir con la versión instalada",
      downloading: "Descargando…",
      files: "archivos",
      pause: "Pausar",
      resume: "Reanudar",
      retry: "Reintentar",
      paused: "Descarga en pausa. Lo ya descargado se conserva.",
      errorNetwork: "Se interrumpió la conexión. Lo ya descargado se conserva.",
      errorIntegrity: "Un archivo recibido es incorrecto. Reinténtalo; si sigue ocurriendo, puede que el libro en línea se esté actualizando.",
      errorQuota: "No hay espacio suficiente en el dispositivo. Libera espacio y reanuda.",
      errorOther: "La descarga ha fallado.",
      offlineTitle: "Se necesita conexión",
      offline: "El libro aún no está instalado en este dispositivo. Conéctate a Internet para instalarlo.",
      unsupportedTitle: "Instalación imposible",
      unsupported: "Este navegador no puede instalar el libro (navegación privada o dirección no segura). Abre el enlace en Safari o Chrome.",
      invalidTitle: "Libro ilegible",
      interrupted: "La descarga anterior se detuvo durante el paso:",
      newVersion: "Hay una nueva versión de la aplicación lista.",
      reload: "Recargar",
      megabytes: "MB"
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
    },
    restart: {
      title: "Escena en pausa",
      message: "La escena se ha pausado para ahorrar memoria.",
      button: "⚡ Reiniciar la escena"
    },
    loadError: {
      title: "No se pudo cargar la escena",
      message: "Comprueba tu conexión e inténtalo de nuevo. Si el problema persiste, cierra la pestaña y vuelve a abrir el enlace.",
      button: "Recargar la escena"
    },
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
  }, []);
  
  // ✅ Fonction pour changer la langue + sauvegarder
  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem("webdiorama-lang", newLang);
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