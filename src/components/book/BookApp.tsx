"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { GalleryVerticalEnd, QrCode, Sparkles } from "lucide-react";
import WebDioramaLoader from "@/components/diorama/WebDioramaLoader";
import { TranslationProvider, useTranslation } from "@/contexts/TranslationContext";
import LanguageSelector from "@/components/diorama/ui/LanguageSelector";
import Dialog from "@/components/ui/Dialog";
import type { ActionEvent } from "@/components/diorama/lib/buttonsPlayer";
import { requestPageFullscreen } from "@/components/diorama/lib/pageFullscreen";
import DebugConsole from "./DebugConsole";
import InstallGate from "./install/InstallGate";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import { DEV_BOOK_DIR, fixtureSceneIds, loadFixtureScene, loadReaderBook, loadReaderScene } from "./bookSource";
import type { ReaderBook, ReaderScene } from "./readerScene";
import type { QuizModule } from "@/schema/glbi";
import { cardCount, earnedCards, hasEarnedCard, isNewCard, type ReaderCard } from "@/components/card/cardModel";
import type { CardEntry } from "@/components/card/CardDialog";
import type { Lang, Messages } from "@/i18n/messages";
import { goToScene, parseDevSceneHash, parseSceneHash, sceneHref, useLocationHash } from "./sceneRoute";
import {
  ProgressStore, isUnlocked, pageStorage, sceneAccess, withCollected, withQuizPassed, withUnlocked, type Progress,
} from "./progress";

const isDev = process.env.NODE_ENV === "development";

// Quiz d'entrée (Î13) : chargé à la demande, hors du bundle de la page tant qu'aucune scène n'en demande un.
const Quiz = dynamic(() => import("@/components/quiz/Quiz"), { ssr: false, loading: () => <Black /> });

// Scanner QR interne (Î14) : fenêtre et décodeur `@zxing/browser` dans un chunk à part, chargé au premier toucher du
// bouton du menu ; le chunk est dans le livre (`book.json.files`), donc servi hors ligne par le service worker.
const QrScannerDialog = dynamic(() => import("@/components/scanner/QrScannerDialog"), { ssr: false, loading: () => null });

// Fenêtre d'une carte de collection (CC1) : `CardDialog` et `CollectionCard` dans un chunk à part, chargé à la première
// ouverture ; listé dans `book.json.files`, servi hors ligne comme le quiz et le scanner.
const CardDialog = dynamic(() => import("@/components/card/CardDialog"), { ssr: false, loading: () => null });

/** Durée du bandeau « Nouvelle carte ! » (spec-carte-collection.md §2). */
const NEW_CARD_BANNER_MS = 5000;

// Racine du livre. Î8 : rien du livre ne s'affiche avant l'installation complète (InstallGate) ; la console de
// débogage (`#/debug`, `?debug=1`) et l'invite de mise à jour du service worker restent hors de cette garde.
// Î10 : le livre est lu à l'exécution (`book.json`, `scenes/<id>.json`, voir bookSource.ts), plus de config compilée.
// Î13 : progression (`progress.ts`), menu de collection, quiz avant une scène, écran de blocage (`spec-progression.md`).
// CC1 : cartes de collection (`spec-carte-collection.md`) : bandeau et bouton « Carte » dans la scène, compte, « Voir la
// carte », mention de la carte à gagner, fenêtre de la carte (précédente et suivante depuis le menu).
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

// Routeur du livre (D-8.4). `#/s/<scène>` → scène du livre (quiz ou blocage selon la progression) ; `#/dev/<scène>` →
// fixture (développement seulement) ; hash vide (ou `#/debug`) → menu de collection ; autre hash → scène inconnue.
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
  const progress = useProgress(reader);
  return <BookPage hash={hash} reader={reader} progress={progress} />;
}

/** Progression du livre (`null` : pas de livre, ou cartouche fixture, hors progression). */
interface BookProgress {
  get: () => Progress;
  update: (fn: (p: Progress) => Progress) => void;
  reset: () => void;
}

/**
 * Progression du livre courant, lue dans le stockage à chaque rendu ; une écriture fait rendre de nouveau. La cartouche
 * fixture (`book.json` `fixture: true`, référence des modules réservés) est hors progression : tout y est ouvert.
 */
