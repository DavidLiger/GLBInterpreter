"use client";

// Fenêtre d'une carte de collection (CC1, spec-carte-collection.md §2, §3, §7) : `Dialog` modal (primitive d'Î12) ; « Fermer »,
// Échap et un toucher sur le fond la ferment ; nom accessible « Carte : <titre> » ; contenu lu dans l'ordre de la carte.
// Ouverte depuis le menu : « Précédente » et « Suivante » parmi les cartes gagnées, dans l'ordre du livre.
// La carte est dessinée à taille fixe et mise à l'échelle d'un bloc pour tenir dans l'écran, zones sûres et boutons
// compris (échelle de 0,6 à 1,4).
// Chargée par `next/dynamic` (chunk à part, avec `CollectionCard`) : listée dans `book.json.files`, servie hors ligne.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Dialog from "@/components/ui/Dialog";
import { useTranslation } from "@/contexts/TranslationContext";
import CollectionCard from "./CollectionCard";
import { cardScale, type CardFieldLabel, type CardText, type ReaderCard } from "./cardModel";

/** Une carte de la fenêtre : scène, carte, titre, rang dans le livre. */
export interface CardEntry {
  sceneId: string;
  card: ReaderCard;
  title: CardText;
  number: number;
}

export interface CardDialogProps {
  /** Cartes que la fenêtre peut montrer (une seule depuis une scène ; les cartes gagnées depuis le menu). */
  entries: readonly CardEntry[];
  /** Carte affichée (index dans `entries`). */
  index: number;
  onIndex?: (i: number) => void;
  onClose: () => void;
  fields: readonly CardFieldLabel[];
  /** Nombre de scènes du livre (numéro « n° i / N »). */
  total: number;
  bookTitle?: CardText;
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export default function CardDialog({ entries, index, onIndex, onClose, fields, total, bookTitle }: CardDialogProps) {
  const { t, lang } = useTranslation();
  const titleId = useId();
  const nameId = useId();
  const stageRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [scale, setScale] = useState(1);
  const entry = entries[Math.max(0, Math.min(index, entries.length - 1))];

  // Échelle recalculée à chaque changement de taille de la zone (rotation, barre d'outils, clavier).
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const cs = getComputedStyle(stage);
      const w = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setScale(cardScale(w, h, controlsRef.current?.offsetHeight ?? 44));
    };
    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(stage);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // Focus sur « Fermer » à l'ouverture (la primitive a ouvert le dialogue avant cet effet).
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  if (!entry) return null;
  const many = entries.length > 1 && !!onIndex;
  const i = entries.indexOf(entry);

  return (
    <Dialog open onClose={onClose} labelledBy={nameId} className="glbi-card-dialog" testId="card-dialog">
      <span id={nameId} className="sr-only">
        {fill(t.card.dialogName, { title: entry.title[lang] })}
      </span>
      {/* Zone de la carte : ne reçoit pas les touchers (ils vont au fond du dialogue, qui ferme la fenêtre). */}
      <div ref={stageRef} className="glbi-card-stage">
        <CollectionCard
          key={entry.sceneId}
          card={entry.card}
          title={entry.title}
          fields={fields}
          number={entry.number}
          total={total}
          bookTitle={bookTitle}
          lang={lang}
          scale={scale}
          titleId={titleId}
        />
        <div ref={controlsRef} className="glbi-card-controls">
          {many && (
            <button
              type="button"
              className="glbi-btn glbi-btn-secondary"
              onClick={() => onIndex!((i - 1 + entries.length) % entries.length)}
              data-testid="card-previous"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              {t.card.previous}
            </button>
          )}
          <button ref={closeRef} type="button" className="glbi-btn glbi-btn-primary" onClick={onClose} data-testid="card-close">
            {t.common.close}
          </button>
          {many && (
            <button type="button" className="glbi-btn glbi-btn-secondary" onClick={() => onIndex!((i + 1) % entries.length)} data-testid="card-next">
              {t.card.next}
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
