"use client";

import { useEffect, useState } from "react";
import WebDioramaLoader from "@/components/diorama/WebDioramaLoader";
import { TranslationProvider, useTranslation } from "@/contexts/TranslationContext";
import LanguageSelector from "@/components/diorama/ui/LanguageSelector";
import DebugConsole from "./DebugConsole";
import InstallGate from "./install/InstallGate";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import { DEV_BOOK_DIR, fixtureSceneIds, loadFixtureScene, loadReaderBook, loadReaderScene } from "./bookSource";
import type { ReaderBook, ReaderScene } from "./readerScene";
import { parseDevSceneHash, parseSceneHash, sceneHref, useLocationHash } from "./sceneRoute";

const isDev = process.env.NODE_ENV === "development";

// Racine du livre. Î8 : rien du livre ne s'affiche avant l'installation complète (InstallGate) ; la console de
// débogage (`#/debug`, `?debug=1`) et l'invite de mise à jour du service worker restent hors de cette garde.
// Î10 : le livre est lu à l'exécution (`book.json`, `scenes/<id>.json`, voir bookSource.ts), plus de config compilée.
export default function BookApp() {
  const hash = useLocationHash();
  return (
    <TranslationProvider>
      <DebugConsole />
      <ServiceWorkerRegister inScene={hash !== undefined && parseSceneHash(hash) !== null} />
      {/* Rendu statique (build) : le hash n'est connu qu'au navigateur. */}
      {hash === undefined ? <Black /> : <InstallGate><BookRoute hash={hash} /></InstallGate>}
    </TranslationProvider>
  );
}

type Loaded<T> = { s: "loading" } | { s: "ok"; value: T } | { s: "error"; message: string };

