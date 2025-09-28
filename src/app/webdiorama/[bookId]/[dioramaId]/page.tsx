import { notFound } from "next/navigation";
import WebDioramaLoader from "@/components/diorama/WebDioramaLoader";
import type { DioramaConfig3DWithVideos } from "@/types/diorama";

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
  const { t: token } = await searchParams ?? {};

  try {
    let config: DioramaConfig3DWithVideos;

    // 🔹 Import dynamique de l’index correspondant au livre
    const indexModule = await import(`@/content/webdioramas/${bookId}/index`);
    const webdioramas = indexModule.default as Record<
      string,
      { token: string; config: DioramaConfig3DWithVideos }
    >;

    // Vérifier si le diorama existe
    const entry = webdioramas[dioramaId];
    if (!entry) return notFound();

    // Vérifier le token
    if (!token || token !== entry.token) {
      console.warn("Token invalide", dioramaId, "fourni:", token);
      return notFound();
    }

    if (process.env.NODE_ENV === "development") {
      // 🔹 En dev → on prend la config directe
      config = entry.config;
    } else {
      // 🔹 En prod → on va chercher le JSON (mais le token a déjà été validé ci-dessus)
      const baseUrl = process.env.NEXT_PUBLIC_ASSETS_URL;

      // 1️⃣ Charger l’index JSON stocké dans R2
      const indexRes = await fetch(`${baseUrl}/assets/${bookId}/index.json`);
      if (!indexRes.ok) throw new Error("Index non trouvé");
      const indexJson = (await indexRes.json()) as Record<string, string>;

      // 2️⃣ Trouver le fichier correspondant
      const dioramaFile = indexJson[dioramaId];
      if (!dioramaFile) throw new Error("Diorama non listé dans l'index");

      // 3️⃣ Charger la config JSON
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
