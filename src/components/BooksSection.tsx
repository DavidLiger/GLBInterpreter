'use client'

import { useState } from "react";
import Image from "next/image";
import content from "../content/content.json";
import BookModal from "./BookModal";
import AmazonButton from "./AmazonButton";

export default function BooksSection() {
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
  <section id="books" className="py-16 px-6 max-w-6xl mx-auto">
    <h2 className="text-3xl font-bold text-center mb-12">Mes Livres</h2>

    <div className="grid gap-12 sm:[grid-template-columns:repeat(auto-fit,minmax(250px,1fr))] lg:flex lg:flex-wrap lg:justify-center">
      {content.books.map((book) => (
        <div
          key={book.id}
          className="bg-white rounded-2xl shadow-lg p-6 flex flex-col cursor-pointer hover:scale-105 transition-transform"
        >
          <div className="h-48 relative mb-4">
            <Image
              src={book.image}
              alt={book.title}
              fill
              className="object-cover rounded-lg"
            />
          </div>
          <h3 className="text-xl font-bold mb-2">{book.title}</h3>
          <p className="text-sm text-gray-600 mb-4">{book.summary}</p>

          {/* Conteneur des boutons */}
          <div className="flex flex-col gap-2 mt-auto">
            <button
              onClick={() => openModal(book)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-500 transition"
            >
              En savoir +
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
