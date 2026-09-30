import { street } from "./street"; 
import { castle } from "./castle"; 
import type { DioramaConfig3D } from "@/types/diorama"; 

export type WebDioramaConfigEntry = {
  config: DioramaConfig3D;
};

const webdioramas: Record<string, WebDioramaConfigEntry> = {
  street: { config: street },
  castle: { config: castle },
};

export default webdioramas;
