// scripts/studio/book.ts — livre ouvert dans le studio, tableau des scènes, état des sorties partagées (ST1, spec-app-bureau.md §3).
//
// Le tableau est relu toutes les 2 s par de simples `stat` (présence, date) : seul `book.json` est relu, et seulement quand
// sa taille ou sa date change. L'état de `out/` et de `public/dev-book/` (livre, mode, date, commit) est noté dans
// `.studio/etat.json`, jamais dans `out/` ; une sortie est périmée si un fichier du dossier source (hors `blender/`) est plus
// récent que son build.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { bookSchema, formatIssues, isReservedSourcePath, RESERVED_SOURCE_DIR } from '../../src/schema/glbi';
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
  /** Dernier `book:check` lancé par le studio sur ce livre. */
  check: (CheckSummary & { date: number }) | { date: number; error: string } | null;
}

export class OpenBook {
  info: BookInfo;
  private bookStamp: Stamp | null = null;
  private sceneIds: string[] = [];

  constructor(dir: string, typed: string | null) {
    this.info = { dir, typed, bookId: null, title: null, scenes: [], errors: [], newest: null, check: null };
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
    this.info.newest = newestSourceFile(this.info.dir);
  }

  private readBookJson(file: string): void {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      this.info.errors = [`book.json : JSON illisible (${(e as Error).message})`];
      this.sceneIds = [];
      this.info.bookId = this.info.title = null;
      return;
    }
    const r = bookSchema.safeParse(raw);
    this.info.errors = r.success ? [] : formatIssues(r.error, 'book.json : ');
    // Ce qui est lisible sert au tableau, même si le livre est refusé.
    const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    this.sceneIds = Array.isArray(o.scenes) ? o.scenes.filter((s): s is string => typeof s === 'string') : [];
    this.info.bookId = typeof o.bookId === 'string' ? o.bookId : null;
    const t = o.title && typeof o.title === 'object' ? (o.title as Record<string, unknown>) : {};
    this.info.title = typeof t.fr === 'string' ? t.fr : null;
  }
}

/** Fichier le plus récent d'un dossier source, sans `blender/` ni fichiers cachés (temporaires de l'atelier). */
export function newestSourceFile(dir: string): { rel: string; mtime: number } | null {
  let best: { rel: string; mtime: number } | null = null;
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
  return best;
}

/**
 * Dossier de livre à ouvrir : chemin saisi (relatif au repo admis), ramené à sa casse réelle ; doit contenir `book.json`.
 * Renvoie le chemin réel, ou un message d'erreur.
 */
export function resolveBookDir(input: string, root: string): { dir: string; typed: string | null } | { error: string } {
  const typedRaw = input.trim().replace(/^"(.*)"$/, '$1');
  if (!typedRaw) return { error: 'chemin du livre vide' };
  const typed = path.resolve(root, typedRaw);
  const dir = realCase(typed);
  if (!dir) return { error: `dossier introuvable : ${typed}` };
  if (!fs.statSync(dir).isDirectory()) return { error: `pas un dossier : ${dir}` };
  if (!fs.existsSync(path.join(dir, 'book.json'))) {
    return { error: `${dir} ne contient pas de book.json : choisir le dossier d'un livre (la création d'un livre depuis le studio n'existe pas encore)` };
  }
  return { dir, typed: typed === dir ? null : typed };
}

// ---------------------------------------------------------------------------------------------------------
// État des sorties partagées (.studio/etat.json)
// ---------------------------------------------------------------------------------------------------------

export interface Etat {
  out: OutputRecord | null;
  devBook: OutputRecord | null;
}

export function readEtat(file: string): Etat {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { out: raw?.out ?? null, devBook: raw?.devBook ?? null };
  } catch {
    return { out: null, devBook: null };
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
}

export const DEFAULT_PORTS: Reglages['ports'] = { atelier: 4100, dev: 3000, test: 8001 };
/** Port des tests d'installation (playwright.config.ts) : réservé. */
export const TESTS_PORT = 4173;
export const MAX_RECENTS = 10;

export function readReglages(file: string): Reglages {
  const r: Reglages = { recents: [], ports: { ...DEFAULT_PORTS } };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(raw?.recents)) r.recents = raw.recents.filter((x: unknown): x is string => typeof x === 'string').slice(0, MAX_RECENTS);
    for (const k of ['atelier', 'dev', 'test'] as const) {
      const v = raw?.ports?.[k];
      if (Number.isInteger(v) && v >= 1024 && v <= 65534) r.ports[k] = v;
    }
  } catch {
    // absent ou illisible : valeurs par défaut
  }
  return r;
}

export function writeReglages(file: string, r: Reglages): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(r, null, 2)}\n`);
}
