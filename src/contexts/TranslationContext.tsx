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
      demoTitle: "📦 Téléchargement de la démo",
      demoMessage: "Téléchargez la démo pour découvrir les WebDioramas",
      storageInfo: "Espace disponible : ",
      modalSize: "Taille estimée : ~500 MB",
      cancel: "Annuler",
      download: "Télécharger",
      downloadAssets: "📥 Télécharger les assets",
      downloading: "Téléchargement...",
      filesProgress: "fichiers",
      retry: "Réessayer",
      close: "Fermer",
      requiredSpace: "Requis:",
      criticalStorage: "⚠️ Espace insuffisant ! Libérez de l'espace avant de continuer.",
      lowStorage: "⚠️ Espace limité. Le téléchargement pourrait échouer."
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
    deviceTester: {
      title: "Test de compatibilité",
      description: "Vérifions que votre appareil peut faire tourner l'application correctement. Ce test prend environ 10 secondes.",
      start: "Démarrer le test",
      skip: "Passer",
      testing: "Test en cours...",
      resultPassed: "Appareil compatible !",
      resultFailed: "Performances limitées",
      continue: "Continuer",
      continueAnyway: "Continuer quand même",
      warningMessage: "L'expérience pourrait être dégradée sur cet appareil.",
      GPUDetectorTitle: "Carte graphique détectée",
      GPUDetecting: "Détection GPU",
      WEBGLCapacitiesTitle: "Analyse capacités WebGL",
      MemoryCheckTitle: "Vérification mémoire",
      ThreeDPERFTestTitle: "Test de performance 3D",
      completesAnalysisTitle: "✓ Analyse terminée, préparation des résultats...",
      FPSAverage: "FPS Moyen",
      GPUPower: "Puissance GPU",
      FPSMin: "FPS Min (p5)",
      lowest5PerCent: "5% le plus bas",
      memoryTitle: "Mémoire",
      graphicsCardTitle: "Carte graphique",
      detectedProblems: "❌ Problèmes détectés :",
      warningsTitle: "⚠️ Avertissements :",
      testRetry: "🔄 Refaire le test",
      advicesTitle: "💡 Conseils pour améliorer les performances",
      closeApps: "Fermez les autres applications et onglets du navigateur",
      disableEnergySaver: "Désactivez l'économiseur de batterie ou le mode économie d'énergie",
      enablePerfMode: "Activez le mode « Performances » dans les paramètres système",
      reduceLight: "Réduisez la luminosité de l'écran et fermez le multitâche",
      controlHeating: "Assurez-vous que votre appareil n'est pas en surchauffe",
      highPerfMode: "Connectez votre téléphone au chargeur pour activer le mode haute performance",
      finalNote: "Ces conseils peuvent améliorer temporairement les performances, mais ne remplaceront pas un appareil plus puissant.",
      resultsLoading: "Chargement résultats...",
      low: "Faible",
      medium: "Moyen",
      high: "Élevé",
      preparing: "Préparation de l'expérience...",
      noWebGL: "❌ WebGL non disponible ou en mode compatibilité",
      impossible: "Votre navigateur ne peut pas utiliser l'accélération matérielle 3D.",
      impossible2: "L'expérience sera très dégradée ou impossible.",
      checkBrowserParams: "• Vérifiez que WebGL est activé dans les paramètres du navigateur",
      tryAnotherBrowser: "• Essayez un autre navigateur (Chrome, Edge, Safari)",
      updateGPUDriver: "• Mettez à jour vos pilotes graphiques"
    },
    restart: {
      title: "Scène en pause",
      message: "La scène a été mise en pause pour économiser la mémoire.",
      button: "⚡ Relancer la scène"
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
      demoTitle: "📦 Download the demo",
      demoMessage: "Download the demo to discover WebDioramas",
      storageInfo: "Available space : ",
      modalSize: "Estimated size: ~500 MB",
      cancel: "Cancel",
      download: "Download",
      downloadAssets: "📥 Download assets",
      downloading: "Downloading...",
      filesProgress: "files",
      retry: "Try again",
      close: "Close",
      requiredSpace: "Required:",
      criticalStorage: "⚠️ Insufficient space! Free up some space before continuing.",
      lowStorage: "⚠️ Limited space. Download may fail."
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
    deviceTester: {
      title: "Compatibility test",
      description: "Let us verify that your device can run the application correctly. This test takes approximately 10 seconds.",
      start: "Start the test",
      skip: "Pass",
      testing: "Testing in progress...",
      resultPassed: "Compatible device!",
      resultFailed: "Limited performance",
      continue: "Continue",
      continueAnyway: "Keep going anyway",
      warningMessage: "The experience may be degraded on this device.",
      GPUDetectorTitle: "Graphics card detected",
      GPUDetecting: "GPU detection",
      WEBGLCapacitiesTitle: "WebGL capabilities analysis",
      MemoryCheckTitle: "Memory check",
      ThreeDPERFTestTitle: "3D performance test",
      completesAnalysisTitle: "✓ Analysis completed, preparation of results...",
      FPSAverage: "Medium FPS",
      GPUPower: "GPU power",
      FPSMin: "Min FPS (p5)",
      lowest5PerCent: "lowest 5%",
      memoryTitle: "Memory",
      graphicsCardTitle: "Graphics card",
      detectedProblems: "❌ Problems detected :",
      warningsTitle: "⚠️ Warnings :",
      testRetry: "🔄 Retake the test",
      advicesTitle: "💡 Tips for improving performance",
      closeApps: "Close other applications and browser tabs.",
      disableEnergySaver: "Disable battery saver or power saving mode",
      enablePerfMode: "Enable ‘Performance’ mode in the system settings.",
      reduceLight: "Reduce screen brightness and close multitasking",
      controlHeating: "Ensure that your device is not overheating.",
      highPerfMode: "Connect your phone to the charger to activate high-performance mode.",
      finalNote: "These tips may temporarily improve performance, but they will not replace a more powerful device.",
      resultsLoading: "Loading results...",
      low: "Low",
      medium: "Medium",
      high: "High",
      preparing: "Preparing for the experiment...",
      noWebGL: "❌ WebGL unavailable or in compatibility mode",
      impossible: "Your browser cannot use 3D hardware acceleration.",
      impossible2: "The experience will be significantly degraded or impossible.",
      checkBrowserParams: "• Check that WebGL is enabled in your browser settings.",
      tryAnotherBrowser: "• Try another browser (Chrome, Edge, Safari)",
      updateGPUDriver: "• Update your graphics drivers"
    },
    restart: {
      title: "Scene on hold",
      message: "The scene has been paused to save memory.",
      button: "⚡ Restart the scene"
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
      demoTitle: "📦 Descargar la demo",
      demoMessage: "Descargue la demo para descubrir los WebDioramas.",
      storageInfo: "Espacio disponible : ",
      modalSize: "Tamaño estimado: ~500 MB",
      cancel: "Cancelar",
      download: "Descargar",
      downloadAssets: "📥 Descargar los recursos",
      downloading: "Descargando...",
      filesProgress: "archivos",
      retry: "Reintentar",
      close: "Cerrar",
      requiredSpace: "Obligatorio:",
      criticalStorage: "⚠️ ¡Espacio insuficiente! Libere espacio antes de continuar.",
      lowStorage: "⚠️ Espacio limitado. La descarga podría fallar."
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
    deviceTester: {
      title: "Prueba de compatibilidad",
      description: "Comprobemos que tu dispositivo puede ejecutar la aplicación correctamente. Esta prueba dura unos 10 segundos.",
      start: "Iniciar la prueba",
      skip: "Pasar",
      testing: "Prueba en curso...",
      resultPassed: "¡Dispositivo compatible!",
      resultFailed: "Rendimiento limitado",
      continue: "Continuar",
      continueAnyway: "Continuar de todos modos",
      warningMessage: "La experiencia podría verse afectada en este dispositivo.",
      GPUDetectorTitle: "Tarjeta gráfica detectada",
      GPUDetecting: "Detección de GPU",
      WEBGLCapacitiesTitle: "Análisis de capacidades WebG",
      MemoryCheckTitle: "Verificación de memoria",
      ThreeDPERFTestTitle: "Prueba de rendimiento 3D",
      completesAnalysisTitle: "✓ Análisis completado, preparación de los resultados...",
      FPSAverage: "FPS medio",
      GPUPower: "Potencia de la GPU",
      FPSMin: "FPS mín. (p5)",
      lowest5PerCent: "5 % más bajo",
      memoryTitle: "Memoria",
      graphicsCardTitle: "Tarjeta gráfica",
      detectedProblems: "❌ Problemas detectados :",
      warningsTitle: "⚠️ Advertencias :",
      testRetry: "🔄 Rehacer la prueba",
      advicesTitle: "💡 Consejos para mejorar el rendimiento",
      closeApps: "Cierre las demás aplicaciones y pestañas del navegador.",
      disableEnergySaver: "Desactive el ahorro de batería o el modo de ahorro de energía.",
      enablePerfMode: "Activa el modo «Rendimiento» en los ajustes del sistema.",
      reduceLight: "Reduzca el brillo de la pantalla y cierre la multitarea.",
      controlHeating: "Asegúrese de que su dispositivo no se sobrecaliente.",
      highPerfMode: "Conecte su teléfono al cargador para activar el modo de alto rendimiento.",
      finalNote: "Estos consejos pueden mejorar temporalmente el rendimiento, pero no sustituyen a un dispositivo más potente.",
      resultsLoading: "Cargando resultados...",
      low: "Bajo",
      medium: "Medio",
      high: "Elevado",
      preparing: "Preparación del experimento...",
      noWebGL: "❌ WebGL no disponible o en modo compatibilidad",
      impossible: "Su navegador no puede utilizar la aceleración 3D por hardware.",
      impossible2: "La experiencia será muy deficiente o imposible.",
      checkBrowserParams: "• Comprueba que WebGL está activado en la configuración del navegador.",
      tryAnotherBrowser: "• Prueba con otro navegador (Chrome, Edge, Safari).",
      updateGPUDriver: "• Actualiza tus controladores gráficos."
    },
    restart: {
      title: "Escena en pausa",
      message: "La escena se ha pausado para ahorrar memoria.",
      button: "⚡ Reiniciar la escena"
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