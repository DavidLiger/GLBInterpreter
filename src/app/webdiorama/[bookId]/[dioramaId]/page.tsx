import { notFound } from "next/navigation";
import WebDioramaLoader from "@/components/WebDioramaLoader";
import type { DioramaConfig3DWithVideos } from "@/components/WebDioramaLoader";

type Props = {
  params: {
    bookId: string;
    dioramaId: string;
  };
};

function prefixPaths(config: DioramaConfig3DWithVideos, baseUrl: string): DioramaConfig3DWithVideos {
  // Copie profonde pour éviter de modifier l'objet original
  const clone = JSON.parse(JSON.stringify(config));

  const prefix = (path: string | undefined) => path ? `${baseUrl}${path}` : path;

  clone.glb = prefix(clone.glb);
  clone.loaderImage = prefix(clone.loaderImage);

  if (clone.pois) {
    const patchPois = (pois: typeof clone.pois) => {
      for (const poi of pois) {
        poi.icon = prefix(poi.icon);
        poi.ambientSound = prefix(poi.ambientSound);
        if (poi.children) patchPois(poi.children);
      }
    };
    patchPois(clone.pois);
  }

  if (clone.videos) {
    clone.videos = clone.videos.map((v: { src: string; [key: string]: any }) => ({
      ...v,
      src: prefix(v.src)
    }));
  }

  return clone;
}

export default async function DioramaPage({ params }: Props) {
  const { bookId, dioramaId } = params;

  try {
    let config: DioramaConfig3DWithVideos | undefined;

    if (process.env.NODE_ENV === "development") {
      // 🔹 Lecture locale
      const module = await import(`@/content/webdioramas/${bookId}/${dioramaId}`);
      config = Object.values(module)[0] as DioramaConfig3DWithVideos;
    } else {
      // 🔹 Lecture prod sur Cloudflare Worker
      const baseUrl = process.env.NEXT_PUBLIC_ASSETS_URL; // ex: https://webdiorama-proxy.david-liger-pro.workers.dev
      const indexRes = await fetch(`${baseUrl}/assets/${bookId}/index.json`);
      if (!indexRes.ok) throw new Error("Index non trouvé");
      const indexJson = await indexRes.json() as Record<string, string>;

      const dioramaFile = indexJson[dioramaId];
      if (!dioramaFile) throw new Error("Diorama non listé dans l'index");

      const dioramaRes = await fetch(`${baseUrl}/assets/${bookId}/${dioramaFile}`);
      if (!dioramaRes.ok) throw new Error("Fichier diorama non trouvé");
      const rawConfig = await dioramaRes.json() as DioramaConfig3DWithVideos;

      config = prefixPaths(rawConfig, `${baseUrl}/assets/${bookId}`);
    }

    if (!config) throw new Error("Config manquante pour ce diorama");

    return <WebDioramaLoader config={config} />;
  } catch (err) {
    console.error("Erreur lors du chargement du diorama:", err);
    notFound();
  }
}
