"use client";

import { useEffect, useState } from "react";
import type { DioramaConfig3DWithVideos } from "@/components/WebDioramaLoader";

export function useDioramaConfig(bookId: string, dioramaId: string) {
  const [config, setConfig] = useState<DioramaConfig3DWithVideos | null>(
    process.env.NODE_ENV === "development" ? require(`@/content/webdioramas/${bookId}/${dioramaId}`).street : null
  );

  useEffect(() => {
    async function loadConfig() {
      if (process.env.NODE_ENV === "production") {
        const url = `https://webdioramas.r2.cloudflarestorage.com/manifests/book-${bookId}/${dioramaId}.json`;
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = (await res.json()) as DioramaConfig3DWithVideos;
          setConfig(json);
        } catch (err) {
          console.error("Erreur fetch config R2:", err);
        }
      }
    }

    loadConfig();
  }, [bookId, dioramaId]);

  return config;
}