function useProgress(reader: ReaderBook | null): BookProgress | null {
  const store = useMemo(() => (reader && !reader.fixture ? new ProgressStore(reader.bookId, pageStorage()) : null), [reader]);
  const [, setRevision] = useState(0);
  const update = useCallback(
    (fn: (p: Progress) => Progress) => {
      if (!store) return;
      const before = JSON.stringify(store.get());
      if (JSON.stringify(store.update(fn)) !== before) setRevision((r) => r + 1);
    },
    [store],
  );
  const reset = useCallback(() => {
    store?.reset();
    setRevision((r) => r + 1);
  }, [store]);
  return useMemo(() => (store ? { get: () => store.get(), update, reset } : null), [store, update, reset]);
}

function BookPage({ hash, reader, progress }: { hash: string; reader: ReaderBook | null; progress: BookProgress | null }) {
  if (hash === "" || hash === "#" || hash === "#/" || hash === "#/debug") return <CollectionMenu book={reader} progress={progress} />;

  const sceneId = parseSceneHash(hash);
  if (!sceneId || !reader || !reader.scenes.includes(sceneId)) return <UnknownScene />;
  // `key` : changement de scène = démontage complet du lecteur (comme un changement de page auparavant).
  if (!progress) return <SceneRoute key={sceneId} load={() => loadReaderScene(reader, sceneId)} onBack={backToMenu} />;
  return <BookScene key={sceneId} reader={reader} sceneId={sceneId} progress={progress} />;
}

const backToMenu = () => goToScene(null);

/**
 * Scène du livre soumise à la progression (Q1). L'accès est fixé à l'arrivée : une scène non accessible affiche l'écran
 * de blocage sans rien charger (ni `scenes/<id>.json`, ni le lecteur, ni le GLB).
 */
function BookScene({ reader, sceneId, progress }: { reader: ReaderBook; sceneId: string; progress: BookProgress }) {
  const [access] = useState(() => sceneAccess(progress.get(), reader.scenes, sceneId));
  if (access === "locked" || access === "unknown") return <BlockedScene />;
  return <OpenScene reader={reader} sceneId={sceneId} progress={progress} needsQuiz={access === "accessible"} />;
}

function OpenScene({ reader, sceneId, progress, needsQuiz }: { reader: ReaderBook; sceneId: string; progress: BookProgress; needsQuiz: boolean }) {
  const state = useLoaded(() => loadReaderScene(reader, sceneId));
  const [quizDone, setQuizDone] = useState(false);
  const quiz = state.s === "ok" && state.value?.kind === "v1" ? state.value.built.modules.quiz : undefined;
  const showQuiz = needsQuiz && !!quiz && !quizDone;

  // Scène accessible sans quiz : débloquée à son ouverture (Q1).
  const opened = state.s === "ok" && !!state.value && !showQuiz;
  useEffect(() => {
    if (opened) progress.update((p) => withUnlocked(p, sceneId));
  }, [opened, progress, sceneId]);

  // Carte de collection (CC1, DP-10) : gagnée à la première action jouée (`collected`, inchangé depuis Î13). Au passage de
  // `collected` à vrai, bandeau « Nouvelle carte ! » (5 s, non bloquant, non enregistré : rien de rejoué au rechargement) ;
  // ensuite, bouton « Carte » dans le coin bas gauche. Scène sans `modules.card` : ni bandeau ni bouton.
  const card = state.s === "ok" && state.value?.kind === "v1" ? state.value.card : undefined;
  const cardRef = useRef(card);
  cardRef.current = card;
  const [newCard, setNewCard] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  useEffect(() => {
    if (!newCard) return;
    const timer = window.setTimeout(() => setNewCard(false), NEW_CARD_BANNER_MS);
    return () => window.clearTimeout(timer);
  }, [newCard]);
  const onAction = useCallback(
    (e: ActionEvent) => {
      if (e.phase !== "start") return;
      if (isNewCard(progress.get(), sceneId, !!cardRef.current)) setNewCard(true);
      progress.update((p) => withCollected(p, sceneId));
    },
    [progress, sceneId],
  );

  if (state.s === "loading") return <Black />;
  if (state.s === "error") return <BookError message={state.message} />;
  if (!state.value) return <UnknownScene />;
  if (showQuiz) {
    return (
      <QuizScreen
        scene={state.value}
        quiz={quiz!}
        onPassed={() => progress.update((p) => withQuizPassed(p, sceneId))}
        onContinue={() => {
          // Î13bis : « Passer » est le geste qui précède la scène (lancée sans écran de démarrage) : plein écran demandé
          // ici (l'API exige un geste) ; le son suit (activation de la page). Échap, qui vaut aussi « Passer », n'est pas
          // un geste reconnu par le navigateur : la scène s'ouvre alors sans plein écran.
          requestPageFullscreen();
          setQuizDone(true);
        }}
      />
    );
  }
  const earned = !!card && hasEarnedCard(progress.get(), sceneId);
  const openCard = () => {
    setNewCard(false);
    setCardOpen(true);
  };
  return (
    <>
      <WebDioramaLoader
        scene={state.value}
        onAction={onAction}
        onBack={backToMenu}
        cornerBottomLeft={earned ? <CardButton onClick={openCard} /> : undefined}
        aboveActions={card ? <NewCardBanner show={newCard} onOpen={openCard} /> : undefined}
      />
      {card && cardOpen && (
        <CardDialog
          entries={[{ sceneId, card, title: state.value.config.name, number: reader.scenes.indexOf(sceneId) + 1 }]}
          index={0}
          onClose={() => setCardOpen(false)}
          fields={reader.cardFields}
          total={reader.scenes.length}
          bookTitle={reader.title}
        />
      )}
    </>
  );
}

