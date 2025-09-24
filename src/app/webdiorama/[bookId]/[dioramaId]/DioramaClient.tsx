// src/app/webdiorama/[bookId]/[dioramaId]/DioramaClient.tsx
"use client";

import { useDioramaConfig } from "@/components/hooks/useDioramaConfig";
import WebDioramaLoader from "@/components/WebDioramaLoader";

type Props = {
  bookId: string;
  dioramaId: string;
};

export default function DioramaClient({ bookId, dioramaId }: Props) {
  const config = useDioramaConfig(bookId, dioramaId);

  if (!config) return <p>Chargement…</p>;

  return <WebDioramaLoader config={config} />;
}
