"use client";

import { useEffect } from "react";

// Limite d'erreur de la page du livre (S-28) : une exception de rendu affiche cet écran au lieu d'une page blanche.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Erreur de rendu :", error);
  }, [error]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-black text-white p-6 text-center">
      <h1 className="text-2xl font-bold">Une erreur est survenue</h1>
      <p className="text-white/70">L&apos;application a rencontré un problème inattendu.</p>
      <div className="flex gap-3">
        <button onClick={() => reset()} className="px-6 py-3 rounded-full bg-white/15 hover:bg-white/25 transition">
          Réessayer
        </button>
        <button onClick={() => window.location.reload()} className="px-6 py-3 rounded-full bg-white/15 hover:bg-white/25 transition">
          Recharger
        </button>
      </div>
    </main>
  );
}
