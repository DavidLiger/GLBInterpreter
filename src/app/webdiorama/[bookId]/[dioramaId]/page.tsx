import { notFound, redirect } from "next/navigation";
import WebDioramaLoader from "@/components/diorama/WebDioramaLoader";
import type { DioramaConfig3DWithVideos } from "@/types/diorama";
import { allWebdioramas } from "@/content/webdioramas/index"; // ✅ Import statique

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ bookId: string; dioramaId: string }>;
  searchParams: Promise<{ t?: string }>;
};

export default async function DioramaPage({ params, searchParams }: Props) {
  const { bookId, dioramaId } = await params;
  const awaitedSearchParams = await searchParams;
  const token = awaitedSearchParams?.t;

  // ✅ Utiliser USE_R2 pour forcer R2 en local si besoin
  const useR2 = process.env.USE_R2 === 'true';

  if (!useR2) {
    // Mode local (dev ou build local sans R2)
    const webdioramas = allWebdioramas[bookId];
    
    if (!webdioramas) return notFound();

    const entry = webdioramas[dioramaId];
    if (!entry) return notFound();

    if (!token || token !== entry.token) {
      console.warn("Token invalide", dioramaId, "fourni:", token);
      return notFound();
    }

    // ✅ Vérifier redirection
    if (entry.redirectUrl) {
      console.log(`🔀 Redirection vers: ${entry.redirectUrl}`);
      redirect(entry.redirectUrl);
    }

    return <WebDioramaLoader config={entry.config} bookId={bookId} />;
  }

  // Mode R2 (production Vercel)
  try {
    const baseUrl = process.env.NEXT_PUBLIC_ASSETS_URL;

    const indexRes = await fetch(`${baseUrl}/assets/${bookId}/index.json`);
    if (!indexRes.ok) throw new Error("Index non trouvé");

    const indexJson = await indexRes.json() as Record<
      string,
      { path: string; token: string; redirectUrl?: string }
    >;

    const entry = indexJson[dioramaId];
    if (!entry) return notFound();

    if (!token || token !== entry.token) {
      console.warn("Token invalide", dioramaId, "fourni:", token);
      return notFound();
    }

    if (entry.redirectUrl) {
      console.log(`🔀 Redirection vers: ${entry.redirectUrl}`);
      redirect(entry.redirectUrl);
    }

    const dioramaFile = entry.path;
    const dioramaRes = await fetch(`${baseUrl}/assets/${bookId}/${dioramaFile}`);
    if (!dioramaRes.ok) throw new Error("Fichier diorama non trouvé");
    const config = await dioramaRes.json() as DioramaConfig3DWithVideos;

    return <WebDioramaLoader config={config} bookId={bookId} />;
    
  } catch (err) {
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') {
      throw err;
    }
    console.error("Erreur lors du chargement du diorama:", err);
    return notFound();
  }
}