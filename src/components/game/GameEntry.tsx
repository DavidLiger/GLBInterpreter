"use client";
// Entrée du mini-jeu (`#/jeu` débloqué, `#/dev/jeu`), MJ1 : chunk à part chargé par `next/dynamic` depuis `BookApp.tsx`,
// seulement quand le jeu est ouvert. Un livre sans `book.json.game` ne porte pas ce chunk : `scripts/build-book.ts` le retire
// de `out/` d'après la liste écrite par next.config.ts (`.next/glbi-game-chunks.json`) ; `GAME_CHUNK_MARKER`, attribut de la
// page, est le garde-fou de cette exclusion (aucun fichier restant ne doit le porter).
//
// En attendant le moteur (MJ2, décision de David du 28/10, option B) : écran d'attente minimal, jamais imprimé, qui lit
// `game/game.json` (titre et consigne dans la langue choisie) : il vérifie la chaîne build → `game/game.json` → lecteur, hors
// ligne compris. Le moteur le remplacera par son écran de consigne.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/contexts/TranslationContext";
import LanguageSelector from "@/components/diorama/ui/LanguageSelector";
import { pageStorage } from "@/components/book/progress";
import { loadReaderGame, type ReaderGame } from "./gameSource";
import { GameStore } from "./gameStorage";

/** Marqueur du chunk du jeu (écrit dans la page ; cherché par scripts/build-book.ts, qui a la même valeur). */
const GAME_CHUNK_MARKER = "glbi-game-mj1";

interface GameEntryProps {
  bookId: string;
  onBack: () => void;
}

export default function GameEntry({ bookId, onBack }: GameEntryProps) {
  const { t, lang } = useTranslation();
  const [game, setGame] = useState<{ s: "loading" } | { s: "ok"; value: ReaderGame } | { s: "error"; message: string }>({ s: "loading" });
  const best = useMemo(() => new GameStore(bookId, pageStorage()).best(), [bookId]);
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
    <main
      className="glbi-safe-padding relative min-h-dvh flex flex-col items-center justify-center gap-4 bg-black text-white text-center"
      style={{ paddingTop: "calc(var(--safe-top) + 3.75rem)" }}
      data-glbi-game={GAME_CHUNK_MARKER}
      data-testid="game-entry"
    >
      <div className="glbi-corner-top-right">
        <LanguageSelector />
      </div>
      {game.s === "ok" && (
        <>
          <h1 className="text-2xl font-bold" data-testid="game-title">
            {game.value.title[lang]}
          </h1>
          <p className="max-w-md text-white/85" data-testid="game-instructions">
            {game.value.instructions[lang]}
          </p>
        </>
      )}
      {game.s === "error" && (
        <p className="max-w-md break-words text-white/80" lang="fr">
          {game.message}
        </p>
      )}
      <p className="max-w-md text-white/70" data-testid="game-placeholder">
        {t.jeu.placeholder}
      </p>
      {best !== null && <p className="text-white/80" data-testid="game-best">{t.jeu.best.replace("{n}", String(best))}</p>}
      <button type="button" className="glbi-btn glbi-btn-secondary px-6 py-3" onClick={onBack}>
        {t.collection.backToMenu}
      </button>
    </main>
  );
}
