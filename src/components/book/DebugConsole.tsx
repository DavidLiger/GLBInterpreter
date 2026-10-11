"use client";

// Console de débogage dans la page (Î8, test sur iPhone sans Mac ni Web Inspector) : Eruda (logs, erreurs, réseau,
// stockage, Cache Storage, service worker). Chargée par import dynamique seulement avec `#/debug` ou `?debug=1` ; le
// chunk fait partie de l'export (et du livre téléchargé) mais n'est jamais exécuté sans le paramètre. Une fois
// activée, elle reste active pour l'onglet (sessionStorage), y compris dans les scènes.
import { useEffect } from "react";

const FLAG = "glbi:debug";
let loaded = false;

function wanted(): boolean {
  try {
    if (window.location.hash === "#/debug" || new URLSearchParams(window.location.search).get("debug") === "1") {
      sessionStorage.setItem(FLAG, "1");
      return true;
    }
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

async function load(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const { default: eruda } = await import("eruda");
  eruda.init();
  console.info("Console de débogage active (désactiver : fermer l'onglet). Trace d'installation : localStorage glbi:install-trace");
}

export default function DebugConsole() {
  useEffect(() => {
    const onHash = () => {
      if (!wanted()) return;
      void load();
      // `#/debug` n'est pas une scène : retour à l'accueil, la console reste.
      if (window.location.hash === "#/debug") window.location.replace("#/");
    };
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return null;
}
