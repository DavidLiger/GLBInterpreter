"use client";
import React, { createContext, useContext, useState, useEffect } from "react";

type Lang = "fr" | "en" | "es";

const translations = {
  fr: {
    loader: { start: "Cliquer pour commencer", startMobile: "Toucher pour commencer" },
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
    }
  },
  en: {
    loader: { start: "Click to start", startMobile: "Tap to start" },
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
    }
  },
  es: {
    loader: { start: "Clic para comenzar", startMobile: "Toca para comenzar" },
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
    }
  }
};

const TranslationContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
  t: typeof translations.fr;
}>({ lang: "fr", setLang: () => {}, t: translations.fr });

export const TranslationProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState<Lang>("fr");

  useEffect(() => {
    const detected = navigator.language.split("-")[0] as Lang;
    if (["fr", "en", "es"].includes(detected)) setLang(detected);
  }, []);

  return (
    <TranslationContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </TranslationContext.Provider>
  );
};

export const useTranslation = () => useContext(TranslationContext);