/** Résultat d'une promesse, ignoré si le composant est démonté avant. `run` n'est appelé qu'au montage. */
function useLoaded<T>(run: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ s: "loading" });
  useEffect(() => {
    let alive = true;
    run().then(
      (value) => alive && setState({ s: "ok", value }),
      (e: Error) => alive && setState({ s: "error", message: e.message }),
    );
    return () => {
      alive = false;
    };
    // Chargé une fois par montage : la scène est fixée par la `key` du composant appelant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}

// Routeur du livre (D-8.4). `#/s/<scène>` → scène du livre ; `#/dev/<scène>` → fixture (développement seulement) ;
// hash vide (ou `#/debug`) → accueil provisoire (le menu de collection arrive en Î13) ; autre hash → scène inconnue.
function BookRoute({ hash }: { hash: string }) {
  const book = useLoaded(loadReaderBook);
  const devSceneId = isDev ? parseDevSceneHash(hash) : null;
  if (devSceneId) return <SceneRoute key={`dev:${devSceneId}`} load={() => loadFixtureScene(devSceneId)} />;

  if (book.s === "loading") return <Black />;
  if (book.s === "error") return <BookError message={book.message} />;
  return <BookRouteLoaded hash={hash} reader={book.value} />;
}

function BookRouteLoaded({ hash, reader }: { hash: string; reader: ReaderBook | null }) {
  useDocumentTitle(reader);
  return <BookPage hash={hash} reader={reader} />;
}

function BookPage({ hash, reader }: { hash: string; reader: ReaderBook | null }) {
  if (hash === "" || hash === "#" || hash === "#/" || hash === "#/debug") return <BookHome book={reader} />;

  const sceneId = parseSceneHash(hash);
  if (!sceneId || !reader) return <UnknownScene />;
  // `key` : changement de scène = démontage complet du lecteur (comme un changement de page auparavant).
  return <SceneRoute key={sceneId} load={() => loadReaderScene(reader, sceneId)} />;
}

function SceneRoute({ load }: { load: () => Promise<ReaderScene | null> }) {
  const state = useLoaded(load);
  if (state.s === "loading") return <Black />;
  if (state.s === "error") return <BookError message={state.message} />;
  if (!state.value) return <UnknownScene />;
  return <WebDioramaLoader scene={state.value} />;
}

/** Titre du document : titre du livre dans la langue du lecteur (Î12 ; au build, celui de la première langue). */
function useDocumentTitle(book: ReaderBook | null) {
  const { lang } = useTranslation();
  useEffect(() => {
    const title = book?.title?.[lang];
    if (title) document.title = title;
  }, [book, lang]);
}

type SceneName = { fr: string; en: string; es: string };

/** Noms des scènes pour l'accueil provisoire (lus dans les scènes elles-mêmes). */
function useSceneNames(book: ReaderBook | null): Record<string, SceneName | undefined> {
  const [names, setNames] = useState<Record<string, SceneName | undefined>>({});
  useEffect(() => {
    if (!book) return;
    let alive = true;
    Promise.all(
      book.scenes.map((id) =>
        loadReaderScene(book, id).then(
          (s) => [id, s?.config.name] as const,
          () => [id, undefined] as const,
        ),
      ),
    ).then((pairs) => {
      if (alive) setNames(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [book]);
  return names;
}

const linkClass = "glbi-btn glbi-btn-secondary px-6 py-3";

/** Écran plein du livre (accueil, erreurs) : zones sûres, sélecteur de langue en haut à droite. */
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main className="glbi-safe-padding relative min-h-dvh flex flex-col items-center justify-center gap-4 bg-black text-white text-center" style={{ paddingTop: "calc(var(--safe-top) + 3.75rem)" }}>
      <div className="glbi-corner-top-right">
        <LanguageSelector />
      </div>
      {children}
    </main>
  );
}

// Accueil provisoire (le menu de collection arrive en Î13) : titre du livre et noms des scènes dans la langue du
// lecteur. Le message sans livre et la fixture ne s'affichent qu'en développement (textes de développeur, en français).
function BookHome({ book }: { book: ReaderBook | null }) {
  const { t, lang } = useTranslation();
  const names = useSceneNames(book);
  return (
    <Screen>
      <h1 className="text-2xl font-bold">{book?.title?.[lang] ?? "GLBInterpreter"}</h1>
      {book && <p className="text-white/80">{t.home.subtitle}</p>}
      {book ? (
        <nav className="flex flex-col gap-3">
          {book.scenes.map((id) => (
            <a key={id} href={sceneHref(id)} className={linkClass}>
              {names[id]?.[lang] ?? id}
            </a>
          ))}
        </nav>
      ) : (
        <p className="text-white/70 max-w-md">
          Aucun livre préparé dans <code>public/{DEV_BOOK_DIR}</code> : lancer{" "}
          <code>npm run dev:book -- --source books/test-dino</code>.
        </p>
      )}
      {isDev && (
        <nav className="flex flex-col gap-3 mt-6">
          <p className="text-white/50 text-sm">Fixture de développement (modules réservés, hors schéma v1)</p>
          {fixtureSceneIds.map((id) => (
            <a key={id} href={`#/dev/${id}`} className={linkClass}>
              {id}
            </a>
          ))}
        </nav>
      )}
    </Screen>
  );
}

function Black() {
  return <div className="fixed inset-0 bg-black" />;
}

function UnknownScene() {
  const { t } = useTranslation();
  return (
    <Screen>
      <h1 className="text-2xl font-bold">{t.unknownScene.title}</h1>
      <p className="text-white/80">{t.unknownScene.message}</p>
      <a href="#/" className={linkClass}>
        {t.common.backHome}
      </a>
    </Screen>
  );
}

// Livre illisible (book.json ou scène invalide) : le détail technique reste en français (message du lecteur, pour
// le diagnostic), le titre et le bouton sont traduits.
function BookError({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <Screen>
      <h1 className="text-2xl font-bold">{t.install.invalidTitle}</h1>
      <p className="text-white/80 max-w-md break-words" lang="fr">
        {message}
      </p>
      <button type="button" onClick={() => window.location.reload()} className={linkClass}>
        {t.common.reload}
      </button>
    </Screen>
  );
}
