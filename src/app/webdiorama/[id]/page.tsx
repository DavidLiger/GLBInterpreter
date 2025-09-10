import { notFound } from "next/navigation";
import WebDioramaLoader, { DioramaConfig3D } from "@/components/WebDioramaLoader";
import dioramas3d from "@/content/webdioramas";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
};

export default async function WebDioramaPage({ params, searchParams }: Props) {
  // ⚠️ Désormais on await params et searchParams
  const { id } = await params;
  const { t } = await searchParams;

  const diorama = dioramas3d[id];
  if (!diorama || diorama.token !== t) {
    notFound();
  }

  return <WebDioramaLoader config={diorama.config} />;
}
