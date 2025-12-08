// src/content/webdioramas/index.ts
import webdioramas1 from './1/index';
import webdioramasFolio from './folio/index'; 

export const allWebdioramas: Record<string, any> = {
  '1': webdioramas1,
  'folio': webdioramasFolio,
};