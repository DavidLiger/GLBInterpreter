"use client";

// Fenêtre « Pour les parents » (AN1, spec-annonces.md §5) : annonce d'un nouveau livre, dans le menu de collection
// seulement. `Dialog` modal (Échap, fond, « Fermer ») ; image (si présente), titre, texte en texte brut ; « Voir le
// livre » (lien permis seulement) activé par un appui maintenu de 3 secondes, ouvert hors de l'app ; « Ne plus afficher »
// désactive le réglage. Chargé à la demande (chunk à part), seulement quand une annonce est à montrer.
import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import Dialog from "@/components/ui/Dialog";
import { useTranslation } from "@/contexts/TranslationContext";
import { HOLD_MS } from "@/annonces/config";
import type { FoundAnnonce } from "@/annonces/check";

interface AnnonceDialogProps {
  found: FoundAnnonce;
  /** Appelé une fois, à l'affichage : l'annonce est vue (§5). */
  onShown: () => void;
  onClose: () => void;
  onStop: () => void;
}

export default function AnnonceDialog({ found, onShown, onClose, onStop }: AnnonceDialogProps) {
  const { t, lang } = useTranslation();
  const shownRef = useRef(onShown);
  useEffect(() => shownRef.current(), []);
  const titleId = useId();
  const { annonce, image } = found;
  const imageUrl = useObjectUrl(image);
  return (
    <Dialog open onClose={onClose} labelledBy={titleId} className="glbi-dialog" testId="annonce-dialog">
      <div className="glbi-panel flex flex-col gap-3 overflow-y-auto p-5 text-left" style={{ maxHeight: "calc(100dvh - var(--safe-top) - var(--safe-bottom))" }}>
        <h2 id={titleId} className="text-sm font-semibold uppercase tracking-wide text-white/70">
          {t.annonces.title}
        </h2>
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- image vérifiée (empreinte signée), servie par une URL blob:
          <img src={imageUrl} alt="" className="max-h-[35dvh] w-full rounded-xl object-contain" data-testid="annonce-image" />
        )}
        <h3 className="text-xl font-bold" data-testid="annonce-title">
          {annonce.title[lang]}
        </h3>
        <p className="whitespace-pre-line text-white/90" data-testid="annonce-text">
          {annonce.text[lang]}
        </p>
        {annonce.url && <HoldLink url={annonce.url} label={t.annonces.see} hint={t.annonces.hold} armedHint={t.annonces.release} />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="glbi-btn glbi-btn-link px-2 text-sm" onClick={onStop} data-testid="annonce-stop">
            {t.annonces.stop}
          </button>
          <button type="button" className="glbi-btn glbi-btn-outline" onClick={onClose} data-testid="annonce-close">
            {t.common.close}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/** URL `blob:` de l'image vérifiée, révoquée à la fermeture. */
function useObjectUrl(image: FoundAnnonce["image"]): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!image) return;
    const u = URL.createObjectURL(new Blob([image.bytes as BlobPart], { type: image.type }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [image]);
  return url;
}

/**
 * « Voir le livre » protégé pour les parents (§5) : armé après un appui maintenu de 3 s, puis ouvert en relâchant.
 * - Doigt : pas de `href` tant qu'il n'est pas armé (aucun menu de lien à l'appui long) ; ouverture par `window.open`
 *   au relâchement (`pointerup` d'un doigt est un geste reconnu par le navigateur), `noopener`.
 * - Souris : le clic qui suit le relâchement suit le lien armé (`target="_blank"`, `rel="noopener noreferrer"`).
 * - Clavier : Entrée ou Espace maintenus 3 s arment le lien ; un nouvel appui sur Entrée l'ouvre (5 s pour le faire).
 * Relâché avant 3 s : rien ne s'ouvre. Armé et non utilisé : désarmé après 5 s.
 */
function HoldLink({ url, label, hint, armedHint }: { url: string; label: string; hint: string; armedHint: string }) {
  const [holding, setHolding] = useState(false);
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const disarmTimer = useRef<number | undefined>(undefined);
  const openedByPointer = useRef(false);
  const hintId = useId();

  const clear = () => window.clearTimeout(timer.current);
  const disarm = () => {
    window.clearTimeout(disarmTimer.current);
    armedRef.current = false;
    setArmed(false);
  };
  const start = () => {
    clear();
    disarm();
    setHolding(true);
    timer.current = window.setTimeout(() => {
      armedRef.current = true;
      setArmed(true);
      setHolding(false);
      disarmTimer.current = window.setTimeout(disarm, 5000);
    }, HOLD_MS);
  };
  const cancel = () => {
    clear();
    setHolding(false);
  };
  useEffect(
    () => () => {
      clear();
      window.clearTimeout(disarmTimer.current);
    },
    [],
  );

  return (
    <div className="flex flex-col gap-1">
      <a
        href={armed ? url : undefined}
        target="_blank"
        rel="noopener noreferrer"
        role={armed ? undefined : "button"}
        tabIndex={0}
        className="glbi-btn glbi-btn-primary glbi-hold"
        aria-describedby={hintId}
        data-armed={armed ? "1" : "0"}
        data-testid="annonce-see"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          openedByPointer.current = false;
          start();
        }}
        onPointerUp={(e) => {
          if (armedRef.current && e.pointerType !== "mouse") {
            openedByPointer.current = true;
            window.open(url, "_blank", "noopener,noreferrer");
            disarm();
          }
          cancel();
        }}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          // Lien suivi seulement armé, et pas déjà ouvert au relâchement d'un doigt.
          if (!armedRef.current || openedByPointer.current) e.preventDefault();
          else window.setTimeout(disarm, 0);
          openedByPointer.current = false;
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          if (e.key === " ") e.preventDefault();
          if (e.repeat || armedRef.current) return;
          start();
        }}
        onKeyUp={(e) => {
          if (e.key === "Enter" || e.key === " ") cancel();
        }}
        onBlur={() => {
          cancel();
          disarm();
        }}
      >
        <span className="glbi-hold-fill" data-holding={holding ? "1" : "0"} style={{ transitionDuration: holding ? `${HOLD_MS}ms` : "0ms" }} aria-hidden="true" />
        <span className="relative inline-flex items-center gap-2">
          <ExternalLink className="h-5 w-5" aria-hidden="true" />
          {label}
        </span>
      </a>
      <p id={hintId} className="text-center text-xs text-white/70" aria-live="polite" data-testid="annonce-hint">
        {armed ? armedHint : hint}
      </p>
    </div>
  );
}
