import street from "./street.json";
import castle from "./castle.json";

export type WebDioramaConfigEntry = {
  token: string;
  config: DioramaConfig3D;
};

import type { DioramaConfig3D } from "@/components/WebDioramaLoader";

const webdioramas: Record<string, WebDioramaConfigEntry> = {
  street: { token: "abcd1234", config: street },
//   castle: { token: "efgh5678", config: castle },
};

export default webdioramas;
