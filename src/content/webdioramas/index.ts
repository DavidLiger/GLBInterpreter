// src/content/webdioramas/index.ts
// Registre provisoire : une seule cartouche (fixture de test). Disparaît en Î5 (fin du multi-livres).
import type { DioramaConfig3D } from '@/types/diorama';
import { testStreet } from '../fixtures/test-street';

export type WebDioramaConfigEntry = {
  config: DioramaConfig3D;
};

// Le bookId '1' est conservé : le manifest de téléchargement (downloadManager) résout
// encore `assets/<bookId>/index.json` côté R2 jusqu'à Î5/Î8.
export const allWebdioramas: Record<string, Record<string, WebDioramaConfigEntry>> = {
  '1': {
    street: { config: testStreet },
  },
};
