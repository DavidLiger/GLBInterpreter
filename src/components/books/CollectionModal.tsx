import { useHomeTranslation } from "@/contexts/HomeTranslationContext";
import content from "@/content/content.json";
import BookModal, { Book } from "./BookModal";
import { useEffect, useRef, useState } from "react";
import { getAssetUrl } from "../diorama/lib/assets";

interface CollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  collectionId?: string; // ✅ Passer l'ID au lieu de l'objet complet
}

type CollectionId = 'scifi' | 'fantasy' | 'thriller';

export default function CollectionModal({ isOpen, onClose, collectionId }: CollectionModalProps) {
  const { t } = useHomeTranslation();
  const [scrolled, setScrolled] = useState(false);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);

  const isBookModalOpenRef = useRef(false);
  
  // ✅ Synchroniser le ref avec le state
  useEffect(() => {
    isBookModalOpenRef.current = isBookModalOpen;
  }, [isBookModalOpen]);

  useEffect(() => {
    if (isOpen) {
      window.history.pushState({ collectionModal: true }, '');
      
      const handlePopState = () => {
        // ✅ Utiliser le ref au lieu du state
        if (!isBookModalOpenRef.current) {
          onClose();
        }
      };
      
      window.addEventListener('popstate', handlePopState);
      
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [isOpen, onClose]);

  // ✅ 1. Récupérer les infos de la collection depuis les traductions
  const collectionInfo = t.collections[collectionId as CollectionId];
  
  // ✅ 2. Récupérer l'image depuis content.json
  const collectionData = content.collections.find(c => c.id === collectionId);
  
  // ✅ 3. Filtrer les livres de cette collection
  const collectionBooks = content.books
    .filter(book => book.collection === collectionId)
    .map(book => ({
      ...book,
      ...(t.books as any)[book.id], // ✅ Force le cast
    }));

  const handleBookClick = (book: Book) => {
    setSelectedBook(book);
    setIsBookModalOpen(true);
  };

  const closeBookModal = () => {
    setIsBookModalOpen(false);
    setTimeout(() => setSelectedBook(null), 300);
    document.body.style.overflow = "hidden";
  };

  if (!isOpen || !collectionId) return null;

  return (
    <>
      <div className="fixed inset-0 z-60 bg-black/30 flex justify-end lg:justify-center overflow-hidden" onClick={onClose}>
        <button onClick={onClose} className="fixed right-3 top-3 text-4xl font-bold text-gray-100 z-50">
          &times;
        </button>

        <div
          id="collection-modal-content"
          className="bg-white w-full sm:w-[80%] lg:max-w-[60%] h-full overflow-auto relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header sticky */}
          <div className={`sticky top-0 w-full transition-all duration-300 z-10 ${scrolled ? "h-20" : "h-48"}`}>
            <img
              src={getAssetUrl(collectionData?.image || '')}
              alt={collectionInfo.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-2">
              <p className={`text-white font-semibold transition-all duration-300 ${scrolled ? "text-2xl" : "text-3xl"}`}>
                {collectionInfo.name} {/* ✅ Traduit */}
              </p>
            </div>
          </div>

          {/* Contenu */}
          <div className="mt-6 flex flex-col gap-8 px-4 pb-24">
            {/* Description */}
            {collectionInfo.description && (
              <div className="text-gray-700 text-lg p-6 bg-gray-50 rounded-xl">
                {collectionInfo.description} {/* ✅ Traduit */}
              </div>
            )}

            {/* Liste des livres */}
            {collectionBooks.length > 0 && (
              <div className="border-t pt-6">
                <h3 className="text-2xl font-bold text-center mb-6 text-gray-800">
                  {collectionInfo.subtitle} 
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 justify-items-center">
                  {collectionBooks
                    .filter((book) => book.dispo === true) // 1. On filtre d'abord
                    .map((book) => (
                      <div
                        key={book.id}
                        onClick={() => handleBookClick(book)}
                        className="bg-white border rounded-xl shadow-md p-4 cursor-pointer hover:shadow-xl transition max-w-[280px] w-full"
                      >
                        <div className="h-40 relative mb-3 rounded-lg overflow-hidden">
                          <img 
                            src={getAssetUrl(book.image)}
                            alt={book.title}
                            className="object-cover w-full h-full"
                          />
                        </div>
                        <h4 className="text-lg font-bold text-gray-800 mb-2">
                          {book.title}
                        </h4>
                        <p className="text-sm text-gray-600 line-clamp-3 mb-3">
                          {book.summary}
                        </p>
                        <span className="text-indigo-600 font-semibold text-sm">
                          {t.bookSection.detailLink} &rarr;
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <BookModal 
        isOpen={isBookModalOpen}
        onClose={closeBookModal}
        book={selectedBook || undefined}
      />
    </>
  );
}