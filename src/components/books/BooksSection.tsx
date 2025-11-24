'use client'

import { useState } from "react";
import Image from "next/image";
import content from "../../content/content.json";
import BookModal from "./BookModal";
import AmazonButton from "../common/AmazonButton";
import localFont from "next/font/local";
import { getAssetUrl } from "../diorama/lib/assets";

const Alstoria = localFont({
  src: "../../../public/fonts/Alstoria.ttf",
  variable: "--font-Alstoria",
});

export default function BooksSection() {
  const { title, detailLink } = content.bookSection;
  const [selectedBook, setSelectedBook] = useState<typeof content.books[0] | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = (book: typeof content.books[0]) => {
    setSelectedBook(book);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedBook(null);
  };

  return (
    <section id="books" className="py-16 px-6 max-w-6xl mx-auto scroll-mt-20">
      <h2 className={`${Alstoria.className} text-4xl font-bold text-center mb-12`}>{title}</h2>

      <div className="grid gap-12 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 justify-items-center">
        {content.books.map((book) => (
          <div
            key={book.id}
            className="bg-gray-100 rounded-2xl shadow-lg p-6 flex flex-col cursor-pointer hover:scale-105 transition-transform
               min-h-[420px] max-h-[500px] max-w-[265px]"
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

            {/* Conteneur des boutons */}
            <div className="flex flex-col gap-2 mt-auto">
              <button
                onClick={() => openModal(book)}
                className="bg-indigo-600 text-white shadow-lg font-semibold px-4 py-2 rounded-lg hover:bg-indigo-500 transition cursor-pointer"
              >
                {detailLink}
              </button>

              {book.link && <AmazonButton href={book.link} />}
            </div>
          </div>
        ))}
      </div>

      {/* Modale */}
      <BookModal
        isOpen={isModalOpen}
        onClose={closeModal}
        book={selectedBook ?? undefined}
      />
    </section>
  );
}