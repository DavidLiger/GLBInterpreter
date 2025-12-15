import { demo } from "./demo";
import type { DioramaConfig3D } from "@/types/diorama"; 

export type WebDioramaConfigEntry = {
  token: string;
  config: DioramaConfig3D;
  redirectUrl?: string;
};

const webdioramas: Record<string, WebDioramaConfigEntry> = {
  demo: { 
    token: "abcd1234", 
    config: demo, 
    // redirectUrl: "/webgame/1/quiz?t=quiz1234" // permet de rédiriger vers un jeu
  }
};

export default webdioramas;
