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

  try {
    if (process.env.NODE_ENV === "development") {
      // 🔹 Dev → import index local
      const indexModule = await import(`@/content/webgames/${bookId}/index`);
      const webgames = indexModule.default as Record<
        string,
        { token: string; config: GameConfig }
      >;

      const entry = webgames[gameId];
      if (!entry) return notFound();

      // Vérification du token
      if (!token || token !== entry.token) {
        console.warn("Token invalide", gameId, "fourni:", token);
        return notFound();
      }

      return <GameLoader config={entry.config} bookId={bookId} gameId={gameId} />;
      
    } else {
      // 🔹 Prod → charger index depuis R2
      const baseUrl = process.env.NEXT_PUBLIC_ASSETS_URL;

      // 1️⃣ Charger l'index JSON
      const indexRes = await fetch(`${baseUrl}/games/${bookId}/index.json`);
      if (!indexRes.ok) throw new Error("Index jeux non trouvé");

      const indexJson = (await indexRes.json()) as Record<
        string,
        { path: string; token: string }
      >;

      const entry = indexJson[gameId];
      if (!entry) return notFound();

      // Vérification du token
      if (!token || token !== entry.token) {
        console.warn("Token invalide", gameId, "fourni:", token);
        return notFound();
      }

      // 2️⃣ Charger la config JSON du jeu
      const gameFile = entry.path;
      const gameRes = await fetch(`${baseUrl}/games/${bookId}/${gameFile}`);
      if (!gameRes.ok) throw new Error("Fichier jeu non trouvé");
      const config = (await gameRes.json()) as GameConfig;

      return <GameLoader config={config} bookId={bookId} gameId={gameId} />;
    }
    
  } catch (err) {
    console.error("Erreur lors du chargement du jeu:", err);
    return notFound();
  }
}