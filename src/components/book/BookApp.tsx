"use client";

import WebDioramaLoader from "@/components/diorama/WebDioramaLoader";
import { book } from "@/content/book";
import { parseSceneHash, sceneHref, useLocationHash } from "./sceneRoute";

// Routeur du livre (D-8.4). `#/s/<scène>` → scène ; hash vide → accueil provisoire (le menu de collection
// arrive en Î13) ; autre hash → scène inconnue.
export default function BookApp() {
  const hash = useLocationHash();

  // Rendu statique (build) : le hash n'est connu qu'au navigateur.
  if (hash === undefined) return <div className="fixed inset-0 bg-black" />;

  if (hash === "" || hash === "#" || hash === "#/") return <BookHome />;

  const sceneId = parseSceneHash(hash);
  const config = sceneId ? book.getScene(sceneId) : undefined;
  if (!sceneId || !config) return <UnknownScene />;

  // `key` : changement de scène = démontage complet du lecteur (comme un changement de page auparavant).
  return <WebDioramaLoader key={sceneId} config={config} bookId={book.id} />;
}

function BookHome() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-black text-white p-6 text-center">
      <h1 className="text-2xl font-bold">GLBInterpreter</h1>
      <p className="text-white/70">Lecteur 3D pour livres augmentés.</p>
      <nav className="flex flex-col gap-3">
        {book.sceneIds.map((id) => (
          <a
            key={id}
            href={sceneHref(id)}
            className="px-6 py-3 rounded-full bg-white/15 hover:bg-white/25 transition"
          >
            {book.getScene(id)?.name.fr ?? id}
          </a>
        ))}
      </nav>
    </main>
  );
}

function UnknownScene() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-black text-white p-6 text-center">
      <h1 className="text-2xl font-bold">Scène introuvable</h1>
      <p className="text-white/70">Ce code ne correspond à aucune scène de ce livre.</p>
      <a href="#/" className="px-6 py-3 rounded-full bg-white/15 hover:bg-white/25 transition">
        Retour à l&apos;accueil
      </a>
    </main>
  );
}
