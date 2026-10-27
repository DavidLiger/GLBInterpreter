// Scène du lecteur construite par l'atelier (A2) à partir de la réponse du serveur : objet fusionné `draft` (entrée
// `ReaderScene` v1 d'Î10a, traduite par `sceneToEngineConfig` comme dans le livre), ou, si la couche 3D est inutilisable,
// scène de diagnostic seul (GLB affiché sans module, cible caméra = premier nœud racine, lecture libre des clips).
import { sceneToEngineConfig, type ReaderBook, type ReaderScene } from "@/components/book/readerScene";
import { parseCardFields } from "@/components/card/cardModel";
import type { BuiltScene } from "@/schema/glbi";
import type { BookResponse, SceneResponse } from "./api";

export function readerBookOf(book: BookResponse): ReaderBook {
  const b = book.book;
  const title = b?.title;
  return {
    bookId: typeof b?.bookId === "string" ? b.bookId : "atelier",
    scenes: book.scenes.map((s) => s.id),
    fixture: false,
    title:
      title && typeof title.fr === "string" && typeof title.en === "string" && typeof title.es === "string"
        ? { fr: title.fr, en: title.en, es: title.es }
        : undefined,
    // Carte de collection (CC1) : intitulés lus pour l'aperçu de CC2 ; l'atelier ne montre pas encore la carte.
    cardFields: parseCardFields(b?.cardFields),
  };
}

/** Scène v1 pour le lecteur ; `diagnosticOnly` : pas de couche 3D utilisable. Chemins relatifs à /atelier/ (D-8.1). */
export function readerSceneOf(scene: SceneResponse, book: BookResponse): { reader: ReaderScene; diagnosticOnly: boolean } | null {
  if (scene.diagnostic.error) return null;
  const rb = readerBookOf(book);
  let built: BuiltScene;
  let diagnosticOnly = false;
  if (scene.draft) {
    built = scene.draft;
  } else {
    diagnosticOnly = true;
    const root = scene.diagnostic.rootNode;
    built = {
      version: 1,
      scene: { id: scene.id, name: { fr: scene.id, en: scene.id, es: scene.id } },
      modules: root ? { camera: { target: root, enableZoom: true } } : {},
      build: { glb: scene.glb, modelCredits: [] },
    } as BuiltScene;
  }
  return { reader: { kind: "v1", bookId: rb.bookId, built, config: sceneToEngineConfig(built, rb) }, diagnosticOnly };
}

/** Fichiers du dossier source dont dépend le rendu de la scène (une modification remonte le lecteur). */
export function sceneFiles(scene: SceneResponse): Set<string> {
  const files = new Set<string>([scene.glb, `scenes/${scene.id}.edit.json`]);
  const d = scene.draft;
  if (d) {
    if (d.scene.loaderImage) files.add(d.scene.loaderImage);
    if (d.modules.audio?.ambientSound) files.add(d.modules.audio.ambientSound);
    for (const a of d.modules.animations?.actions ?? []) {
      if (a.icon) files.add(a.icon);
      if (a.sound) files.add(a.sound);
    }
  }
  return files;
}
