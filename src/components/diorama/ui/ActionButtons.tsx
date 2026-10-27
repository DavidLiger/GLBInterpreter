"use client";

// Boutons du mode `buttons` (Î10b, finis en Î12) : un bouton par action, dans l'ordre du GLB ; libellé de la couche
// éditoriale dans la langue courante, icône si elle est déclarée (décorative : le libellé nomme le bouton).
// Accessibilité : groupe nommé, action en cours annoncée par `aria-pressed`, cibles d'au moins 44 px (U-03), focus
// visible, clavier natif (Tab, Entrée, Espace). Placement dans les zones sûres sans recouvrir les contrôles du coin
// (classe `glbi-actions`, globals.css).
import React from "react";
import type { ButtonsModeAction } from "@/types/diorama";
import type { LocalizedText } from "@/schema/glbi";
import { useTranslation } from "@/contexts/TranslationContext";

type Props = {
  actions: ButtonsModeAction[];
  lang: keyof LocalizedText;
  currentId: string | null;
  /** Derniers événements `id:phase` (attribut `data-action-log`, lu par les tests). */
  log?: string[];
  /** Derniers événements d'action franchis `action:événement` (AC2, attribut `data-event-log`, lu par les tests). */
  eventLog?: string[];
  onTrigger: (id: string) => void;
  /** Contenu posé juste au-dessus de la barre, quelle que soit sa hauteur (CC1 : bandeau « Nouvelle carte ! »). */
  above?: React.ReactNode;
};

export default function ActionButtons({ actions, lang, currentId, log = [], eventLog = [], onTrigger, above }: Props) {
  const { t } = useTranslation();
  if (!actions.length) return null;
  return (
    <div
      role="group"
      aria-label={t.actions.group}
      className="glbi-actions z-40"
      data-testid="action-buttons"
      data-current-action={currentId ?? ""}
      data-action-log={log.join(" ")}
      data-event-log={eventLog.join(" ")}
    >
      {actions.map((a) => {
        const active = a.id === currentId;
        return (
          <button
            key={a.id}
            type="button"
            data-action-id={a.id}
            aria-pressed={active}
            onClick={() => onTrigger(a.id)}
            className="glbi-action"
          >
            {a.icon && (
              // eslint-disable-next-line @next/next/no-img-element -- export statique (D-7.5)
              <img src={a.icon} alt="" className="h-7 w-7 object-contain" draggable={false} />
            )}
            <span>{a.label[lang] ?? a.label.fr}</span>
          </button>
        );
      })}
      {above && <div className="glbi-actions-above">{above}</div>}
    </div>
  );
}
