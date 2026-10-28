// Scène lue par le lecteur (Î10, C-01 à C-04, C-17, V-04).
//
// Entrée unique du lecteur (`WebDioramaLoader`) : `ReaderScene`.
//  - scène v1 : `scenes/<id>.json` écrit par `build-book` (type `BuiltScene`, schéma Zod `src/schema/glbi.ts`), lu à
//    l'exécution et traduit pour le moteur de scène en un `DioramaConfig3D` à **un seul POI nommé `start`** (V-04) :
//    c'est une traduction de `modules.camera`, pas un retrait ; la navigation entre POI (POI hiérarchiques, `goToPOI`,
//    transitions, `cameraPath`) reste dans le moteur comme module réservé ;
//  - fixture de développement (`src/content/fixtures/`) : déjà au format du moteur, hors schéma v1.
//
// Le lecteur n'embarque pas Zod (devDependency) : le build a validé la scène ; `parseBuiltScene` refait une
// vérification de forme minimale des champs lus, pour un message lisible si le dossier n'est pas un livre construit.
import type { BuiltScene } from "@/schema/glbi";
import type { ButtonsModeConfig, CreditEntry, DioramaConfig3D, DioramaCredits, POI } from "@/types/diorama";
import { parseCardTypes, readerCardOf, type CardType, type ReaderCard } from "@/components/card/cardModel";

/** Identifiant du POI de départ (V-04) : seul POI d'une scène v1, premier POI de la fixture. */
export const START_POI_ID = "start";

export type ReaderScene =
  | {
      kind: "v1";
      bookId: string;
      built: BuiltScene;
      config: DioramaConfig3D;
      /** Carte de collection de la scène (CC1, `modules.card`), chemins résolus ; absente si la scène n'en a pas. */
      card?: ReaderCard;
    }
  | { kind: "fixture"; bookId: string; config: DioramaConfig3D };

