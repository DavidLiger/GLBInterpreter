// src/app/webgame/[bookId]/[gameId]/page.tsx
import { notFound } from "next/navigation";
import GameLoader from "@/components/game/GameLoader";
import type { GameConfig } from "@/types/game";

type Props = {
  params: Promise<{
    bookId: string;
    gameId: string;
  }>;
  searchParams: Promise<{
    t?: string;
  }>;
};

export default async function GamePage({ params, searchParams }: Props) {
  const { bookId, gameId } = await params;
  const awaitedSearchParams = await searchParams;
  const token = awaitedSearchParams?.t;

  if (process.env.NODE_ENV === "development") {
    const indexModule = await import(`@/content/webgames/${bookId}/index`);
    const webgames = indexModule.default as Record<
      string,
      { token: string; config: GameConfig }
    >;

    const entry = webgames[gameId];
    if (!entry) return notFound();

    if (!token || token !== entry.token) {
      console.warn("Token invalide");
      return notFound();
    }

    return <GameLoader config={entry.config} bookId={bookId} gameId={gameId} />;
  }

  // ✅ Prod - Même logique que dioramas
  try {
    const baseUrl = process.env.NEXT_PUBLIC_ASSETS_URL;

    // 1️⃣ Charger l'index des jeux
    const indexRes = await fetch(`${baseUrl}/assets/${bookId}/webgames/index.json`);
    if (!indexRes.ok) throw new Error("Index jeux non trouvé");

    const indexJson = await indexRes.json() as Record<
      string,
      { path: string; token: string }
    >;

    const entry = indexJson[gameId];
    if (!entry) return notFound();

    if (!token || token !== entry.token) {
      console.warn("Token invalide");
      return notFound();
    }

    // 2️⃣ Charger la config du jeu
    const gameFile = entry.path;
    const gameRes = await fetch(`${baseUrl}/assets/${bookId}/webgames/${gameFile}`);
    if (!gameRes.ok) throw new Error("Fichier jeu non trouvé");
    const config = await gameRes.json() as GameConfig;

    return <GameLoader config={config} bookId={bookId} gameId={gameId} />;
    
  } catch (err) {
    console.error("Erreur chargement jeu:", err);
    return notFound();
  }
}