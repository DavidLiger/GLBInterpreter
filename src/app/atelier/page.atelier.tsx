// Atelier de configuration (piste A, A2 ; spec-atelier-glbi.md §9). Page de développement : elle n'existe que sous
// `npm run atelier` (ATELIER=1 déclare l'extension `atelier.tsx` dans `pageExtensions`, next.config.ts) et n'entre
// jamais dans le build d'un livre (contrôle de fin de build dans scripts/build-book.ts). Ouverte par le serveur de
// l'atelier à http://127.0.0.1:<port>/atelier/ ; le code est dans src/atelier/.
import type { Metadata } from "next";
import Atelier from "@/atelier/Atelier";

export const metadata: Metadata = { title: "Atelier — GLBInterpreter" };

export default function AtelierPage() {
  return <Atelier />;
}
