// scripts/studio/book.ts — livre ouvert dans le studio, tableau des scènes, état des sorties partagées (ST1, spec-app-bureau.md §3).
//
// Le tableau est relu toutes les 2 s par de simples `stat` (présence, date) : seul `book.json` est relu, et seulement quand
// sa taille ou sa date change. L'état de `out/` et de `public/dev-book/` (livre, mode, date, commit) est noté dans
// `.studio/etat.json`, jamais dans `out/` ; une sortie est périmée si un fichier du dossier source (hors `blender/`) est plus
// récent que son build.
// ST2 : `book.json` lu pour le formulaire (champs lisibles, empreinte de lecture), écriture par fichier temporaire du même
// dossier puis renommage, copie du gabarit de scène sans écraser, réglages de Blender (§4, §8).
// ST3 : dernière publication d'essai par livre (`.studio/etat.json`), projet Cloudflare Pages des essais (`.studio/reglages.json`).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { bookSchema, formatIssues, IMAGE_EXTENSIONS, isReservedSourcePath, RESERVED_SOURCE_DIR } from '../../src/schema/glbi';
import { pickBlenderDir, readableBook, type ReadableBook } from './bookjson';
import { DEFAULT_PROJECT, projectNameError } from './essai';
import type { CheckSummary, OutputMode, OutputRecord, Stamp } from './rules';

export const posix = (p: string) => p.split(path.sep).join('/');

export function stampOf(file: string): Stamp | null {
  try {
    const st = fs.statSync(file);
    return st.isFile() ? { size: st.size, mtime: st.mtimeMs } : null;
  } catch {
    return null;
  }
}

