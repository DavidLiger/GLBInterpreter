'use client'

import { useEffect, useRef, useState } from "react";
import AmazonButton from "../common/AmazonButton";
import { getAssetUrl } from "../diorama/lib/assets";
import { useHomeTranslation } from "@/contexts/HomeTranslationContext";
import { translations } from "@/contexts/HomeTranslationContext";
import BookCover from "./BookCover";
import BookDetailsCard from "./BookDetailsCard";

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
  releaseDate: string;
  title: string;
  summary: string;
  details?: Array<{ text: string; image?: string; coverImage?: string }>;
}

interface BookModalProps {
  isOpen: boolean;
  onClose: () => void;
  book?: Book;
}

export default function BookModal({ isOpen, onClose, book }: BookModalProps) {
  const { t, lang } = useHomeTranslation();
  const [scrolled, setScrolled] = useState(false);
  const [isFallbackLanguage, setIsFallbackLanguage] = useState(false);
  const [displayBook, setDisplayBook] = useState<Book | null>(null);
  const lastState = useRef(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!book) {
      setDisplayBook(null);
      return;
    }
    
    const currentLangBook = (t.books as any)[book.id];
    
    // Si le livre existe dans la langue actuelle
    if (currentLangBook && currentLangBook.title) {
      setIsFallbackLanguage(false);
      setDisplayBook({
        ...book,
        ...currentLangBook
      });
      return;
    }
    
    // Sinon, fallback vers l'anglais directement depuis translations
    const englishBook = (translations.en.books as any)[book.id];
    
    if (englishBook && englishBook.title) {
      setIsFallbackLanguage(true);
      setDisplayBook({
        ...book,
        ...englishBook
      });
      return;
    }
    
    // Si même pas en anglais, retourner les données de base
    setIsFallbackLanguage(false);
    setDisplayBook(book);
  }, [book, t, lang]);

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
    // On vérifie isOpen, la ref, ET displayBook (pour être sûr que le DOM est là)
    if (!isOpen || !modalRef.current || !displayBook) return;
    
    const modal = modalRef.current;
    
    const handleScroll = () => {
      const scrollTop = modal.scrollTop;
      
      // Seuil de 20px comme dans votre code
      if (!lastState.current && scrollTop > 20) {
        setScrolled(true);
        lastState.current = true;
      } else if (lastState.current && scrollTop < 20) {
        setScrolled(false);
        lastState.current = false;
      }
    };

    modal.addEventListener("scroll", handleScroll);
    
    // Nettoyage
    return () => modal.removeEventListener("scroll", handleScroll);
    
    // ✅ AJOUT DE displayBook ICI
  }, [isOpen, displayBook]);

  // Gestion du back button
  useEffect(() => {
    if (isOpen) {
      window.history.pushState({ bookModal: true }, '');
      
      const handlePopState = () => {
        onClose();
      };
      
      window.addEventListener('popstate', handlePopState);
      
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen || !displayBook) return null;

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
        ref={modalRef}
        id="book-modal-content"
        className="bg-white w-full sm:w-[80%] lg:max-w-[60%] h-full overflow-auto relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* CONTENEUR STICKY - Header + Bandeaux */}
        <div className="sticky top-0 w-full z-30 bg-white shadow-sm">
          
          {/* HEADER VISUEL (Image & Titre) */}
          <div className={`relative w-full transition-all duration-300 ${scrolled ? "h-24" : "h-64"}`}>
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={getAssetUrl(displayBook.image)}
                alt={displayBook.title}
                className="absolute inset-0 w-full h-full object-cover"
              />
            </div>
            
            <div
              className={`absolute inset-0 bg-black/50 flex transition-all duration-300 ${
                scrolled
                  ? "flex-row justify-between items-center px-5"
                  : "flex-col justify-center items-center p-4 gap-3"
              }`}
            >
              <p
                className={`text-white font-semibold transition-all duration-300 ${
                  scrolled ? "text-xl text-left max-w-[60%]" : "text-3xl text-center"
                }`}
              >
                {displayBook.title}
              </p>

              {displayBook.link && (
                <div className={scrolled ? "mr-5" : ""}>
                  <AmazonButton
                    href={displayBook.link}
                    label={scrolled ? t.amazonButton.shortTitle : t.amazonButton.title}
                  />
                </div>
              )}
            </div>
          </div>

          {/* BANDEAU VERT (Date de sortie) */}
          <div className="bg-green-600 w-full py-2 px-4 text-center">
            <p className="text-white text-sm font-semibold tracking-wide">
              {t.bookModal.release}{displayBook.releaseDate || t.bookModal.dateToBeAnnounced} 
            </p>
          </div>

          {/* BANDEAU ORANGE (Langue non disponible) */}
          {isFallbackLanguage && (
            <div className="bg-orange-500 w-full py-3 px-4 text-center">
              <p className="text-white text-sm font-semibold">
                ⚠️ {t.bookModal.notAvailableInLanguage}
              </p>
            </div>
          )}
        </div>
        {/* Fin du conteneur sticky */}

        {/* Contenu (Détails) */}
        <div className="mt-6 flex flex-col gap-8 px-4 pb-24">
          {displayBook.details?.map((detail, idx) => (
            <div key={idx} className="w-full space-y-6">
              {/* Couverture du livre */}
              <BookCover
                image={displayBook.image}
                title={displayBook.title}
                publisherText={t.bookCover.publisher}
                disclaimerText={t.bookCover.notFinalImage}
                coverImage={detail.coverImage}
              />
              
              {/* Fiche professionnelle */}
              <BookDetailsCard
                detail={detail}
                labels={t.bookDetails}
                collectionName={t.collections[displayBook.collection as keyof typeof t.collections]?.name || ''}
                publisherName={t.bookCover.publisher}
              />
              {displayBook.link && (
                <div className={`flex justify-center `}>
                  <AmazonButton
                    href={displayBook.link}
                    label={t.amazonButton.title}
                  />
                </div>
              )}
            </div>
          ))}
          
          {/* {!displayBook.details && displayBook.summary && (
            <p className="text-gray-700 text-base">{displayBook.summary}</p>
          )} */}
        </div>
      </div>
    </div>
  );
}