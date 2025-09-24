// src/app/webdiorama/[bookId]/[dioramaId]/page.tsx
import { notFound } from "next/navigation";
import DioramaClient from "./DioramaClient";

type Props = {
  params: {
    bookId: string;
    dioramaId: string;
  };
};

export default async function DioramaPage({ params }: Props) {
  const { bookId, dioramaId } = await params;

  if (!bookId || !dioramaId) {
    notFound();
  }

  return <DioramaClient bookId={bookId} dioramaId={dioramaId} />;
}