/** Chemin à sa casse réelle (Windows : celle du disque, `fs.realpathSync.native`), `null` s'il n'existe pas. */
export function realCase(p: string): string | null {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Livre ouvert
// ---------------------------------------------------------------------------------------------------------

export interface FileCell {
  present: boolean;
  mtime: number | null;
}

export interface SceneRow {
  id: string;
  glb: FileCell;
  edit: FileCell;
  /** `blender/<id>.blend` (DP-2). */
  blend: FileCell;
  /** Dernier `book:check` du livre ouvert : erreurs et avertissements de la scène (`null` : pas encore lancé). */
  check: { errors: number; warnings: number } | null;
}

export interface BookInfo {
  /** Dossier source, casse réelle. */
  dir: string;
  /** Chemin saisi, s'il différait de la casse réelle. */
  typed: string | null;
  bookId: string | null;
  title: string | null;
  scenes: SceneRow[];
  /** `book.json` illisible ou refusé par `bookSchema` (messages de `formatIssues`). */
  errors: string[];
  /** Fichier le plus récent du dossier source (hors `blender/` et fichiers cachés) : base du « périmé ». */
  newest: { rel: string; mtime: number } | null;
  /**
   * Dernier `book:check` lancé par le studio sur ce livre. `interrupted` (MJ3) : une vérification suivante s'est arrêtée sans
   * rapport, le résultat affiché est le précédent.
   */
  check: (CheckSummary & { date: number; interrupted?: { date: number; message: string } }) | { date: number; error: string } | null;
  /** `book.json` pour le formulaire (ST2) : empreinte de la lecture, champs lisibles, validité. */
  file: BookFileInfo;
  /** Images du dossier source (hors `blender/` et fichiers cachés), pour le menu `ogImage`. */
  images: string[];
  /** `icon.png` présent (icône du livre, obligatoire : erreur de `book:check` sinon). */
  icon: boolean;
  /** `.blend` du mini-jeu (MJ3) : `blender/jeu/*.blend` (DP-14), triés par nom. */
  jeuBlends: { name: string; mtime: number }[];
}

export interface BookFileInfo {
  /** Empreinte (taille, date) du `book.json` lu ; `null` s'il est absent. */
  stamp: Stamp | null;
  /** JSON analysable. */
  readable: boolean;
  /** Accepté par `bookSchema`. */
  valid: boolean;
  /** Champs lisibles (formulaire prérempli), `unlockThreshold` conservé, `bookId` du disque. */
  content: ReadableBook;
}

export class OpenBook {
  info: BookInfo;
  private bookStamp: Stamp | null = null;
  private sceneIds: string[] = [];

  constructor(dir: string, typed: string | null) {
    this.info = {
      dir, typed, bookId: null, title: null, scenes: [], errors: [], newest: null, check: null, images: [], icon: false, jeuBlends: [],
      file: { stamp: null, readable: false, valid: false, content: readableBook(undefined, new Date().getFullYear()) },
    };
    this.refresh();
  }

  /** Relecture légère (toutes les 2 s) : `book.json` si changé, `stat` des fichiers des scènes, fichier le plus récent. */
  refresh(): void {
    const bookFile = path.join(this.info.dir, 'book.json');
    const st = stampOf(bookFile);
    if (!st) {
      this.bookStamp = null;
      this.sceneIds = [];
      this.info.errors = ['book.json absent du dossier'];
      this.info.bookId = this.info.title = null;
      this.info.file = { stamp: null, readable: false, valid: false, content: readableBook(undefined, new Date().getFullYear()) };
    } else if (!this.bookStamp || st.size !== this.bookStamp.size || st.mtime !== this.bookStamp.mtime) {
      this.bookStamp = st;
      this.readBookJson(bookFile);
    }
    const stat = (rel: string): FileCell => {
      const s = stampOf(path.join(this.info.dir, rel));
      return { present: !!s, mtime: s?.mtime ?? null };
    };
    const per = this.info.check && 'perScene' in this.info.check ? this.info.check.perScene : null;
    this.info.scenes = this.sceneIds.map((id) => ({
      id,
      glb: stat(`scenes/${id}.glb`),
      edit: stat(`scenes/${id}.edit.json`),
      blend: stat(`${RESERVED_SOURCE_DIR}/${id}.blend`),
      check: per ? (per[id] ?? { errors: 0, warnings: 0 }) : null,
    }));
    const walk = walkSource(this.info.dir);
    this.info.newest = walk.newest;
    this.info.images = walk.images;
    this.info.icon = !!stampOf(path.join(this.info.dir, 'icon.png'));
    this.info.jeuBlends = jeuBlends(this.info.dir);
  }

  /** Relecture immédiate de `book.json` (après une écriture du studio), puis du tableau. */
  reload(): void {
    this.bookStamp = null;
    this.refresh();
  }

  private readBookJson(file: string): void {
    let raw: unknown;
    const year = new Date().getFullYear();
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      this.info.errors = [`book.json : JSON illisible (${(e as Error).message})`];
      this.sceneIds = [];
      this.info.bookId = this.info.title = null;
      this.info.file = { stamp: this.bookStamp, readable: false, valid: false, content: readableBook(undefined, year) };
      return;
    }
    const r = bookSchema.safeParse(raw);
    this.info.errors = r.success ? [] : formatIssues(r.error, 'book.json : ');
    this.info.file = { stamp: this.bookStamp, readable: true, valid: r.success, content: readableBook(raw, year) };
    // Ce qui est lisible sert au tableau, même si le livre est refusé.
    const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    this.sceneIds = Array.isArray(o.scenes) ? o.scenes.filter((s): s is string => typeof s === 'string') : [];
    this.info.bookId = typeof o.bookId === 'string' ? o.bookId : null;
    const t = o.title && typeof o.title === 'object' ? (o.title as Record<string, unknown>) : {};
    this.info.title = typeof t.fr === 'string' ? t.fr : null;
  }
}

/** Dossier des `.blend` du mini-jeu (DP-14, spec-mini-jeu.md §5), dans le dossier réservé. */
export const JEU_BLEND_DIR = path.join(RESERVED_SOURCE_DIR, 'jeu');
/** Nom d'un `.blend` du mini-jeu ouvrable par le studio (un fichier de `blender/jeu/`, sans chemin). */
export const JEU_BLEND_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*\.blend$/;

/** `.blend` de `blender/jeu/` (MJ3) : nom et date, triés ; dossier absent : aucun. Les sauvegardes `.blend1` sont ignorées. */
export function jeuBlends(dir: string): { name: string; mtime: number }[] {
  let names: string[];
  try {
    names = fs.readdirSync(path.join(dir, JEU_BLEND_DIR));
  } catch {
    return [];
  }
  return names
    .filter((n) => JEU_BLEND_NAME.test(n))
    .sort()
    .flatMap((name) => {
      const st = stampOf(path.join(dir, JEU_BLEND_DIR, name));
      return st ? [{ name, mtime: st.mtime }] : [];
    });
}

/** Fichier le plus récent d'un dossier source, sans `blender/` ni fichiers cachés (temporaires de l'atelier). */
export function newestSourceFile(dir: string): { rel: string; mtime: number } | null {
  return walkSource(dir).newest;
}

