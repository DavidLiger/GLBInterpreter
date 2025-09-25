import { street } from "./street";
// import { castle } from "./castle"; // si nécessaire
import type { DioramaConfig3D } from "@/components/diorama/WebDioramaLoader";

export type WebDioramaConfigEntry = {
  token: string;
  config: DioramaConfig3D;
};

const webdioramas: Record<string, WebDioramaConfigEntry> = {
  street: { token: "abcd1234", config: street },
  // castle: { token: "efgh5678", config: castle },
};

export default webdioramas;
