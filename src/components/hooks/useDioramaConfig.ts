"use client";

import { useEffect, useState } from "react";
import type { DioramaConfig3DWithVideos } from "@/components/WebDioramaLoader";

export function useDioramaConfig(bookId: string, dioramaId: string) {
  const [config, setConfig] = useState<DioramaConfig3DWithVideos | null>(() => {
    if (process.env.NODE_ENV === "development") {
      const mod = require(`@/content/webdioramas/${bookId}/${dioramaId}`);
      // Si le TS exporte un objet nommé identique au fichier, prends-le, sinon default
      return mod[dioramaId] ?? mod.default ?? null;
    }
    return null;
  });

  useEffect(() => {
    async function loadConfig() {
      if (process.env.NODE_ENV === "production") {
        const url = `/manifests/${bookId}/${dioramaId}.json`;
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = (await res.json()) as DioramaConfig3DWithVideos;
          setConfig(json);
        } catch (err) {
          console.error("Erreur fetch config prod:", err);
        }
      }
    }
    loadConfig();
  }, [bookId, dioramaId]);

  return config;
}
