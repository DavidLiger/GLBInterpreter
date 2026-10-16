"use client";
// Fournisseur de langue du lecteur (Î12, S-15, S-20, S-41). Les chaînes sont dans le module unique `src/i18n/messages.ts`.
//
// Un seul état de langue par page : un `TranslationProvider` placé sous un autre (le lecteur dans `BookApp`) réutilise
// celui du dessus, sauf s'il reçoit `lang` ou `onLangChange` (atelier, A3 : langue d'aperçu imposée par la page).
// Le fournisseur racine tient `<html lang>` à jour (S-20) ; un fournisseur à langue imposée n'y touche pas (l'atelier
// garde la langue de sa propre page).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LANG_STORAGE_KEY, MESSAGES, detectLanguage, type Lang, type Messages } from "@/i18n/messages";

export type { Lang } from "@/i18n/messages";

interface TranslationContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Messages;
}

const TranslationContext = createContext<TranslationContextType | null>(null);

/**
 * `lang` et `onLangChange` (atelier, A3) : langue imposée par la page et changement de langue fait dans le lecteur
 * (sélecteur de l'écran de chargement) renvoyé à la page. Sans ces props (livre publié), la langue est celle du
 * fournisseur parent s'il existe, sinon la langue enregistrée, sinon celle du navigateur.
 */
export function TranslationProvider({
  children,
  lang: forcedLang,
  onLangChange,
}: {
  children: ReactNode;
  lang?: Lang;
  onLangChange?: (lang: Lang) => void;
}) {
  const parent = useContext(TranslationContext);
  const own = forcedLang !== undefined || onLangChange !== undefined || parent === null;

  const [lang, setLangState] = useState<Lang>(() => forcedLang ?? detectLanguage());

  // Atelier : langue d'aperçu de la page, qui remplace la langue détectée.
  useEffect(() => {
    if (forcedLang) setLangState(forcedLang);
  }, [forcedLang]);

  // Fournisseur racine du livre : langue du document (lecteurs d'écran, césure, traduction automatique).
  const isRoot = parent === null && forcedLang === undefined;
  useEffect(() => {
    if (isRoot) document.documentElement.lang = lang;
  }, [isRoot, lang]);

  const setLang = useCallback(
    (newLang: Lang) => {
      setLangState(newLang);
      try {
        localStorage.setItem(LANG_STORAGE_KEY, newLang);
      } catch {
        /* stockage indisponible : la langue vaut pour la session */
      }
      onLangChange?.(newLang);
    },
    [onLangChange],
  );

  const value = useMemo(() => ({ lang, setLang, t: MESSAGES[lang] }), [lang, setLang]);

  if (!own) return <>{children}</>;
  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) throw new Error("useTranslation must be used within TranslationProvider");
  return context;
}
