import { notFound } from "next/navigation";
import WebDioramaLoader from "@/components/diorama/WebDioramaLoader";
import type { DioramaConfig3DWithVideos } from "@/types/diorama";
import { applyCacheBustersToConfig } from "@/components/diorama/lib/cacheUtils"; 

type Props = {
  params: {
    bookId: string;
    dioramaId: string;
  };
  searchParams: {
    t?: string;
  };
};

export default async function DioramaPage({ params, searchParams }: Props) {
  const { bookId, dioramaId } = await params;
  const awaitedSearchParams = await searchParams;
  const token = awaitedSearchParams?.t;

  try {
    let config: DioramaConfig3DWithVideos;
    let entryToken: string;

    if (process.env.NODE_ENV === "development") {
      // 🔹 Dev → import index local
      const indexModule = await import(`@/content/webdioramas/${bookId}/index`);
      const webdioramas = indexModule.default as Record<
        string,
        { token: string; config: DioramaConfig3DWithVideos }
      >;

      const entry = webdioramas[dioramaId];
      if (!entry) return notFound();

      entryToken = entry.token;
      config = entry.config;
    } else {
      // 🔹 Prod → charger index depuis R2
      const baseUrl = process.env.NEXT_PUBLIC_ASSETS_URL;

      // 1️⃣ Charger l'index JSON (avec token + path)
      const indexRes = await fetch(`${baseUrl}/assets/${bookId}/index.json`);
      if (!indexRes.ok) throw new Error("Index non trouvé");

      const indexJson = (await indexRes.json()) as Record<
        string,
        { path: string; token: string }
      >;

      const entry = indexJson[dioramaId];
      if (!entry) return notFound();

      entryToken = entry.token;
      const dioramaFile = entry.path;

      // 2️⃣ Charger la config JSON du diorama
      const dioramaRes = await fetch(`${baseUrl}/assets/${bookId}/${dioramaFile}`);
      if (!dioramaRes.ok) throw new Error("Fichier diorama non trouvé");
      config = (await dioramaRes.json()) as DioramaConfig3DWithVideos;
    }

    // 🔹 Vérification du token après récupération
    if (!token || token !== entryToken) {
      console.warn("Token invalide", dioramaId, "fourni:", token);
      return notFound();
    }

    // ✅ APPLIQUER LES CACHE BUSTERS ICI
    const processedConfig = applyCacheBustersToConfig(config);

    return <WebDioramaLoader config={processedConfig} />;
  } catch (err) {
    console.error("Erreur lors du chargement du diorama:", err);
    return notFound(); // ✅ Ajout du return
  }
}