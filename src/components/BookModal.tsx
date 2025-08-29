'use client'

import { useEffect } from "react";
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
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !book) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex justify-end lg:justify-center overflow-hidden"
      onClick={onClose}
    >
      {/* Bouton croix indépendant */}
      <button
        onClick={onClose}
        className="fixed top-4 right-7 text-5xl font-bold text-gray-800 z-50 cursor-pointer"
      >
        &times;
      </button>

      {/* Modale principale */}
      <div
        className={`bg-white w-full sm:w-[80%] lg:max-w-[60%] h-full overflow-auto relative transform transition-transform duration-500
                    ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Main image fixe */}
        <div className="sticky top-0 w-full h-[180px] z-10">
          <img src={book.image} alt={book.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center p-2 gap-2">
            <p className="text-white font-semibold text-center text-4xl">{book.title}</p>
            {book.link && <AmazonButton href={book.link} />}
          </div>
        </div>

        {/* Details scrollables */}
        <div className="mt-6 flex flex-col gap-6 px-4 pb-8">
          {book.details?.map((detail, idx) => (
            <div key={idx} className="w-full">
              <img src={detail.image} alt={detail.text} className="w-full h-auto object-cover rounded-lg" />
              <p className="mt-2 text-center font-medium">{detail.text}</p>
            </div>
          ))}
          {/* Si résumé simple sans détails */}
          {!book.details && book.summary && (
            <p className="text-gray-700 text-base">{book.summary}</p>
          )}
        </div>
      </div>
    </div>
  );
}
