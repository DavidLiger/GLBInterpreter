import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
      {/* Hero */}
      <header className="bg-gradient-to-r from-purple-800 to-indigo-700 text-white p-12 text-center">
        <h1 className="text-4xl font-bold mb-4">Bienvenue dans mon univers de Fantasy</h1>
        <p className="text-lg mb-6">Découvrez mes romans et plongez dans un monde de magie et d'aventures</p>
        <a
          href="#books"
          className="bg-yellow-400 text-black font-semibold px-6 py-3 rounded-2xl shadow hover:bg-yellow-300 transition"
        >
          Découvrir les livres
        </a>
      </header>

      {/* Section Livres */}
      <section id="books" className="py-16 px-6 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">Mes Livres</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[1, 2, 3].map((book) => (
            <div key={book} className="bg-white rounded-2xl shadow-lg p-6 flex flex-col">
              <div className="h-48 bg-gray-200 rounded-lg mb-4"></div>
              <h3 className="text-xl font-bold mb-2">Titre du Livre {book}</h3>
              <p className="text-sm text-gray-600 mb-4">Résumé rapide du livre {book}…</p>
              <a
                href="#"
                className="mt-auto bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-500 transition"
              >
                Acheter sur Amazon
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Extrait & Illustrations */}
      <section className="py-16 bg-gray-100 px-6 text-center">
        <h2 className="text-3xl font-bold mb-8">Extrait & Illustrations</h2>
        <div className="max-w-3xl mx-auto bg-white shadow rounded-2xl p-6">
          <p className="text-gray-700 italic">
            « Ici tu peux afficher un extrait de ton livre, ou une image immersive qui plonge le lecteur dans ton monde. »
          </p>
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-16 px-6 max-w-2xl mx-auto text-center">
        <h2 className="text-2xl font-bold mb-4">Rejoignez la Communauté</h2>
        <p className="text-gray-600 mb-6">
          Recevez des extraits inédits, des illustrations exclusives et soyez les premiers informés des prochaines sorties.
        </p>
        <form className="flex gap-2 justify-center">
          <input
            type="email"
            placeholder="Votre email"
            className="flex-1 p-3 rounded-xl border border-gray-300"
          />
          <button
            type="submit"
            className="bg-purple-700 text-white px-6 py-3 rounded-xl hover:bg-purple-600 transition"
          >
            S'inscrire
          </button>
        </form>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white text-center py-6 mt-auto">
        <p>© 2025 Mon Univers Fantasy — Tous droits réservés - Tous</p>
        <div className="flex justify-center gap-4 mt-2">
          <a href="#" className="hover:underline">Instagram</a>
          <a href="#" className="hover:underline">Facebook</a>
          <a href="#" className="hover:underline">Contact</a>
        </div>
      </footer>
    </div>
  );
}