/**
 * Parcours du dossier source, sans `blender/` ni fichiers cachés : fichier le plus récent (base du « périmé ») et images
 * (menu `ogImage` du formulaire, ST2), triées.
 */
export function walkSource(dir: string): { newest: { rel: string; mtime: number } | null; images: string[] } {
  let best: { rel: string; mtime: number } | null = null;
  const images: string[] = [];
  const imageRe = new RegExp(`\\.(${IMAGE_EXTENSIONS.join('|')})$`, 'i');
  const walk = (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(d, e.name);
      const rel = posix(path.relative(dir, full));
      if (isReservedSourcePath(rel)) continue;
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) {
        if (imageRe.test(e.name)) images.push(rel);
        try {
          const m = fs.statSync(full).mtimeMs;
          if (!best || m > best.mtime) best = { rel, mtime: m };
        } catch {
          // supprimé entre-temps
        }
      }
    }
  };
  walk(dir);
  return { newest: best, images: images.sort() };
}

/**
 * Dossier de livre à ouvrir : chemin saisi (relatif au repo admis), ramené à sa casse réelle ; doit contenir `book.json`.
 * Renvoie le chemin réel, ou un message d'erreur.
 */
export function resolveBookDir(
  input: string,
  root: string,
): { dir: string; typed: string | null } | { error: string; createHere?: { parent: string; name: string } } {
  const typedRaw = input.trim().replace(/^"(.*)"$/, '$1');
  if (!typedRaw) return { error: 'chemin du livre vide' };
  const typed = path.resolve(root, typedRaw);
  const dir = realCase(typed);
  if (!dir) return { error: `dossier introuvable : ${typed}` };
  if (!fs.statSync(dir).isDirectory()) return { error: `pas un dossier : ${dir}` };
  if (!fs.existsSync(path.join(dir, 'book.json'))) {
    return { error: `${dir} ne contient pas de book.json : choisir le dossier d'un livre, ou « Créer un livre ici »`, createHere: { parent: path.dirname(dir), name: path.basename(dir) } };
  }
  return { dir, typed: typed === dir ? null : typed };
}

// ---------------------------------------------------------------------------------------------------------
// État des sorties partagées (.studio/etat.json)
// ---------------------------------------------------------------------------------------------------------

/** Publication d'essai (ST3, §9) : dernière publication réussie d'un livre. */
export interface Publication {
  projet: string;
  /** Adresse stable du projet (`https://<projet>.pages.dev`), codée dans les QR d'essai. */
  adresse: string;
  /** Adresse propre au déploiement annoncée par wrangler (`null` si non lue). */
  deploiement: string | null;
  /** Fin de la publication (ISO). */
  date: string;
  /** Début du build publié (ISO, `OutputRecord.date` de out/). */
  build: string;
  source: string;
  commit: string | null;
  /** Scènes publiées (`out/book.json`), dans l'ordre du livre : un QR d'essai par scène. */
  scenes: string[];
}

export interface Etat {
  out: OutputRecord | null;
  devBook: OutputRecord | null;
  /** Dernière publication d'essai par `bookId` (ST3). */
  publications: Record<string, Publication>;
}

export function readEtat(file: string): Etat {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const pubs = raw?.publications && typeof raw.publications === 'object' && !Array.isArray(raw.publications) ? raw.publications : {};
    return { out: raw?.out ?? null, devBook: raw?.devBook ?? null, publications: pubs };
  } catch {
    return { out: null, devBook: null, publications: {} };
  }
}

