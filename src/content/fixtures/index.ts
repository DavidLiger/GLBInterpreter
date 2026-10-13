// Fixtures de développement (décision de David du 12/10/2026) : scènes écrites au format du moteur (`DioramaConfig3D`),
// hors schéma v1, qui utilisent les modules réservés de la console (POI hiérarchiques, cameraPath, dialogues,
// spritesheets, vidéos, lumières, ampoules, contour toon, post-processing, effets). Elles restent la référence de ces
// modules jusqu'à leur reprise un par un (piste A).
//
// Chargées par import dynamique seulement : `#/dev/<scène>` en `npm run dev`, ou `#/s/<scène>` dans la cartouche de
// test exportée (`npm run build` sans `--source`, `book.json` `fixture: true`). Une scène v1 n'en charge aucune.
import type { DioramaConfig3D } from "@/types/diorama";

export const fixtureScenes: Record<string, () => Promise<DioramaConfig3D>> = {
  street: () => import("./test-street").then((m) => m.testStreet),
};

/** Identifiant de la cartouche de test (clés de cache et de progression ; `src/content/book.json`). */
export const FIXTURE_BOOK_ID = "test-street";
