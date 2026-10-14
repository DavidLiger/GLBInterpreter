"use client";

// Boutons du mode `buttons` (Î10b) : un bouton par action, dans l'ordre du GLB ; libellé dans la langue courante,
// icône si elle est déclarée. Volontairement simples : cibles tactiles ≥ 44 px, `aria-pressed`, traductions de
// l'interface et style du livre relèvent d'Î12.
import React from "react";
import type { ButtonsModeAction } from "@/types/diorama";
import type { LocalizedText } from "@/schema/glbi";

type Props = {
  actions: ButtonsModeAction[];
  lang: keyof LocalizedText;
  currentId: string | null;
  /** Derniers événements `id:phase` (attribut `data-action-log`, lu par les tests). */
  log?: string[];
  onTrigger: (id: string) => void;
};

export default function ActionButtons({ actions, lang, currentId, log = [], onTrigger }: Props) {
  if (!actions.length) return null;
  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-40 flex flex-row flex-wrap justify-center gap-2 px-2"
      style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))", maxWidth: "calc(100vw - 7rem)" }}
      data-testid="action-buttons"
      data-current-action={currentId ?? ""}
      data-action-log={log.join(" ")}
    >
      {actions.map((a) => {
        const active = a.id === currentId;
        return (
          <button
            key={a.id}
            type="button"
            data-action-id={a.id}
            onClick={() => onTrigger(a.id)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-white font-bold shadow-lg transition ${
              active ? "bg-amber-500" : "bg-black/60 hover:bg-black/80"
            }`}
          >
            {a.icon && (
              // eslint-disable-next-line @next/next/no-img-element -- export statique (D-7.5)
              <img src={a.icon} alt="" className="h-6 w-6 object-contain" draggable={false} />
            )}
            <span>{a.label[lang] ?? a.label.fr}</span>
          </button>
        );
      })}
    </div>
  );
}
