"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/contexts/TranslationContext";

// D-8.4 : enregistrement manuel, chemin et scope relatifs au dossier du livre (l'enregistrement de Serwist
// utilise une URL absolue `origin + /sw.js`, fausse sous un sous-chemin). Le SW n'est généré qu'en production.
//
// O-28 (Î8) : le SW ne prend pas la main tout seul (`skipWaiting` retiré). Quand une nouvelle version attend, une
// invite « Recharger » s'affiche, jamais pendant une scène (`inScene`) ; le clic active la nouvelle version et recharge.
export default function ServiceWorkerRegister({ inScene }: { inScene: boolean }) {
  const { t } = useTranslation();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .then((reg) => {
        const offer = (sw: ServiceWorker | null) => {
          // Sans contrôleur, c'est la première installation : le SW s'active seul, rien à proposer.
          if (!cancelled && sw && navigator.serviceWorker.controller) setWaiting(sw);
        };
        offer(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed") offer(sw);
          });
        });
      })
      .catch((err) => console.error("Service worker non enregistré :", err));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!waiting || inScene) return null;

  const apply = () => {
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    waiting.postMessage({ type: "SKIP_WAITING" });
  };

  return (
    <div className="fixed bottom-4 inset-x-4 z-[10000] mx-auto max-w-md flex items-center justify-between gap-3 rounded-2xl bg-white text-black px-4 py-3 shadow-lg">
      <span className="text-sm">{t.install.newVersion}</span>
      <button onClick={apply} className="min-h-11 px-4 rounded-full bg-black text-white text-sm font-bold">
        {t.install.reload}
      </button>
    </div>
  );
}