/** Couche livre utile au lecteur (`book.json` construit, sans la liste `files`). */
export interface ReaderBook {
  bookId: string;
  scenes: string[];
  /** Cartouche de test (`npm run build` sans `--source`) : scènes lues dans `src/content/fixtures/`. */
  fixture: boolean;
  title?: { fr: string; en: string; es: string };
  legal?: { year: number; text: { fr: string; en: string; es: string } };
  /** Adresse imprimée dans les QR (`book.json.origin`) : le scanner interne n'accepte que les QR de ce livre (Î14). */
  origin?: string;
  /**
   * Types de cartes de collection (CC3) : `book.json.cardTypes`, sinon un type implicite `personnage` tiré de `cardFields`
   * (CC1 ; sans intitulé si le livre n'en a pas). Jamais vide.
   */
  cardTypes: CardType[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Vérification de forme de `book.json` (champs lus par le lecteur). */
export function parseReaderBook(raw: unknown): ReaderBook {
  if (!isObj(raw) || typeof raw.bookId !== "string" || !Array.isArray(raw.scenes) || !raw.scenes.every((s) => typeof s === "string")) {
    throw new Error("book.json : { bookId, scenes } attendu");
  }
  return {
    bookId: raw.bookId,
    scenes: raw.scenes as string[],
    fixture: raw.fixture === true,
    title: isObj(raw.title) ? (raw.title as ReaderBook["title"]) : undefined,
    legal: isObj(raw.legal) ? (raw.legal as ReaderBook["legal"]) : undefined,
    origin: typeof raw.origin === "string" ? raw.origin : undefined,
    cardTypes: parseCardTypes(raw.cardFields, raw.cardTypes),
  };
}

/** Carte de collection d'une scène v1 (CC1) : `base` préfixe les chemins comme pour le reste de la scène (D-8.1). */
export function sceneCard(built: BuiltScene, base = ""): ReaderCard | undefined {
  return readerCardOf((built.modules as Record<string, unknown>).card, built.scene.loaderImage, (p) => `${base}${p}`);
}

/** Vérification de forme de `scenes/<id>.json` (contrat complet : `builtSceneSchema`, appliqué au build). */
export function parseBuiltScene(raw: unknown, sceneId: string): BuiltScene {
  const where = `scenes/${sceneId}.json`;
  if (!isObj(raw) || raw.version !== 1) throw new Error(`${where} : version 1 attendue`);
  const scene = raw.scene;
  if (!isObj(scene) || scene.id !== sceneId || !isObj(scene.name)) throw new Error(`${where} : scene.id « ${sceneId} » et scene.name attendus`);
  if (!isObj(raw.modules)) throw new Error(`${where} : modules attendu`);
  const build = raw.build;
  if (!isObj(build) || typeof build.glb !== "string" || !Array.isArray(build.modelCredits)) throw new Error(`${where} : build.glb attendu`);
  const camera = raw.modules.camera;
  if (camera !== undefined && (!isObj(camera) || typeof camera.target !== "string")) throw new Error(`${where} : modules.camera.target attendu`);
  const anim = raw.modules.animations;
  if (
    anim !== undefined &&
    (!isObj(anim) ||
      !isObj(anim.idle) ||
      typeof anim.idle.clip !== "string" ||
      !Array.isArray(anim.actions) ||
      !anim.actions.every((a) => isObj(a) && typeof a.id === "string" && typeof a.clip === "string" && isObj(a.label)))
  ) {
    throw new Error(`${where} : modules.animations (idle.clip, actions[].id, clip, label) attendu`);
  }
  return raw as unknown as BuiltScene;
}

const AUDIO = /\.(mp3|ogg|opus|m4a|aac|wav)$/i;
const IMAGE = /\.(png|jpe?g|webp|gif|svg|avif)$/i;

/**
 * Crédits de l'`InfoModal` (Î12, U-17 à U-19) : modèles (`build.modelCredits`, propriétés `src_*` des nœuds du GLB,
 * doublons retirés), puis assets crédités par la couche éditoriale (`modules.credits.assets`), rangés en sons, images
 * et autres d'après l'extension ; titre, mention légale et année du livre (`book.json`). Chaque ligne porte sa licence.
 */
function toCredits(built: BuiltScene, book: ReaderBook): DioramaCredits {
  const assets = built.modules.credits?.assets ?? [];
  const entry = (a: (typeof assets)[number]): CreditEntry => ({ title: a.title, author: a.author, license: a.license, source: a.source });
  const seen = new Set<string>();
  const models: CreditEntry[] = [];
  for (const c of built.build.modelCredits) {
    const e: CreditEntry = { title: c.name?.trim() || "—", author: c.author?.trim() || undefined, license: c.license?.trim() || undefined, source: c.url?.trim() || undefined };
    const key = JSON.stringify(e);
    if (!c.name && !c.author && !c.license && !c.url) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    models.push(e);
  }
  const nonEmpty = <T,>(list: T[]) => (list.length ? list : undefined);
  return {
    models: nonEmpty(models),
    sounds: nonEmpty(assets.filter((a) => AUDIO.test(a.asset)).map(entry)),
    images: nonEmpty(assets.filter((a) => IMAGE.test(a.asset)).map(entry)),
    other: nonEmpty(assets.filter((a) => !AUDIO.test(a.asset) && !IMAGE.test(a.asset)).map(entry)),
    year: book.legal ? String(book.legal.year) : undefined,
    legal: book.legal?.text,
    project: book.title,
  };
}

/**
 * Mode `buttons` : `idle` et actions dans l'ordre du GLB ; chemins d'icônes et de sons résolus par `at`. Actions combinées
 * (AC2) : `transition`, `cameraPosition` et `events` (sons résolus) recopiés quand ils sont présents (lecture tolérante :
 * un champ absent garde le comportement d'avant).
 */
function toButtons(built: BuiltScene, at: (p: string | undefined) => string | undefined): ButtonsModeConfig | undefined {
  const anim = built.modules.animations;
  if (!anim) return undefined;
  return {
    idle: { clip: anim.idle.clip, loop: anim.idle.loop ?? true },
    actions: anim.actions.map((a) => ({
      id: a.id,
      clip: a.clip,
      loop: a.loop ?? false,
      label: a.label,
      icon: at(a.icon),
      sound: at(a.sound),
      ...(a.transition === "cut" ? { transition: "cut" as const } : {}),
      ...(typeof a.cameraPosition === "string" && a.cameraPosition ? { cameraPosition: a.cameraPosition } : {}),
      ...(Array.isArray(a.events) && a.events.length
        ? { events: a.events.filter((ev) => typeof ev?.id === "string" && Number.isFinite(ev?.time)).map((ev) => ({ id: ev.id, time: ev.time, sound: at(ev.sound) })) }
        : {}),
    })),
  };
}

/**
 * Traduction d'une scène v1 pour le moteur. `base` préfixe les chemins d'assets (relatifs à la racine du livre, D-8.1) :
 * vide dans un livre construit, `dev-book/` en `npm run dev` (voir `bookSource.ts`).
 *
 * Le POI `start` porte le cadrage (`modules.camera`) ; il n'a pas d'élément animé. Sons (Î11) : `ambientSound` de la
 * configuration et `buttons.actions[].sound`, joués en Web Audio (`lib/audioEngine.ts`), pas par l'audio des POI.
 * `modules.animations` devient `buttons` (mode `buttons`, Î10b, `lib/buttonsPlayer.ts`) : joué sur la racine de la
 * scène, pas par la ligne de temps du moteur (module réservé `timeline`) ; `autoplay` est faux, c'est `idle` qui joue.
 */
export function sceneToEngineConfig(built: BuiltScene, book: ReaderBook, base = ""): DioramaConfig3D {
  const at = (p: string | undefined) => (p === undefined ? undefined : `${base}${p}`);
  const cam = built.modules.camera;
  const start: POI = {
    id: START_POI_ID,
    label: built.scene.name,
    emptyName: cam?.target ?? START_POI_ID,
    zoom: cam?.zoom,
    lookAxis: cam?.lookAxis,
    minDistance: cam?.minDistance,
    maxDistance: cam?.maxDistance,
    minPolarAngle: cam?.minPolarAngle,
    maxPolarAngle: cam?.maxPolarAngle,
    minAzimuthAngle: cam?.minAzimuthAngle,
    maxAzimuthAngle: cam?.maxAzimuthAngle,
    enableZoom: cam?.enableZoom,
    elements: [],
  };
  return {
    glb: `${base}${built.build.glb}`,
    name: built.scene.name,
    loaderImage: at(built.scene.loaderImage),
    pois: [start],
    credits: toCredits(built, book),
    autoplay: false,
    buttons: toButtons(built, at),
    ambientSound: at(built.modules.audio?.ambientSound),
  };
}
