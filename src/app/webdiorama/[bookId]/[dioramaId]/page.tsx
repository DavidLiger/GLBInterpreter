import { notFound, redirect } from "next/navigation"; // ✅ Ajouter redirect
import WebDioramaLoader from "@/components/diorama/WebDioramaLoader";
import type { DioramaConfig3DWithVideos } from "@/types/diorama";

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{
    bookId: string;
    dioramaId: string;
  }>;
  searchParams: Promise<{
    t?: string;
  }>;
};

export default async function DioramaPage({ params, searchParams }: Props) {
  const { bookId, dioramaId } = await params;
  const awaitedSearchParams = await searchParams;
  const token = awaitedSearchParams?.t;

  // ✅ Vérifier redirection EN DEHORS du try/catch
  if (process.env.NODE_ENV === "development") {
    const indexModule = await import(`@/content/webdioramas/${bookId}/index`);
    const webdioramas = indexModule.default as Record<
      string,
      { token: string; config: DioramaConfig3DWithVideos; redirectUrl?: string }
    >;

    const entry = webdioramas[dioramaId];
    if (!entry) return notFound();

    // Vérification du token
    if (!token || token !== entry.token) {
      console.warn("Token invalide", dioramaId, "fourni:", token);
      return notFound();
    }

    // ✅ Redirection AVANT le try (pas attrapée par catch)
    if (entry.redirectUrl) {
      console.log(`🔀 Redirection vers: ${entry.redirectUrl}`);
      redirect(entry.redirectUrl);
    }

    // Pas de redirection → afficher le webdiorama
    return <WebDioramaLoader config={entry.config} bookId={bookId} />;
  }

  // Prod
  try {
    const baseUrl = process.env.NEXT_PUBLIC_ASSETS_URL;

    const indexRes = await fetch(`${baseUrl}/assets/${bookId}/index.json`);
    if (!indexRes.ok) throw new Error("Index non trouvé");

    const indexJson = (await indexRes.json()) as Record<
      string,
      { path: string; token: string; redirectUrl?: string }
    >;

    const entry = indexJson[dioramaId];
    if (!entry) return notFound();

    if (!token || token !== entry.token) {
      console.warn("Token invalide", dioramaId, "fourni:", token);
      return notFound();
    }

    // ✅ Redirection HORS du try (pas attrapée par catch)
    if (entry.redirectUrl) {
      console.log(`🔀 Redirection vers: ${entry.redirectUrl}`);
      redirect(entry.redirectUrl);
    }

    const dioramaFile = entry.path;
    const dioramaRes = await fetch(`${baseUrl}/assets/${bookId}/${dioramaFile}`);
    if (!dioramaRes.ok) throw new Error("Fichier diorama non trouvé");
    const config = (await dioramaRes.json()) as DioramaConfig3DWithVideos;

    return <WebDioramaLoader config={config} bookId={bookId} />;
    
  } catch (err) {
    console.error("Erreur lors du chargement du diorama:", err);
    return notFound();
  }
}