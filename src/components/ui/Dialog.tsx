"use client";
// Primitive modale du lecteur (Î12, U-02) : élément natif `<dialog>`, rôle et nom annoncés par le navigateur, Échap géré.
//
// - `modal` (par défaut) : `showModal()`. Le reste de la page devient inerte, le focus va au premier élément
//   focalisable du dialogue et revient, à la fermeture, à l'élément qui l'avait (bouton qui a ouvert ; rendu par la
//   primitive elle-même, le WebKit de Windows ne le faisant pas). Échap ou un
//   clic sur le fond appellent `onClose`. Utilisé par `InfoModal`.
// - `modal={false}` : `show()`, sans rendre la page inerte. Utilisé par les écrans plein écran d'`InstallGate`, qui
//   ne recouvrent rien du livre (le livre n'est monté qu'après eux) mais doivent laisser utilisables l'invite de mise à
//   jour du service worker et la console de débogage Eruda (`#/debug`, tests sans Mac, Î16).
// - Sans `onClose`, le dialogue ne se ferme pas : Échap est ignoré ; si le navigateur le ferme quand même (Chrome
//   n'autorise pas toujours à annuler un second Échap), il est rouvert.
// - Événement `close` en retard (correctif de la clôture d'AC2, 26/10/2026) : Chromium l'envoie à l'image suivante, pas
//   au moment de `close()`. Un dialogue fermé puis rouvert avant cette image (annuler puis rouvrir aussitôt ; cadence
//   d'images basse) recevait l'événement de la fermeture précédente et se refermait. Un `close` reçu alors que le
//   dialogue est de nouveau ouvert est ignoré : il ne décrit plus son état.
import { useEffect, useRef, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  /** Fermeture demandée (Échap, fond, bouton). Absent : dialogue non fermable. */
  onClose?: () => void;
  modal?: boolean;
  /** `id` de l'élément qui nomme le dialogue (son titre). */
  labelledBy: string;
  /** Classes du dialogue (taille, fond, position). */
  className?: string;
  children: ReactNode;
  testId?: string;
}

export default function Dialog({ open, onClose, modal = true, labelledBy, className = "", children, testId }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);
  /** Élément qui avait le focus à l'ouverture : il le retrouve à la fermeture. */
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    openRef.current = open;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      const active = document.activeElement;
      returnFocusRef.current = active instanceof HTMLElement && active !== document.body && !d.contains(active) ? active : null;
      try {
        if (modal) d.showModal();
        else d.show();
      } catch {
        d.setAttribute("open", "");
      }
    } else if (!open && d.open) {
      d.close();
      restoreFocus(d, returnFocusRef);
    }
  }, [open, modal]);

  // Démontage pendant l'ouverture : fermer proprement (focus rendu, page de nouveau active).
  useEffect(() => {
    const d = ref.current;
    return () => {
      if (d?.open) {
        d.close();
        restoreFocus(d, returnFocusRef);
      }
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      data-testid={testId}
      className={className}
      onKeyDown={(e) => {
        // Échap traité ici : WebKit n'émet pas toujours `cancel` ; empêcher l'action par défaut évite un double appel.
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onCloseRef.current?.();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onCloseRef.current?.();
      }}
      onClose={() => {
        // Fermeture voulue par la page (`open` faux), ou événement en retard d'une fermeture précédente (dialogue rouvert
        // depuis) : rien à faire.
        if (!openRef.current || ref.current?.open) return;
        if (onCloseRef.current) onCloseRef.current();
        else {
          // Fermé par le navigateur alors qu'il ne doit pas l'être : rouvert.
          const d = ref.current;
          if (!d) return;
          try {
            if (modal) d.showModal();
            else d.show();
          } catch {
            d.setAttribute("open", "");
          }
        }
      }}
      onClick={(e) => {
        // Clic sur le fond (`::backdrop` : la cible est le dialogue lui-même, hors de son contenu).
        if (modal && e.target === e.currentTarget) onCloseRef.current?.();
      }}
    >
      {open && children}
    </dialog>
  );
}

/**
 * Rend le focus à l'élément qui l'avait à l'ouverture, s'il est encore dans la page et que le focus n'est pas déjà
 * ailleurs (sur un autre élément que le corps de page ou le dialogue fermé).
 */
function restoreFocus(dialog: HTMLDialogElement, ref: { current: HTMLElement | null }) {
  const target = ref.current;
  ref.current = null;
  if (!target?.isConnected) return;
  const active = document.activeElement;
  if (active && active !== document.body && active !== target && !dialog.contains(active)) return;
  target.focus({ preventScroll: true });
}
