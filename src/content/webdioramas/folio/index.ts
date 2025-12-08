import { curriculum } from "./curriculum";
import type { DioramaConfig3D } from "@/types/diorama"; 

export type WebDioramaConfigEntry = {
  token: string;
  config: DioramaConfig3D;
  redirectUrl?: string;
};

const webdioramas: Record<string, WebDioramaConfigEntry> = {
  street: { 
    token: "abcd1234", 
    config: curriculum, 
    // redirectUrl: "/webgame/1/quiz?t=quiz1234" // permet de rédiriger vers un jeu
  }
};

export default webdioramas;