/** Bouton « Carte » de la scène (CC1) : icône, nom traduit, 44 px. */
function CardButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={onClick} className="glbi-icon-btn" aria-label={t.card.open} title={t.card.open} aria-haspopup="dialog" data-testid="card-button">
      <GalleryVerticalEnd size={22} aria-hidden="true" />
    </button>
  );
}

/** Bandeau « Nouvelle carte ! » (CC1) : annoncé (`role="status"`), un toucher ouvre la carte ; l'animation et le son continuent. */
function NewCardBanner({ show, onOpen }: { show: boolean; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite">
      {show && (
        <button type="button" className="glbi-new-card" onClick={onOpen} aria-haspopup="dialog" data-testid="new-card">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
          {t.card.newCard}
        </button>
      )}
    </div>
  );
}

function QuizScreen({ scene, quiz, onPassed, onContinue }: { scene: ReaderScene; quiz: QuizModule; onPassed: () => void; onContinue: () => void }) {
  const { lang } = useTranslation();
  return (
    <Screen>
      <Quiz quiz={quiz} title={scene.config.name[lang]} onPassed={onPassed} onContinue={onContinue} />
    </Screen>
  );
}

function SceneRoute({ load, onBack }: { load: () => Promise<ReaderScene | null>; onBack?: () => void }) {
  const state = useLoaded(load);
  if (state.s === "loading") return <Black />;
  if (state.s === "error") return <BookError message={state.message} />;
  if (!state.value) return <UnknownScene />;
  return <WebDioramaLoader scene={state.value} onBack={onBack} />;
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
type SceneCard = { name?: SceneName; image?: string; card?: ReaderCard };

/**
 * Nom, image de chargement et carte de collection (CC1) de chaque scène (lus dans les scènes elles-mêmes) pour le menu ;
 * `null` tant que les scènes ne sont pas toutes lues.
 */
function useSceneCards(book: ReaderBook | null): Record<string, SceneCard | undefined> | null {
  const [cards, setCards] = useState<Record<string, SceneCard | undefined> | null>(null);
  useEffect(() => {
    if (!book) return;
    let alive = true;
    Promise.all(
      book.scenes.map((id) =>
        loadReaderScene(book, id).then(
          (s) => [id, s ? { name: s.config.name, image: s.config.loaderImage, card: s.kind === "v1" ? s.card : undefined } : undefined] as const,
          () => [id, undefined] as const,
        ),
      ),
    ).then((pairs) => {
      if (alive) setCards(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [book]);
  return cards;
}

const linkClass = "glbi-btn glbi-btn-secondary px-6 py-3";

/** Écran plein du livre (menu, quiz, blocage, erreurs) : zones sûres, sélecteur de langue en haut à droite. */
function Screen({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <main className={`glbi-safe-padding ${className} relative min-h-dvh flex flex-col items-center justify-center gap-4 bg-black text-white text-center`} style={{ paddingTop: "calc(var(--safe-top) + 3.75rem)" }}>
      <div className="glbi-corner-top-right">
        <LanguageSelector />
      </div>
      {children}
    </main>
  );
}

/** Image de chargement d'une scène, sinon icône du livre ; masquée si elle est introuvable. */
function CardImage({ src }: { src?: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return <span className="h-14 w-14 shrink-0" aria-hidden="true" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- export statique, images du livre servies telles quelles (D-7.5)
    <img src={src ?? "icon.png"} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover bg-white/10" onError={() => setHidden(true)} />
  );
}

/**
 * Case d'une scène débloquée du menu : lien qui ouvre la scène (Î13) ; carte de collection (CC1) : bouton « Voir la carte »
 * (44 px) à côté du lien si elle est gagnée, mention commune à tous les livres sous la case sinon (hors du lien, dont le nom
 * reste celui de la scène).
 */
function UnlockedScene({ id, name, image, card, onOpen, onViewCard }: {
  id: string;
  name: string;
  image?: string;
  card: "none" | "won" | "toEarn";
  onOpen?: () => void;
  onViewCard: () => void;
}) {
  const { t } = useTranslation();
  const hintId = `to-earn-${id}`;
  return (
    <div className="flex w-full flex-col gap-1">
      <div className="flex w-full items-center gap-2">
        <a
          href={sceneHref(id)}
          // Î13bis : le clic d'une carte est le geste qui précède la scène (lancée sans écran de démarrage) : plein écran
          // demandé ici ; le son suit (activation de la page). Hors progression (fixture) : inchangé.
          onClick={onOpen}
          className="glbi-btn glbi-btn-secondary min-w-0 flex-1 justify-start gap-4 px-3 py-2 text-left text-lg"
          aria-describedby={card === "toEarn" ? hintId : undefined}
          data-testid="collection-scene"
        >
          <CardImage src={image} />
          <span className="min-w-0">{name}</span>
        </a>
        {card === "won" && (
          <button
            type="button"
            className="glbi-btn glbi-btn-outline shrink-0 gap-1 px-3 text-sm"
            onClick={onViewCard}
            aria-haspopup="dialog"
            aria-label={fill(t.card.viewNamed, { name })}
            data-testid="card-view"
          >
            <GalleryVerticalEnd className="h-5 w-5" aria-hidden="true" />
            {t.card.view}
          </button>
        )}
      </div>
      {card === "toEarn" && (
        <p id={hintId} className="px-4 text-left text-sm text-white/70" data-testid="card-to-earn">
          {t.card.toEarn}
        </p>
      )}
    </div>
  );
}

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** « n cartes sur N » (CC1) : singulier pour 0 et 1 en français, pour 1 seulement en anglais et en espagnol. */
function cardCountText(t: Messages, lang: Lang, n: number, total: number): string {
  const one = lang === "fr" ? n <= 1 : n === 1;
  return fill(one ? t.card.countOne : t.card.countMany, { n, total });
}

// Menu de collection (Î13, remplace l'accueil provisoire) : scènes dans l'ordre du livre ; débloquées = carte avec nom
// et image, qui ouvre la scène ; les autres grisées, numéro et « ? », non cliquables (Q2) ; remise à zéro confirmée (Q6).
// Le message sans livre et la fixture ne s'affichent qu'en développement (textes de développeur, en français).
// Î14 (décisions de David du 17/10) : consigne et bouton du scanner entre le compte et la liste, visibles sans défiler
// même avec 15 scènes ; bouton affiché dès qu'il y a une progression (livre v1, `npm run dev` compris), même sans rien
// de débloqué, et jamais dans la cartouche fixture.
function CollectionMenu({ book, progress }: { book: ReaderBook | null; progress: BookProgress | null }) {
  const { t, lang } = useTranslation();
  const cards = useSceneCards(book);
  const p = progress?.get();
  const unlocked = (id: string) => !p || isUnlocked(p, id);
  const count = book ? book.scenes.filter(unlocked).length : 0;
  const [confirmReset, setConfirmReset] = useState(false);
  const resetTitleId = useId();
  const [scanning, setScanning] = useState(false);
  // Cartes de collection (CC1) : compte « n cartes sur N » si au moins une scène du livre a une carte (N = scènes avec
  // carte), sinon le compte des découvertes (Î13) ; carte ouverte depuis le menu, avec précédente et suivante parmi les
  // cartes gagnées, dans l'ordre du livre.
  const withCard = (id: string) => !!cards?.[id]?.card;
  const cardTally = p && book && cards ? cardCount(p, book.scenes, withCard) : null;
  const earned = p && book ? earnedCards(p, book.scenes, withCard) : [];
  const [openCard, setOpenCard] = useState<string | null>(null);
  const cardEntries: CardEntry[] = book
    ? earned.map((id) => ({ sceneId: id, card: cards![id]!.card!, title: cards![id]!.name ?? { fr: id, en: id, es: id }, number: book.scenes.indexOf(id) + 1 }))
    : [];
  const openIndex = openCard ? cardEntries.findIndex((e) => e.sceneId === openCard) : -1;

  return (
    <Screen className="glbi-menu">
      <h1 className="text-2xl font-bold">{book?.title?.[lang] ?? "GLBInterpreter"}</h1>
      {book ? (
        <>
          {/* Masqué tant que les scènes ne sont pas lues : le compte dépend de leurs cartes (pas de changement visible). */}
          <p className="text-white/80" data-testid="collection-count" style={cards ? undefined : { visibility: "hidden" }}>
            {t.collection.title} ·{" "}
            {cardTally ? cardCountText(t, lang, cardTally.n, cardTally.total) : fill(t.collection.progress, { n: count, total: book.scenes.length })}
          </p>
          {/* Rien de débloqué (app ouverte par son icône sans QR scanné) : consigne de commencer par la première page. */}
          {count < book.scenes.length && (
            <p className="max-w-md text-white/80" data-testid="collection-hint">
              {count === 0 ? t.collection.start : t.collection.hint}
            </p>
          )}
          {progress && (
            <button
              type="button"
              className="glbi-btn glbi-btn-primary px-6 py-3 text-lg"
              // Toucher = geste dans la page (Î13bis) : plein écran de la page demandé ici, comme au clic d'une carte ;
              // l'activation de la page est acquise, la scène ouverte par le scanner joue son son sans pastille.
              onClick={() => {
                requestPageFullscreen();
                setScanning(true);
              }}
              aria-haspopup="dialog"
              data-testid="scanner-button"
            >
              <QrCode className="h-6 w-6" aria-hidden="true" />
              {t.scanner.button}
            </button>
          )}
          {scanning && (
            <QrScannerDialog origin={book.origin} scenes={book.scenes} onClose={() => setScanning(false)} onScene={goToScene} />
          )}
          <ol className="flex w-full max-w-md flex-col gap-3" data-testid="collection">
            {book.scenes.map((id, i) => {
              const card = cards?.[id];
              const won = !!p && !!card?.card && hasEarnedCard(p, id);
              return (
                <li key={id}>
                  {unlocked(id) ? (
                    <UnlockedScene
                      id={id}
                      name={card?.name?.[lang] ?? id}
                      image={card?.image}
                      // Carte (CC1) : « Voir la carte » si elle est gagnée, mention de la carte à gagner sinon.
                      card={!p || !card?.card ? "none" : won ? "won" : "toEarn"}
                      onOpen={progress ? requestPageFullscreen : undefined}
                      onViewCard={() => setOpenCard(id)}
                    />
                  ) : (
                    <div
                      className="flex min-h-11 w-full items-center gap-4 rounded-full bg-white/5 px-3 py-2 text-left text-lg text-white/45"
                      aria-label={fill(t.collection.locked, { n: i + 1 })}
                      role="img"
                      data-testid="collection-locked"
                    >
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/10 text-2xl font-bold" aria-hidden="true">
                        ?
                      </span>
                      <span aria-hidden="true">{i + 1}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {progress && count > 0 && (
            <button type="button" className="glbi-btn glbi-btn-link mt-4 text-sm" onClick={() => setConfirmReset(true)} aria-haspopup="dialog" data-testid="collection-reset">
              {t.collection.reset}
            </button>
          )}
          {openIndex >= 0 && (
            <CardDialog
              entries={cardEntries}
              index={openIndex}
              onIndex={(i) => setOpenCard(cardEntries[i].sceneId)}
              onClose={() => setOpenCard(null)}
              fields={book.cardFields}
              total={book.scenes.length}
              bookTitle={book.title}
            />
          )}
          <Dialog open={confirmReset} onClose={() => setConfirmReset(false)} labelledBy={resetTitleId} className="glbi-dialog" testId="collection-reset-dialog">
            <div className="glbi-panel flex flex-col items-center gap-4 p-6 text-center">
              <h2 id={resetTitleId} className="text-xl font-bold">
                {t.collection.resetTitle}
              </h2>
              <p className="text-white/85">{t.collection.resetMessage}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <button type="button" className="glbi-btn glbi-btn-primary" onClick={() => setConfirmReset(false)}>
                  {t.collection.cancel}
                </button>
                <button
                  type="button"
                  className="glbi-btn glbi-btn-outline"
                  onClick={() => {
                    progress?.reset();
                    setConfirmReset(false);
                  }}
                  data-testid="collection-reset-confirm"
                >
                  {t.collection.confirmReset}
                </button>
              </div>
            </div>
          </Dialog>
        </>
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

/** Scène pas encore accessible (Q1, Q2) : affiché avant tout chargement de la scène. */
function BlockedScene() {
  const { t } = useTranslation();
  return (
    <Screen>
      <h1 className="text-2xl font-bold" data-testid="blocked-title">
        {t.blocked.title}
      </h1>
      <p className="max-w-md text-white/80">{t.blocked.message}</p>
      <a href="#/" className={linkClass}>
        {t.collection.backToMenu}
      </a>
    </Screen>
  );
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
