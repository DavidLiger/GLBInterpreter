// src/content/book.ts
// Cartouche du build (Î5, D-8.4) : un site = un livre. `book.json` porte l'identifiant du livre et l'ordre des
// scènes ; il est aussi lu par `scripts/build-book.ts` en mode fixture (stubs `s/<scène>/index.html`, liste de fichiers).
// Provisoire : la fixture de test sert de livre au lecteur compilé. Un livre au format v1 (spec-extras-blender.md)
// est validé et assemblé par `npm run build -- --source <dossier>` (Î6) ; le lecteur le lit à partir d'Î10.
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
