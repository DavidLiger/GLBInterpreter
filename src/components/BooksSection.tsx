import Image from "next/image";
import content from "../content/content.json";

export default function BooksSection() {
  return (
    <section id="books" className="py-16 px-6 max-w-6xl mx-auto">
      <h2 className="text-3xl font-bold text-center mb-12">Mes Livres</h2>
      <div className="grid gap-12 sm:[grid-template-columns:repeat(auto-fit,minmax(250px,1fr))] lg:flex lg:flex-wrap lg:justify-center">
        {content.books.map((book) => (
          <div key={book.id} className="bg-white rounded-2xl shadow-lg p-6 flex flex-col">
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
            <a
              href={book.link}
              target="_blank"
              className="mt-auto bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-500 transition"
            >
              Acheter sur Amazon
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
