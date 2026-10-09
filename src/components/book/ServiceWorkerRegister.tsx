"use client";

import { useEffect } from "react";

// D-8.4 : enregistrement manuel, chemin et scope relatifs au dossier du livre (l'enregistrement de Serwist
// utilise une URL absolue `origin + /sw.js`, fausse sous un sous-chemin). Le SW n'est généré qu'en production.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch((err) => {
      console.error("Service worker non enregistré :", err);
    });
  }, []);
  return null;
}
