import { notFound } from "next/navigation";
import WebDioramaLoader, { DioramaConfig3D } from "@/components/WebDioramaLoader";
import webdioramas from "@/content/webdioramas";

type WebDioramaPageProps = {
  params: { id: string };
  searchParams: { t?: string };
};

export default async function WebDioramaPage({ params, searchParams }: WebDioramaPageProps) {
  const { id } = params;
  const token = searchParams?.t;

  const diorama = webdioramas[id];
  if (!diorama || diorama.token !== token) {
    notFound();
  }

  return <WebDioramaLoader config={diorama.config} />;
}