export function writeEtat(file: string, etat: Etat): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(etat, null, 2)}\n`);
}

/** Commit du repo (`git rev-parse --short HEAD`) et arbre non propre (`git status --porcelain`) ; `null` sans Git. */
export function gitState(root: string): { commit: string | null; modifie: boolean | null } {
  const run = (args: string[]) => spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 15_000 });
  const head = run(['rev-parse', '--short', 'HEAD']);
  if (head.status !== 0) return { commit: null, modifie: null };
  const status = run(['status', '--porcelain']);
  return { commit: head.stdout.trim(), modifie: status.status === 0 ? status.stdout.trim() !== '' : null };
}

/** État d'une sortie construite à l'instant (`book.json` de la sortie lu pour le `bookId` et l'empreinte). */
export function recordOutput(outBookJson: string, source: string, mode: OutputMode, startedAt: number, git: ReturnType<typeof gitState>): OutputRecord | null {
  const stamp = stampOf(outBookJson);
  if (!stamp) return null;
  let bookId = '?';
  try {
    const b = JSON.parse(fs.readFileSync(outBookJson, 'utf8'));
    if (typeof b?.bookId === 'string') bookId = b.bookId;
  } catch {
    // illisible : bookId inconnu
  }
  return { bookId, source, mode, date: new Date(startedAt).toISOString(), commit: git.commit, modifie: git.modifie, stamp };
}

// ---------------------------------------------------------------------------------------------------------
// Réglages (.studio/reglages.json)
// ---------------------------------------------------------------------------------------------------------

export interface Reglages {
  recents: string[];
  ports: { atelier: number; dev: number; test: number };
  /** Blender (ST2, §8) : `blender.exe` (détecté au premier lancement, modifiable) et gabarit de scène facultatif. */
  blender: { exe: string | null; gabarit: string | null; detecte: boolean };
  /** Publication d'essai (ST3, §9) : projet Cloudflare Pages, `glbi-essai` par défaut. */
  essai: { projet: string };
  /** Dernière suite complète menée à son terme par le studio (MJ3, point de CC3) : durée (ms) et date (ms) ; `null` : jamais. */
  suite: { dureeMs: number; date: number } | null;
}

export const DEFAULT_PORTS: Reglages['ports'] = { atelier: 4100, dev: 3000, test: 8001 };
/** Port des tests d'installation (playwright.config.ts) : réservé. */
export const TESTS_PORT = 4173;
/** Flux d'annonces de test servi pendant la suite complète (AN1, `tests/static-server.ts --annonces`). */
export const ANNONCES_TESTS_PORT = 4175;
export const MAX_RECENTS = 10;

export function readReglages(file: string): Reglages {
  const r: Reglages = {
    recents: [], ports: { ...DEFAULT_PORTS }, blender: { exe: null, gabarit: null, detecte: false }, essai: { projet: DEFAULT_PROJECT }, suite: null,
  };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(raw?.recents)) r.recents = raw.recents.filter((x: unknown): x is string => typeof x === 'string').slice(0, MAX_RECENTS);
    for (const k of ['atelier', 'dev', 'test'] as const) {
      const v = raw?.ports?.[k];
      if (Number.isInteger(v) && v >= 1024 && v <= 65534) r.ports[k] = v;
    }
    const b = raw?.blender;
    if (typeof b?.exe === 'string' && b.exe) r.blender.exe = b.exe;
    if (typeof b?.gabarit === 'string' && b.gabarit) r.blender.gabarit = b.gabarit;
    r.blender.detecte = b?.detecte === true;
    const projet = raw?.essai?.projet;
    if (typeof projet === 'string' && !projectNameError(projet)) r.essai.projet = projet;
    const su = raw?.suite;
    if (Number.isFinite(su?.dureeMs) && su.dureeMs > 0 && Number.isFinite(su?.date)) r.suite = { dureeMs: su.dureeMs, date: su.date };
  } catch {
    // absent ou illisible : valeurs par défaut
  }
  return r;
}

export function writeReglages(file: string, r: Reglages): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(r, null, 2)}\n`);
}

// ---------------------------------------------------------------------------------------------------------
// Écriture de book.json, gabarit de scène, Blender (ST2)
// ---------------------------------------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Écriture par fichier temporaire du même dossier (`.<nom>.<pid>.tmp`, caché : ignoré par le « périmé » et la scrutation),
 * puis renommage ; 5 essais sous Windows (renommage refusé un instant si le fichier est ouvert ailleurs), comme l'atelier.
 */
export async function writeFileAtomic(target: string, text: string): Promise<void> {
  const tmp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, text, 'utf8');
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(tmp, target);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (attempt >= 5 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) {
        fs.rmSync(tmp, { force: true });
        throw e;
      }
      await sleep(100 * attempt);
    }
  }
}

/**
 * Copie du gabarit en `blender/<id>.blend`, **seulement si le fichier n'existe pas** (DP-2 : le studio le crée une fois,
 * ne l'écrase jamais ; copie exclusive, sans fenêtre entre le test et l'écriture). Message pour le journal et la page.
 */
export function copyTemplate(dir: string, id: string, gabarit: string): { copied: boolean; message: string } {
  const rel = `${RESERVED_SOURCE_DIR}/${id}.blend`;
  const target = path.join(dir, RESERVED_SOURCE_DIR, `${id}.blend`);
  if (fs.existsSync(target)) return { copied: false, message: `${rel} existe déjà : non remplacé` };
  if (!stampOf(gabarit)) return { copied: false, message: `gabarit introuvable (${gabarit}) : ${rel} non créé` };
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(gabarit, target, fs.constants.COPYFILE_EXCL);
    return { copied: true, message: `${rel} créé depuis le gabarit` };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return { copied: false, message: code === 'EEXIST' ? `${rel} existe déjà : non remplacé` : `${rel} non créé (${(e as Error).message})` };
  }
}

