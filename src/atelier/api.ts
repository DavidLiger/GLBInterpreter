// Types de l'API de l'atelier (`/atelier/__api/`), partagés par le serveur (scripts/atelier/server.ts) et la page
// (src/app/atelier/page.atelier.tsx). Types seulement : aucun code exécuté.
import type { BuiltScene, ModelCredit } from "@/schema/glbi";

/**
 * Marqueur du code de l'atelier : écrit dans la page (attribut de la racine) et cherché par le contrôle de fin de build
 * (scripts/build-book.ts) dans tous les fichiers texte du dossier construit. Constante dupliquée là-bas (le build ne
 * dépend pas de src/atelier/).
 */
export const ATELIER_MARKER = "glbi-atelier-a2";

export type ReportOrigin = "glb" | "edit" | "fusion" | "build";

export interface ReportLine {
  level: "error" | "warning";
  origin: ReportOrigin;
  /** Scène concernée, `null` pour un contrôle du livre. */
  scene: string | null;
  message: string;
}

export interface AtelierScene {
  id: string;
  /** Scène déclarée dans `book.json` (sinon : GLB de `scenes/` ouvert en diagnostic seul). */
  inBook: boolean;
}

/** `GET /atelier/__api/book` */
export interface BookResponse {
  /** Dossier source (chemin absolu, pour l'affichage). */
  source: string;
  /** `book.json` lu (même invalide), `null` s'il est absent ou illisible. */
  book: { bookId?: string; title?: { fr?: string; en?: string; es?: string }; scenes?: string[]; legal?: unknown } | null;
  /** Scènes de `book.json` dans leur ordre, puis GLB de `scenes/` absents de `book.json`. */
  scenes: AtelierScene[];
  /** Fichiers du dossier source par dossier de premier niveau (`images`, `icons`, `sounds`, …). */
  assets: Record<string, string[]>;
  /** Rapport du livre entier, dans l'ordre et avec les textes de `npm run book:check`. */
  report: ReportLine[];
  /** Résumé final de `book:check` (ligne « valide » ou nombre d'erreurs). */
  summary: string;
  /** Compteur de relectures (change à chaque modification du dossier source). */
  generation: number;
  /** Dernière modification du dossier source vue par le serveur depuis son lancement (A3). */
  lastChange: LastChange | null;
}

/** Modification du dossier source : date (ms), fichiers, écriture faite par l'atelier lui-même ou non. */
export interface LastChange {
  at: number;
  files: string[];
  byAtelier: boolean;
}

export interface ClipInfo {
  name: string;
  /** Durée en secondes (plus grand temps des échantillonneurs). */
  duration: number;
  /** Nombre de pistes (canaux glTF). */
  tracks: number;
  /** Nœuds animés distincts. */
  targets: number;
  /** Usage déclaré dans la couche 3D : `idle`, identifiant d'action, ou `null` (non déclaré). */
  declaredAs: string[];
}

export interface SkinInfo {
  name: string;
  joints: number;
  /** Nœuds maillés qui utilisent ce skin. */
  meshes: string[];
}

export interface GlbDiagnostic {
  /** Taille du fichier source, en octets. */
  bytes: number;
  /** Premier nœud racine de la scène glTF : cible caméra du diagnostic seul (scène sans couche 3D utilisable). */
  rootNode: string | null;
  generator: string | null;
  extensions: string[];
  counts: { nodes: number; meshes: number; materials: number; textures: number; lights: number };
  /** Nombre de nœuds nommés `GLBI_ROOT` (1 attendu). */
  glbiRoots: number;
  glbiVersion: unknown;
  /** `glbi_config` présent et lisible comme objet JSON. */
  glbiConfigOk: boolean;
  clips: ClipInfo[];
  skins: SkinInfo[];
  /** Nœuds porteurs d'extras (clés seulement), extras de la scène glTF compris (nœud « (scène) »). */
  extras: { node: string; keys: string[] }[];
  /** Propriétés `src_*` par nœud, avant dédoublonnage. */
  srcCredits: { node: string; credit: ModelCredit }[];
  /** Lecture impossible (Draco, fichier incomplet…) : seul `bytes` est renseigné. */
  error: string | null;
}

/** `GET /atelier/__api/scene/<id>` ; aussi `scene` de l'aperçu (`POST …/preview`), calculé avec la saisie. */
export interface SceneResponse {
  id: string;
  inBook: boolean;
  /** Fichier du GLB relatif au dossier source, et sa date (rechargement du lecteur). */
  glb: string;
  glbMtime: number | null;
  /** Couche 3D brute (`glbi_config` parsé), `null` si absente ou illisible. */
  layer3d: unknown;
  /** `scenes/<id>.edit.json` brut, `null` s'il est absent. */
  edit: unknown;
  /**
   * Objet fusionné `draft` complété de `build` (chemin du GLB, crédits `src_*`), prêt pour le lecteur ; `null` si la couche
   * 3D est inutilisable (scène ouverte en diagnostic seul).
   */
  draft: BuiltScene | null;
  /** Fusion `draft` : orphelins de la couche éditoriale. */
  orphans: string[];
  /** Fusion `draft` : événements édités d'une action du GLB, absents des événements de cette action dans le GLB (AC3). */
  eventOrphans: { action: string; event: string }[];
  /** `edit.json` présent mais refusé par son schéma (ou illisible) : aperçu avec la couche 3D seule. */
  editIgnored: boolean;
  /** Lignes du rapport du livre qui concernent cette scène. */
  report: ReportLine[];
  diagnostic: GlbDiagnostic;
  generation: number;
}

/** Événement SSE `change` de `GET /atelier/__api/events`. */
export interface ChangeEvent {
  /** Fichiers ajoutés, modifiés ou supprimés (relatifs au dossier source). */
  files: string[];
  generation: number;
  /** Écriture de `edit.json` par l'atelier (Enregistrer), pas une modification extérieure. */
  byAtelier: boolean;
}

/**
 * `POST /atelier/__api/scene/<id>/preview` (A3) : corps = couche éditoriale saisie (non enregistrée). Rapport du livre et
 * scène (fusion `draft`) calculés avec cette couche à la place de `scenes/<id>.edit.json`.
 */
export interface PreviewResponse {
  scene: SceneResponse;
  report: ReportLine[];
  summary: string;
}

/** `PUT /atelier/__api/scene/<id>/edit` (A3) : corps = couche éditoriale à écrire. */
export type SaveResponse =
  | { ok: true; unchanged: boolean; generation: number }
  | { ok: false; error: string; messages: string[] };
