"use client";
// Sélecteur de langue (Î12, U-25) : trois boutons FR, EN, ES toujours visibles, au lieu d'un menu déroulant à drapeaux
// (un drapeau n'est pas une langue ; le menu n'était ni fermable au clavier ni annoncé). Langue active annoncée par
// `aria-pressed` ; chaque bouton porte le nom de la langue dans cette langue (`lang`), lu correctement par un lecteur
// d'écran. Cibles de 44 px.
import { useTranslation } from "@/contexts/TranslationContext";
import { LANGS, LANG_NAMES } from "@/i18n/messages";

export default function LanguageSelector({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useTranslation();
  return (
    <div role="group" aria-label={t.lang.label} className={`inline-flex rounded-full bg-black/55 p-0.5 shadow-lg ${className}`} data-testid="language-selector">
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          aria-label={LANG_NAMES[l]}
          onClick={() => setLang(l)}
          className={`glbi-lang inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold uppercase transition ${
            lang === l ? "bg-white text-black" : "text-white hover:bg-white/15"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
