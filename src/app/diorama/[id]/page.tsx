"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import DioramaViewer2D from "@/components/DioramaViewer2D";
import dioramas from "@/content/dioramas";

export default function DioramaPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string;
  const token = searchParams?.get("t") || "";

  const [diorama, setDiorama] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    const data = dioramas[id];
    if (data && data.token === token) {
      setDiorama(data);
    } else {
      setDiorama(null);
    }
  }, [id, token]);

  if (!diorama) {
    return <div className="flex items-center justify-center h-screen">Chargement du diorama...</div>;
  }

  return <DioramaViewer2D config={diorama.config} />;
}
