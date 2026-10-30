"use client";

// Réglage « Annonces des nouveaux livres » de la fenêtre Informations (AN1, spec-annonces.md §5) : interrupteur et phrase
// d'information sur la requête faite. Absent si la fonction est inerte (aucune clé déclarée) ou le stockage indisponible.
import { useId } from "react";
import { useTranslation } from "@/contexts/TranslationContext";
import { PRIVACY_URL } from "@/annonces/config";
import { useAnnoncesSetting } from "./useAnnonces";

export default function AnnoncesSetting() {
  const { t } = useTranslation();
  const setting = useAnnoncesSetting();
  const labelId = useId();
  const infoId = useId();
  if (!setting) return null;
  return (
    <section className="mt-4 border-t border-white/25 pt-4 text-sm" aria-labelledby={labelId} data-testid="annonces-setting">
      <div className="flex items-center justify-between gap-3">
        <h3 id={labelId} className="font-semibold">
          {t.annonces.setting}
        </h3>
        <button
          type="button"
          role="switch"
          aria-checked={setting.enabled}
          aria-labelledby={labelId}
          aria-describedby={infoId}
          onClick={() => setting.setEnabled(!setting.enabled)}
          className={`relative inline-flex h-11 w-16 shrink-0 items-center rounded-full transition focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${setting.enabled ? "bg-amber-400" : "bg-white/25"}`}
          data-testid="annonces-switch"
        >
          <span aria-hidden="true" className={`absolute h-7 w-7 rounded-full bg-white shadow transition-transform ${setting.enabled ? "translate-x-8" : "translate-x-1.5"}`} />
        </button>
      </div>
      <p id={infoId} className="mt-2 text-xs text-zinc-300">
        {t.annonces.settingInfo}
        {PRIVACY_URL && (
          <>
            {" "}
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="underline">
              {t.annonces.privacy}
            </a>
          </>
        )}
      </p>
    </section>
  );
}
