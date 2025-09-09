import street from "./street.json";
import castle from "./castle.json";

export type Layer = {
  image: string;
  zIndex: number;
};

export type DioramaConfig = {
  layers: Layer[];
  hotspots?: Hotspot[];
};

export type Hotspot = {
  id: string;
  x: number;
  y: number;
  icon: string;
  label?: string;
  zoom?: number;
  child?: DioramaConfig;
};

export type DioramaEntry = {
  token: string;
  config: DioramaConfig;
};

const dioramas: Record<string, DioramaEntry> = {
  street: { token: "abcd1234", config: street },
  castle: { token: "efgh5678", config: castle },
};

export default dioramas;
