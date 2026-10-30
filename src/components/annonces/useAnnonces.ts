"use client";

// Annonces dans le livre (AN1, spec-annonces.md §4, §5) : lecture du flux à l'affichage du menu de collection, réglage.
// Le module de lecture (`annonces/check.ts`) n'est chargé que si une lecture est due ; rien n'est chargé ni demandé sans
// clé déclarée, réglage désactivé, hors ligne ou dans les 7 jours qui suivent la dernière lecture.
import { useCallback, useEffect, useState } from "react";
import { annoncesSetup } from "@/annonces/config";
import { AnnoncesStore, isDue, isEnabled, withSeen } from "@/annonces/store";
import type { FoundAnnonce } from "@/annonces/check";
import { pageStorage } from "@/components/book/progress";

/**
 * Annonce à montrer dans le menu du livre `bookId` (`null` : cartouche fixture, pas de progression, rien). Lue une fois
 * par montage du menu ; menu quitté avant la réponse : lecture abandonnée, rien n'est montré ni retenu.
 */
export function useMenuAnnonce(bookId: string | null) {
  const [found, setFound] = useState<FoundAnnonce | null>(null);
  useEffect(() => {
    const setup = annoncesSetup();
    if (!bookId || !setup) return;
    const store = new AnnoncesStore(pageStorage());
    const { ok, state } = store.read();
    if (!ok || !isEnabled(state) || !navigator.onLine || !isDue(state, new Date())) return;
    const ctrl = new AbortController();
    import("@/annonces/check")
      .then(({ checkAnnonces }) =>
        checkAnnonces({
          setup,
          bookId,
          storage: pageStorage(),
          fetch: (input, init) => window.fetch(input, init),
          subtle: crypto.subtle,
          now: () => new Date(),
          online: navigator.onLine,
          signal: ctrl.signal,
        }),
      )
      .then(
        (f) => {
          if (f && !ctrl.signal.aborted) setFound(f);
        },
        (e: Error) => console.warn(`annonces : ${e.message}`),
      );
    return () => ctrl.abort();
  }, [bookId]);

  /** Annonce affichée : vue, elle ne sera plus montrée (§5). */
  const markSeen = useCallback(() => {
    if (found) new AnnoncesStore(pageStorage()).update((s) => withSeen(s, found.annonce.id));
  }, [found]);
  const close = useCallback(() => setFound(null), []);
  /** « Ne plus afficher » : réglage désactivé (§5). */
  const stop = useCallback(() => {
    new AnnoncesStore(pageStorage()).update((s) => ({ ...s, enabled: false }));
    setFound(null);
  }, []);
  return { found, markSeen, close, stop };
}

/** Réglage « Annonces des nouveaux livres » : `null` si la fonction est inerte (aucune clé) ou le stockage indisponible. */
export function useAnnoncesSetting(): { enabled: boolean; setEnabled: (v: boolean) => void } | null {
  const [state, setState] = useState<{ available: boolean; enabled: boolean }>({ available: false, enabled: false });
  useEffect(() => {
    if (!annoncesSetup()) return;
    const r = new AnnoncesStore(pageStorage()).read();
    setState({ available: r.ok, enabled: isEnabled(r.state) });
  }, []);
  const setEnabled = useCallback((v: boolean) => {
    if (new AnnoncesStore(pageStorage()).update((s) => ({ ...s, enabled: v }))) setState({ available: true, enabled: v });
  }, []);
  return state.available ? { enabled: state.enabled, setEnabled } : null;
}
