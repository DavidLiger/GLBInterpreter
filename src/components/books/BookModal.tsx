'use client'

import { useEffect, useRef, useState } from "react";
import AmazonButton from "../common/AmazonButton";
import { getAssetUrl } from "../diorama/lib/assets";
import { useHomeTranslation } from "@/contexts/HomeTranslationContext";
import content from "@/content/content.json";

interface Detail {
  image: string;
  text: string;
}

export interface Book {
  id: string;
  image: string;
  link?: string;
  collection: string;
  foreground?: boolean;
  // Propriétés ajoutées par traduction :
  title: string;
  summary: string;
  details?: Array<{ text: string; image?: string }>;
}

interface BookModalProps {
  isOpen: boolean;
  onClose: () => void;
  book?: Book;
}

export default function BookModal({ isOpen, onClose, book }: BookModalProps) {
  const { t } = useHomeTranslation();
  const [scrolled, setScrolled] = useState(false);
  const lastState = useRef(false);

  // Bloquer scroll du body et reset hystérésis
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    if (!isOpen) {
      setScrolled(false);
      lastState.current = false;
    }
    return () => { document.body.style.overflow = ""; }
  }, [isOpen]);

  // Détection du scroll avec hystérésis
  useEffect(() => {
    if (!isOpen) return;
    const modal = document.getElementById("book-modal-content");
    if (!modal) return;

    const handleScroll = () => {
      const scrollTop = modal.scrollTop;
      if (!lastState.current && scrollTop > 2) {
        setScrolled(true);
        lastState.current = true;
      } else if (lastState.current && scrollTop < 2) {
        setScrolled(false);
        lastState.current = false;
      }
    };

    modal.addEventListener("scroll", handleScroll);
    return () => modal.removeEventListener("scroll", handleScroll);
  }, [isOpen]);

  if (!isOpen || !book) return null;

  const booksWithTranslations = content.books.map(book => ({
    ...book,
    ...(t.books as any)[book.id], // Ajoute title, summary, details traduits
  }));

  return (
    <div
      className="fixed inset-0 z-70 bg-black/30 flex justify-end lg:justify-center overflow-hidden"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="fixed right-3 top-3 text-4xl font-bold text-gray-100 z-50 cursor-pointer"
      >
        &times;
      </button>

      <div
        id="book-modal-content"
        className="bg-white w-full sm:w-[80%] lg:max-w-[60%] h-full overflow-auto relative transform transition-transform duration-500"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header sticky */}
        <div className={`sticky top-0 w-full transition-all duration-300 ${scrolled ? "h-24" : "h-48"}`}>
          <div className="absolute inset-0 overflow-hidden">
            {/* Image réduite quand scroll */}
            <img
              src={getAssetUrl(book.image)}
              alt={book.title}
              className={`absolute inset-0 w-full h-full object-cover transition-transform duration-300`}
            />
          </div>

          {/* Conteneur texte + bouton (toujours visible) */}
          <div
            className={`absolute inset-0 bg-black/50 flex transition-all duration-300 ${
              scrolled
                ? "flex-row justify-between items-center px-5"
                : "flex-col justify-center items-center p-2 gap-2"
            }`}
          >
            <p
              className={`text-white font-semibold transition-all duration-300 ${
                scrolled ? "text-xl text-left max-w-[60%]" : "text-3xl text-center mb-2"
              }`}
            >
              {book.title}
            </p>

            {book.link && (
              <div className={scrolled ? "mr-5" : ""}>
                <AmazonButton
                  href={book.link}
                  label={scrolled ? "Acheter" : undefined}
                />
              </div>
            )}
          </div>
        </div>

        {/* Contenu */}
        <div className="mt-6 flex flex-col gap-6 px-4 pb-24">
          {book.details?.map((detail, idx) => (
            <div key={idx} className="w-full">
              <img
                src={getAssetUrl(book.image)}
                alt={detail.text}
                className="w-full h-auto object-cover rounded-lg"
              />
              <p className="mt-2 text-center font-medium">{detail.text}</p>
            </div>
          ))}
          {!book.details && book.summary && (
            <p className="text-gray-700 text-base">{book.summary}</p>
          )}
        </div>
      </div>
    </div>
  );
}