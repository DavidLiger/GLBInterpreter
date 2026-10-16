"use client";

import { useEffect } from "react";
import { TranslationProvider, useTranslation } from "@/contexts/TranslationContext";

// Limite d'erreur de la page du livre (S-28) : une exception de rendu affiche cet écran au lieu d'une page blanche.
// Rendue au-dessus de `BookApp` : elle a son propre fournisseur de langue (langue enregistrée ou du navigateur, Î12).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Erreur de rendu :", error);
  }, [error]);

  return (
    <TranslationProvider>
      <ErrorScreen reset={reset} />
    </TranslationProvider>
  );
}

function ErrorScreen({ reset }: { reset: () => void }) {
  const { t } = useTranslation();
  return (
    <main className="glbi-safe-padding min-h-dvh flex flex-col items-center justify-center gap-4 bg-black text-white text-center">
      <h1 className="text-2xl font-bold">{t.appError.title}</h1>
      <p className="text-white/80">{t.appError.message}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => reset()} className="glbi-btn glbi-btn-secondary">
          {t.common.retry}
        </button>
        <button type="button" onClick={() => window.location.reload()} className="glbi-btn glbi-btn-secondary">
          {t.common.reload}
        </button>
      </div>
    </main>
  );
}
