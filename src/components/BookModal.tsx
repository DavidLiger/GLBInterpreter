'use client'

import { useEffect, useRef, useState } from "react";
import AmazonButton from "./AmazonButton";

interface Detail {
  image: string;
  text: string;
}

interface Book {
  id: number;
  image: string;
  title: string;
  summary?: string;
  link?: string;
  details?: Detail[];
}

interface BookModalProps {
  isOpen: boolean;
  onClose: () => void;
  book?: Book;
}

export default function BookModal({ isOpen, onClose, book }: BookModalProps) {
  const [scrolled, setScrolled] = useState(false);
  const lastState = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    const modal = document.getElementById("book-modal-content");

    const handleScroll = () => {
      if (!modal) return;
      const scrollTop = modal.scrollTop;

      // Hystérésis pour éviter le rebond
      if (!lastState.current && scrollTop > 2) {
        setScrolled(true);
        lastState.current = true;
      } else if (lastState.current && scrollTop < 2) {
        setScrolled(false);
        lastState.current = false;
      }
    };

    modal?.addEventListener("scroll", handleScroll);
    return () => modal?.removeEventListener("scroll", handleScroll);
  }, [isOpen]);


  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setScrolled(false);       // ← reset état scroll
      lastState.current = false; // ← reset l’hystérésis
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);


  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !book) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex justify-end lg:justify-center overflow-hidden"
      onClick={onClose}
    >
      {/* Bouton croix */}
      <button
        onClick={onClose}
        className="fixed right-2 text-4xl font-bold text-gray-100 z-50 cursor-pointer"
      >
        &times;
      </button>

      {/* Modale principale */}
      <div
        id="book-modal-content"
        className={`bg-white w-full sm:w-[80%] lg:max-w-[60%] h-full overflow-auto relative transform transition-transform duration-500
          ${isOpen ? "translate-x-0" : "translate-x-full"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header sticky */}
        <div
          className={`sticky top-0 w-full transition-all duration-300 ${
            scrolled ? "h-24" : "h-48"
          }`}
        >
          {/* Image */}
          <img
            src={book.image}
            alt={book.title}
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Conteneur texte + bouton */}
          <div
            className={`absolute inset-0 bg-black/50 flex ${
              scrolled
                ? "flex-row justify-between items-center px-5"
                : "flex-col justify-center items-center p-2 gap-2"
            }`}
          >
            {/* Titre */}
            <p
              className={`text-white font-semibold transition-all duration-300 ${
                scrolled
                  ? "text-xl text-left max-w-[60%]" // limite la largeur
                  : "text-3xl text-center mb-2"
              }`}
            >
              {book.title}
            </p>

            {/* Bouton Amazon */}
            {book.link && (
              <div className="mr-5"> {/* Ajoute un petit offset du bord */}
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
                src={detail.image}
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
