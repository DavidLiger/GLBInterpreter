"use client";

// Face d'une carte de collection (CC1, DP-11, spec-carte-collection.md §3, §7) : une seule face au format 5:7, dessinée à
// taille fixe (`CARD_WIDTH` × `CARD_HEIGHT` px logiques) et mise à l'échelle d'un bloc par `scale` (fenêtre de la carte).
// De haut en bas : titre et numéro, sous-titre, illustration 3:2, caractéristiques (2 colonnes, 4 au plus, « — » sans
// valeur), paragraphe, titre du livre. Ne lit ni n'écrit la progression : montable tel quel dans l'atelier (aperçu, CC2).
// Style commun à tous les livres (classes `glbi-card*`, globals.css), sans élément graphique propre à une marque.
import { useState } from "react";
import type { Lang } from "@/i18n/messages";
import { useTranslation } from "@/contexts/TranslationContext";
import { BOOK_ICON, CARD_HEIGHT, CARD_WIDTH, type CardFieldLabel, type CardText, type ReaderCard } from "./cardModel";

export interface CollectionCardProps {
  card: ReaderCard;
  /** Titre de la carte : nom de la scène (`scene.name`). */
  title: CardText;
  /** Intitulés du livre (`book.json.cardFields`), dans l'ordre d'affichage. */
  fields: readonly CardFieldLabel[];
  /** Rang de la scène dans `book.json.scenes` (à partir de 1) et nombre de scènes du livre. */
  number: number;
  total: number;
  bookTitle?: CardText;
  lang: Lang;
  /** Échelle d'affichage (1 = taille dessinée). */
  scale?: number;
  /** `id` du titre (nom de la fenêtre qui contient la carte). */
  titleId?: string;
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

export default function CollectionCard({ card, title, fields, number, total, bookTitle, lang, scale = 1, titleId }: CollectionCardProps) {
  const { t } = useTranslation();
  // Illustration introuvable : icône du livre, puis cadre vide.
  const [src, setSrc] = useState(card.image);
  const [noImage, setNoImage] = useState(false);
  return (
    <div className="glbi-card-box" style={{ width: CARD_WIDTH * scale, height: CARD_HEIGHT * scale }} data-testid="collection-card">
      <article
        className="glbi-card"
        lang={lang}
        style={{ width: CARD_WIDTH, height: CARD_HEIGHT, transform: scale === 1 ? undefined : `scale(${scale})` }}
      >
        <div className="glbi-card-inner">
          <header className="glbi-card-head">
            <h2 id={titleId} className="glbi-card-title" data-testid="card-title">
              {title[lang]}
            </h2>
            <span className="glbi-card-number" aria-label={fill(t.card.numberSpoken, { i: number, total })} data-testid="card-number">
              {fill(t.card.number, { i: number, total })}
            </span>
          </header>
          {card.subtitle && (
            <p className="glbi-card-subtitle" data-testid="card-subtitle">
              {card.subtitle[lang]}
            </p>
          )}
          <div className="glbi-card-image">
            {!noImage && (
              // eslint-disable-next-line @next/next/no-img-element -- export statique, images du livre servies telles quelles (D-7.5)
              <img
                src={src}
                alt=""
                draggable={false}
                data-testid="card-image"
                onError={() => (src !== BOOK_ICON ? setSrc(BOOK_ICON) : setNoImage(true))}
              />
            )}
          </div>
          {fields.length > 0 && (
            <dl className="glbi-card-fields" data-testid="card-fields">
              {fields.map((f) => (
                <div key={f.id} className="glbi-card-field">
                  <dt>{f.label[lang]}</dt>
                  <dd>{card.fields[f.id]?.[lang] ?? "—"}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="glbi-card-text" data-testid="card-text">
            {card.text[lang]}
          </p>
          {bookTitle && <footer className="glbi-card-foot">{bookTitle[lang]}</footer>}
        </div>
      </article>
    </div>
  );
}
