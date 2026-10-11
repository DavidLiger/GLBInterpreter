"use client";

import WebDioramaLoader from "@/components/diorama/WebDioramaLoader";
import { book } from "@/content/book";
import { TranslationProvider } from "@/contexts/TranslationContext";
import DebugConsole from "./DebugConsole";
import InstallGate from "./install/InstallGate";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import { parseSceneHash, sceneHref, useLocationHash } from "./sceneRoute";

// Racine du livre. Î8 : rien du livre ne s'affiche avant l'installation complète (InstallGate) ; la console de
// débogage (`#/debug`, `?debug=1`) et l'invite de mise à jour du service worker restent hors de cette garde.
export default function BookApp() {
  const hash = useLocationHash();
  return (
    <TranslationProvider>
      <DebugConsole />
      <ServiceWorkerRegister inScene={hash !== undefined && parseSceneHash(hash) !== null} />
      {/* Rendu statique (build) : le hash n'est connu qu'au navigateur. */}
      {hash === undefined ? <div className="fixed inset-0 bg-black" /> : <InstallGate><BookRoute hash={hash} /></InstallGate>}
    </TranslationProvider>
  );
}

// Routeur du livre (D-8.4). `#/s/<scène>` → scène ; hash vide (ou `#/debug`) → accueil provisoire (le menu de
// collection arrive en Î13) ; autre hash → scène inconnue.
function BookRoute({ hash }: { hash: string }) {
  if (hash === "" || hash === "#" || hash === "#/" || hash === "#/debug") return <BookHome />;

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
