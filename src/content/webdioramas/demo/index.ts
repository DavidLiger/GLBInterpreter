import { demo } from "./demo";
import type { DioramaConfig3D } from "@/types/diorama"; 

export type WebDioramaConfigEntry = {
  config: DioramaConfig3D;
  redirectUrl?: string;
};

const webdioramas: Record<string, WebDioramaConfigEntry> = {
  demo: { config: demo }
};

export default webdioramas;
