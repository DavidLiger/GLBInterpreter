// src/content/book.ts
// Cartouche du build (Î5, D-8.4) : un site = un livre. `book.json` porte l'identifiant du livre et l'ordre des
// scènes ; il est aussi lu par `scripts/generate-scene-stubs.mjs` (stubs `s/<scène>/index.html`).
// Provisoire : la fixture de test sert de livre ; `build-book` (Î6) produira ces données depuis les extras GLB
// ou le JSON posé à côté du GLB.
import type { DioramaConfig3D } from '@/types/diorama';
import bookJson from './book.json';
import { testStreet } from './fixtures/test-street';

const configs: Record<string, DioramaConfig3D> = {
  street: testStreet,
};

for (const id of bookJson.scenes) {
  if (!configs[id]) throw new Error(`book.json : scène « ${id} » sans configuration dans book.ts`);
}

export const book = {
  /** Identifiant du livre (clés de cache et de progression). */
  id: bookJson.bookId,
  /** Scènes dans l'ordre du livre. */
  sceneIds: bookJson.scenes as readonly string[],
  getScene(sceneId: string): DioramaConfig3D | undefined {
    return bookJson.scenes.includes(sceneId) ? configs[sceneId] : undefined;
  },
};
