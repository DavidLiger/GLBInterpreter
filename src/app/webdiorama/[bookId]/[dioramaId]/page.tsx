import { notFound } from "next/navigation";
import WebDioramaLoader from "@/components/diorama/WebDioramaLoader";
import type { DioramaConfig3DWithVideos } from "@/types/diorama"; 

type Props = {
  params: {
    bookId: string;
    dioramaId: string;
  };
};

export default async function DioramaPage({ params }: Props) {
  const { bookId, dioramaId } = await params;

  try {
    let config: DioramaConfig3DWithVideos;

    if (process.env.NODE_ENV === "development") {
      // 🔹 Lecture locale pour dev
      const module = await import(`@/content/webdioramas/${bookId}/${dioramaId}`);
      config = Object.values(module)[0] as DioramaConfig3DWithVideos;
    } else {
      // 🔹 Lecture prod via Worker
      const baseUrl = process.env.NEXT_PUBLIC_ASSETS_URL; 
      
      // 1️⃣ Récupérer l'index
      const indexRes = await fetch(`${baseUrl}/assets/${bookId}/index.json`);
      if (!indexRes.ok) throw new Error("Index non trouvé");
      const indexJson = (await indexRes.json()) as Record<string, string>;

      // 2️⃣ Trouver le fichier correspondant au diorama
      const dioramaFile = indexJson[dioramaId];
      if (!dioramaFile) throw new Error("Diorama non listé dans l'index");

      // 3️⃣ Récupérer la config JSON du diorama
      const dioramaRes = await fetch(`${baseUrl}/assets/${bookId}/${dioramaFile}`);
      if (!dioramaRes.ok) throw new Error("Fichier diorama non trouvé");
      config = (await dioramaRes.json()) as DioramaConfig3DWithVideos;
    }

    return <WebDioramaLoader config={config} />;
  } catch (err) {
    console.error("Erreur lors du chargement du diorama:", err);
    notFound();
  }
}