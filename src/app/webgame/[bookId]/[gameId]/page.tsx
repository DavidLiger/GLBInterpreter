// src/app/webgame/[bookId]/[gameId]/page.tsx
import { notFound, redirect } from "next/navigation"; // ✅ Ajouter redirect
import GameLoader from "@/components/game/GameLoader";
import type { GameConfig } from "@/types/game";
import { allWebgames } from "@/content/webgames/index"; // ✅ Import statique

export const dynamic = 'force-dynamic'; // ✅ Ajouter

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

  // ✅ Utiliser USE_R2 pour forcer R2 en production Vercel
  const useR2 = process.env.USE_R2 === 'true';

  if (!useR2) {
    // Mode local (dev ou build local sans R2)
    const webgames = allWebgames[bookId];
    
    if (!webgames) return notFound();

    const entry = webgames[gameId];
    if (!entry) return notFound();

    if (!token || token !== entry.token) {
      console.warn("Token invalide", gameId, "fourni:", token);
      return notFound();
    }

    // ✅ Si le jeu a une redirection (cas rare mais possible)
    if (entry.redirectUrl) {
      console.log(`🔀 Redirection depuis le jeu vers: ${entry.redirectUrl}`);
      redirect(entry.redirectUrl);
    }

    return <GameLoader config={entry.config} bookId={bookId} gameId={gameId} />;
  }

  // Mode R2 (production Vercel)
  try {
    const baseUrl = process.env.NEXT_PUBLIC_ASSETS_URL;

    // 1️⃣ Charger l'index des jeux
    const indexRes = await fetch(`${baseUrl}/assets/${bookId}/webgames/index.json`);
    if (!indexRes.ok) throw new Error("Index jeux non trouvé");

    const indexJson = await indexRes.json() as Record<
      string,
      { path: string; token: string; redirectUrl?: string } // ✅ Ajouter redirectUrl
    >;

    const entry = indexJson[gameId];
    if (!entry) return notFound();

    if (!token || token !== entry.token) {
      console.warn("Token invalide", gameId, "fourni:", token);
      return notFound();
    }

    // ✅ Vérifier redirection (hors du try/catch si possible, mais ici on est déjà dedans)
    if (entry.redirectUrl) {
      console.log(`🔀 Redirection depuis le jeu vers: ${entry.redirectUrl}`);
      redirect(entry.redirectUrl);
    }

    // 2️⃣ Charger la config du jeu
    const gameFile = entry.path;
    const gameRes = await fetch(`${baseUrl}/assets/${bookId}/webgames/${gameFile}`);
    if (!gameRes.ok) throw new Error("Fichier jeu non trouvé");
    const config = await gameRes.json() as GameConfig;

    return <GameLoader config={config} bookId={bookId} gameId={gameId} />;
    
  } catch (err) {
    // ✅ Filtrer NEXT_REDIRECT
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') {
      throw err;
    }
    console.error("Erreur chargement jeu:", err);
    return notFound();
  }
}