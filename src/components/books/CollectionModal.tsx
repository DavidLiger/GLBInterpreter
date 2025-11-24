'use client'

import { useEffect, useRef, useState } from "react";
import { getAssetUrl } from "../diorama/lib/assets";
import BookModal from "../books/BookModal"; // Assure-toi que le chemin est bon
import Image from "next/image"; // Optionnel, si tu veux optimiser, sinon <img> suffit

// --- 1. Mises à jour des Interfaces ---

interface Detail {
  image: string;
  text: string;
}

// On reprend la structure exacte de tes livres
interface Book {
  id: number;
  onForeground?: boolean;
  title: string;
  summary: string;
  image: string;
  link?: string;
  details?: Detail[];
}

interface Collection {
  id: number;
  name: string;
  image: string;
  description?: string;
  details?: Detail[];
  books: Book[]; // La liste des livres de cette collection
}

interface CollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  collection?: Collection;
}

export default function CollectionModal({ isOpen, onClose, collection }: CollectionModalProps) {
  // --- Gestion du Scroll de la modale Collection ---
  const [scrolled, setScrolled] = useState(false);
  const lastState = useRef(false);
  
  // --- Gestion de la sous-modale Livre ---
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);

  const SCROLL_UP = 2;
  const SCROLL_DOWN = 2;

  // Détection du scroll
  useEffect(() => {
    if (!isOpen) return;
    const modal = document.getElementById("collection-modal-content");
    if (!modal) return;

    lastState.current = false; // Reset état initial

    const handleScroll = () => {
      const scrollTop = modal.scrollTop;
      
      // On utilise un seuil plus élevé (50px) pour éviter l'effet de rebond
      // Si on descend plus bas que 50px -> on réduit le header
      if (!lastState.current && scrollTop > 50) {
        setScrolled(true);
        lastState.current = true;
      } 
      // Si on remonte tout en haut (moins de 50px) -> on agrandit le header
      else if (lastState.current && scrollTop < 50) {
        setScrolled(false);
        lastState.current = false;
      }
    };

    modal.addEventListener("scroll", handleScroll);
    return () => modal.removeEventListener("scroll", handleScroll);
  }, [isOpen]);

  // Détection du scroll avec hystérésis
  useEffect(() => {
    if (!isOpen) return;
    const modal = document.getElementById("collection-modal-content");
    if (!modal) return;

    lastState.current = false;

    const handleScroll = () => {
      const scrollTop = modal.scrollTop;
      requestAnimationFrame(() => {
        if (!lastState.current && scrollTop > SCROLL_UP) {
          setScrolled(true);
          lastState.current = true;
        } else if (lastState.current && scrollTop < SCROLL_DOWN) {
          setScrolled(false);
          lastState.current = false;
        }
      });
    };

    modal.addEventListener("scroll", handleScroll);
    return () => modal.removeEventListener("scroll", handleScroll);
  }, [isOpen]);

  // --- Handlers pour les livres ---
  const handleBookClick = (book: Book) => {
    setSelectedBook(book);
    setIsBookModalOpen(true);
  };

  const closeBookModal = () => {
    setIsBookModalOpen(false);
    // Petit délai pour éviter le flash avant de clear la data
    setTimeout(() => setSelectedBook(null), 300);
    
    // IMPORTANT : Quand on ferme la BookModal, on doit s'assurer que le body reste bloqué 
    // car on est toujours dans la CollectionModal
    document.body.style.overflow = "hidden";
  };

  if (!isOpen || !collection) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/30 flex justify-end lg:justify-center overflow-hidden"
        onClick={onClose}
      >
        {/* Bouton croix Collection */}
        <button
          onClick={onClose}
          className="fixed right-3 top-3 text-4xl font-bold text-gray-100 z-50 cursor-pointer hover:text-white transition"
        >
          &times;
        </button>

        {/* Contenu de la modale Collection */}
        <div
          id="collection-modal-content"
          className="bg-white w-full sm:w-[80%] lg:max-w-[60%] h-full overflow-auto relative transform transition-transform duration-500 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header sticky */}
          <div className={`sticky top-0 w-full transition-all duration-300 z-10 ${scrolled ? "h-20" : "h-48"}`}>
            <img
              src={getAssetUrl(collection.image)}
              alt={collection.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-2">
              <p className={`text-white font-semibold transition-all duration-300 ${scrolled ? "text-2xl" : "text-3xl text-center mb-5"}`}>
                {collection.name}
              </p>
            </div>
          </div>

          {/* Contenu scrollable */}
          <div className="mt-6 flex flex-col gap-8 px-4 pb-24">
            
            {/* Description de la collection */}
            {collection.description && (
              <div className="text-gray-700 text-lg p-6 bg-gray-50 rounded-xl border border-gray-100 shadow-sm">
                {collection.description}
              </div>
            )}

            {/* --- LISTE DES LIVRES DE LA COLLECTION --- */}
            {collection.books && collection.books.length > 0 && (
              <div className="border-t pt-6">
                <h3 className="text-2xl font-bold text-center mb-6 text-gray-800">
                  Les livres de la collection
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 justify-items-center">
                  {collection.books.map((book) => (
                    <div
                      key={book.id}
                      onClick={() => handleBookClick(book)}
                      className="bg-white border border-gray-200 rounded-xl shadow-md p-4 flex flex-col cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all duration-300 max-w-[280px] w-full"
                    >
                       <div className="h-40 relative mb-3 overflow-hidden rounded-lg">
                          <img 
                            src={getAssetUrl(book.image)}
                            alt={book.title}
                            className="object-cover w-full h-full"
                          />
                       </div>
                       <h4 className="text-lg font-bold text-gray-800 leading-tight mb-2">
                         {book.title}
                       </h4>
                       <p className="text-sm text-gray-600 line-clamp-3 mb-3">
                         {book.summary}
                       </p>
                       <span className="mt-auto text-indigo-600 font-semibold text-sm hover:underline">
                         Voir le livre &rarr;
                       </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Détails supplémentaires de la collection (images + textes) */}
            {/* {collection.details && collection.details.length > 0 && (
              <div className="border-t pt-6 flex flex-col gap-8">
                {collection.details.map((detail, idx) => (
                  <div key={idx} className="w-full bg-gray-50 p-4 rounded-xl">
                    <img
                      src={getAssetUrl(detail.image)}
                      alt={detail.text}
                      className="w-full h-auto object-cover rounded-lg shadow-sm"
                    />
                    <p className="mt-3 text-center text-gray-700 font-medium italic">
                      {detail.text}
                    </p>
                  </div>
                ))}
              </div>
            )} */}
          </div>
        </div>
      </div>

      {/* --- SOUS-MODALE LIVRE --- */}
      {/* Elle s'affiche par-dessus la collection modal grâce au z-index (z-50 dans BookModal vs z-40 ici) */}
      <BookModal 
        isOpen={isBookModalOpen}
        onClose={closeBookModal}
        book={selectedBook || undefined}
      />
    </>
  );
}