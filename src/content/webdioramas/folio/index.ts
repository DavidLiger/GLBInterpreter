import { curriculum } from "./curriculum";
import type { DioramaConfig3D } from "@/types/diorama"; 

export type WebDioramaConfigEntry = {
  config: DioramaConfig3D;
};

const webdioramas: Record<string, WebDioramaConfigEntry> = {
  curriculum: { config: curriculum }
};

export default webdioramas;