/** `blender.exe` de la version la plus récente sous `C:\Program Files\Blender Foundation\` (`Blender <version>`) ; `null` sinon. */
export function detectBlender(): string | null {
  if (process.platform !== 'win32') return null;
  const bases = [process.env.ProgramFiles, process.env.ProgramW6432, 'C:\\Program Files'].filter((x): x is string => !!x);
  for (const base of [...new Set(bases)]) {
    const foundation = path.join(base, 'Blender Foundation');
    let names: string[];
    try {
      names = fs.readdirSync(foundation);
    } catch {
      continue;
    }
    const withExe = names.filter((n) => stampOf(path.join(foundation, n, 'blender.exe')));
    const best = pickBlenderDir(withExe);
    if (best) return path.join(foundation, best, 'blender.exe');
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Explorateur de la page (« Parcourir… », correctif ST2 du 20/10) : lecture seule du disque
// ---------------------------------------------------------------------------------------------------------

/** Ce que l'explorateur choisit : dossier d'un livre, dossier parent d'un nouveau livre, `blender.exe`, gabarit `.blend`. */
export type BrowseKind = 'livre' | 'parent' | 'blender' | 'gabarit';

export interface DirListing {
  /** Dossier listé (casse réelle). */
  chemin: string;
  parent: string | null;
  dossiers: { nom: string; livre: boolean }[];
  /** Fichiers que ce choix accepte (`.exe` pour Blender, `.blend` pour le gabarit) ; aucun pour un dossier. */
  fichiers: string[];
  /** Entrées non affichées (au-delà de la limite). */
  coupe: number;
}

const LIST_LIMIT = 2000;

/** Contenu d'un dossier pour l'explorateur : dossiers (ceux qui contiennent book.json marqués), fichiers acceptés ; sans fichiers cachés. */
export function listDir(dir: string, kind: BrowseKind): DirListing | { error: string } {
  const real = realCase(dir);
  if (!real) return { error: `dossier introuvable : ${dir}` };
  let entries: fs.Dirent[];
  try {
    if (!fs.statSync(real).isDirectory()) return { error: `pas un dossier : ${real}` };
    entries = fs.readdirSync(real, { withFileTypes: true });
  } catch (e) {
    return { error: `${real} : lecture impossible (${(e as NodeJS.ErrnoException).code ?? (e as Error).message})` };
  }
  const fileRe = kind === 'blender' ? /\.exe$/i : kind === 'gabarit' ? /\.blend$/i : null;
  const byName = (a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true });
  const dossiers: DirListing['dossiers'] = [];
  const fichiers: string[] = [];
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('$')) continue;
    let isDir = e.isDirectory();
    if (e.isSymbolicLink()) {
      try {
        isDir = fs.statSync(path.join(real, e.name)).isDirectory();
      } catch {
        continue;
      }
    }
    if (isDir) dossiers.push({ nom: e.name, livre: false });
    else if (fileRe?.test(e.name)) fichiers.push(e.name);
  }
  dossiers.sort((a, b) => byName(a.nom, b.nom));
  fichiers.sort(byName);
  const total = dossiers.length + fichiers.length;
  const shownDirs = dossiers.slice(0, LIST_LIMIT);
  const shownFiles = fichiers.slice(0, Math.max(0, LIST_LIMIT - shownDirs.length));
  for (const d of shownDirs.slice(0, 500)) d.livre = !!stampOf(path.join(real, d.nom, 'book.json'));
  const up = path.dirname(real);
  return { chemin: real, parent: up === real ? null : up, dossiers: shownDirs, fichiers: shownFiles, coupe: total - shownDirs.length - shownFiles.length };
}

/** Lecteurs présents (Windows : `C:\`, `D:\`…) ; ailleurs, la racine. */
export function drives(): string[] {
  if (process.platform !== 'win32') return ['/'];
  const out: string[] = [];
  for (let c = 65; c <= 90; c++) {
    const d = `${String.fromCharCode(c)}:\\`;
    try {
      fs.accessSync(d);
      out.push(d);
    } catch {
      // absent
    }
  }
  return out;
}
