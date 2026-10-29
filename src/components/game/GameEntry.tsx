"use client";
// Entrée du mini-jeu (`#/jeu` débloqué, `#/dev/jeu`) : chunk à part chargé par `next/dynamic` depuis `BookApp.tsx`,
// seulement quand le jeu est ouvert. Un livre sans `book.json.game` ne porte pas ce chunk (ni celui de Rapier) :
// `scripts/build-book.ts` les retire de `out/` d'après la liste écrite par next.config.ts (`.next/glbi-game-chunks.json`) ;
// `GAME_CHUNK_MARKER`, attribut de la page, est le garde-fou de cette exclusion (aucun fichier restant ne doit le porter).
//
// MJ2 : l'écran d'attente de MJ1 (option B, jamais imprimé) est remplacé par le moteur : `game/game.json` lu, puis la vue du
// jeu (`GameView.tsx`), qui charge Rapier et les GLB de `game/` et ouvre sur l'écran de consigne.
import { useEffect, useState } from "react";
import { useTranslation } from "@/contexts/TranslationContext";
import LanguageSelector from "@/components/diorama/ui/LanguageSelector";
import { loadReaderGame, type ReaderGame } from "./gameSource";
import GameView from "./GameView";

/** Marqueur du chunk du jeu (écrit dans la page ; cherché par scripts/build-book.ts, qui a la même valeur). */
const GAME_CHUNK_MARKER = "glbi-game-mj1";

interface GameEntryProps {
  bookId: string;
  onBack: () => void;
}

export default function GameEntry({ bookId, onBack }: GameEntryProps) {
  const { t } = useTranslation();
  const [game, setGame] = useState<{ s: "loading" } | { s: "ok"; value: ReaderGame } | { s: "error"; message: string }>({ s: "loading" });
  useEffect(() => {
    let alive = true;
    loadReaderGame().then(
      (value) => alive && setGame({ s: "ok", value }),
      (e: Error) => alive && setGame({ s: "error", message: e.message }),
    );
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="relative min-h-dvh bg-black text-white" data-glbi-game={GAME_CHUNK_MARKER} data-testid="game-entry">
      {game.s === "ok" ? (
        <GameView bookId={bookId} game={game.value} onBack={onBack} />
      ) : (
        <div
          className="glbi-safe-padding flex min-h-dvh flex-col items-center justify-center gap-4 text-center"
          style={{ paddingTop: "calc(var(--safe-top) + 3.75rem)" }}
        >
          <div className="glbi-corner-top-right p-2">
            <LanguageSelector />
          </div>
          {game.s === "loading" ? (
            <p role="status" className="text-white/85">{t.jeu.loading}</p>
          ) : (
            <>
              <p className="max-w-md text-white/85">{t.jeu.error}</p>
              <p className="max-w-md break-words text-sm text-white/60" lang="fr">
                {game.message}
              </p>
            </>
          )}
          <button type="button" className="glbi-btn glbi-btn-secondary px-6 py-3" onClick={onBack}>
            {t.collection.backToMenu}
          </button>
        </div>
      )}
    </main>
  );
}
