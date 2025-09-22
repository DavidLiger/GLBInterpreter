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
  const { bookId, dioramaId } = await params;

  try {
    // 🔥 Import dynamique en fonction des paramètres d'URL
    const module = await import(`@/content/webdioramas/${bookId}/${dioramaId}`);
    const config = module.street ?? module.default as DioramaConfig3DWithVideos;

    if (!config) {
      throw new Error("Config manquante pour ce diorama");
    }

    return <WebDioramaLoader config={config} />;
  } catch (err) {
    console.error("Erreur lors du chargement du diorama:", err);
    notFound();
  }
}
