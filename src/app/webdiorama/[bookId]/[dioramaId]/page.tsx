import { notFound } from "next/navigation";
import WebDioramaLoader from "@/components/WebDioramaLoader";
import type { DioramaConfig3DWithVideos } from "@/components/WebDioramaLoader";

type Props = {
  params: {
    bookId: string;
    dioramaId: string;
  };
};

export default async function DioramaPage({ params }: Props) {
  const { bookId, dioramaId } = params;

  try {
    let config: DioramaConfig3DWithVideos | undefined;

    if (process.env.NODE_ENV === "development") {
      // 🔹 Lecture locale
      const module = await import(`@/content/webdioramas/${bookId}/${dioramaId}`);
      config = Object.values(module)[0] as DioramaConfig3DWithVideos;
    } else {
      // 🔹 Lecture prod sur Cloudflare
      const baseUrl = process.env.NEXT_PUBLIC_ASSETS_URL; // ex: https://webdioramas.r2.cloudflarestorage.com
      const indexRes = await fetch(`${baseUrl}/books/${bookId}/index.json`);
      if (!indexRes.ok) throw new Error("Index non trouvé");
      const indexJson = await indexRes.json() as Record<string, string>;

      const dioramaFile = indexJson[dioramaId];
      if (!dioramaFile) throw new Error("Diorama non listé dans l'index");

      const dioramaRes = await fetch(`${baseUrl}/books/${bookId}/${dioramaFile}`);
      if (!dioramaRes.ok) throw new Error("Fichier diorama non trouvé");
      config = await dioramaRes.json() as DioramaConfig3DWithVideos;
    }

    if (!config) throw new Error("Config manquante pour ce diorama");

    return <WebDioramaLoader config={config} />;
  } catch (err) {
    console.error("Erreur lors du chargement du diorama:", err);
    notFound();
  }
}
