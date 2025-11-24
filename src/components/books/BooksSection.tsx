'use client'

import { useState } from "react";
import Image from "next/image";
import content from "../../content/content.json";
import BookModal from "./BookModal";
import AmazonButton from "../common/AmazonButton";
import localFont from "next/font/local";
import { getAssetUrl } from "../diorama/lib/assets";

const HandyGeorge = localFont({
  src: "../../../public/fonts/HandyGeorge.ttf",
  variable: "--font-HandyGeorge",
});

interface Detail {
  image: string;
  text: string;
}

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
  books: Book[];
}

export default function BooksSection() {
  const { title, detailLink } = content.bookSection;
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = (book: Book) => {
    setSelectedBook(book);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedBook(null);
  };

  // On parcourt toutes les collections, on récupère les livres, et on ne garde que les foreground
  const foregroundBooks = content.collections.flatMap(collection => 
    collection.books.filter(book => book.onForeground)
  );

  return (
    <section id="books" className="py-16 px-6 max-w-6xl mx-auto scroll-mt-20">
      <h2 className={`${HandyGeorge.className} text-4xl font-bold text-center mb-12 tracking-tighter`}>
        {content.bookSection.title}
      </h2>

      <div
        className={`
          grid gap-12 justify-items-center
          ${foregroundBooks.length === 1
            ? "grid-cols-1 place-items-center"
            : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
          }
        `}
      >
        {/* 2. On map sur notre tableau calculé 'foregroundBooks' */}
        {foregroundBooks.map((book) => (
          <div
            key={book.id}
            onClick={() => openModal(book)} // Clic sur toute la carte ouvre la modale
            className="bg-gray-100 rounded-2xl shadow-lg p-6 flex flex-col cursor-pointer hover:scale-105 transition-transform
               min-h-[420px] max-h-[500px] max-w-[265px] group"
          >
            <div className="h-48 relative mb-4">
              <Image
                src={getAssetUrl(book.image)}
                alt={book.title}
                fill
                className="object-cover rounded-lg"
              />
            </div>
            <h3 className="text-2xl sm:text-2xl text-gray-700 font-bold mb-2 line-clamp-3 break-words">
              {book.title}
            </h3>

            <p className="text-sm text-gray-700 font-bold mb-4">{book.summary}</p>

            {/* Zone du bouton Amazon uniquement */}
            <div 
              className="mt-auto w-full"
              onClick={(e) => e.stopPropagation()} // Empêche d'ouvrir la modale au clic sur Amazon
            >
              {book.link && <AmazonButton href={book.link} />}
            </div>
          </div>
        ))}
      </div>

      {/* S'il n'y a aucun livre à la une, on peut afficher un message optionnel */}
      {foregroundBooks.length === 0 && (
        <p className="text-center text-gray-500">Aucun livre à la une pour le moment.</p>
      )}

      {/* Modale */}
      <BookModal
        isOpen={isModalOpen}
        onClose={closeModal}
        book={selectedBook ?? undefined}
      />
    </section>
);
}