// scripts/studio/rules.ts — règles pures du studio (ST1, spec-app-bureau.md §3, §6, §10), testées par scripts/studio/test-studio.ts.
// Aucune lecture de fichier ni processus : protection des requêtes, état des sorties partagées (out/, public/dev-book/),
// découpage des journaux, comparaison de chemins.

/** Marqueur du studio : écrit dans la page (scripts/studio/ui/), cherché par le contrôle de fin de build (scripts/build-book.ts). */
export const STUDIO_MARKER = 'glbi-studio-st1';
/** En-tête exigé sur toute action (`POST`) : une autre origine doit passer par un préflight, que le studio refuse. */
export const ACTION_HEADER = 'x-glbi-studio';

// ---------------------------------------------------------------------------------------------------------
// Protection de la page locale (§10)
// ---------------------------------------------------------------------------------------------------------

/**
 * Requête admise : `Host` = `127.0.0.1:<port>` ou `localhost:<port>` (contre le rebinding DNS) ; `Origin`, s'il est présent,
 * = `http://` suivi de l'un des deux. Une navigation ou un `fetch` `GET` de même origine n'envoie pas d'`Origin`.
 */
export function hostAllowed(host: string | undefined, origin: string | undefined, port: number): boolean {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!host || !hosts.includes(host.toLowerCase())) return false;
  if (origin === undefined) return true;
  return hosts.some((h) => origin.toLowerCase() === `http://${h}`);
}

/**
 * Action admise : `POST`, corps JSON, en-tête du studio, et `Origin` présent et admis (un navigateur l'envoie toujours sur un
 * `POST`). Les outils en ligne de commande (curl) peuvent envoyer les mêmes en-têtes : ils ne sont pas une menace (processus
 * local), le contrôle vise les pages d'autres sites ouvertes dans le navigateur.
 */
export function actionAllowed(h: { method?: string; contentType?: string; studioHeader?: string | string[]; origin?: string; host?: string }, port: number): boolean {
  if (h.method !== 'POST') return false;
  if (!/^application\/json\b/i.test(h.contentType ?? '')) return false;
  if (h.studioHeader !== '1') return false;
  if (h.origin === undefined) return false;
  return hostAllowed(h.host, h.origin, port);
}

// ---------------------------------------------------------------------------------------------------------
// Chemins
// ---------------------------------------------------------------------------------------------------------

/** Même chemin : sans casse sous Windows (système de fichiers insensible), exact ailleurs ; séparateurs indifférents. */
export function samePath(a: string, b: string, win = process.platform === 'win32'): boolean {
  const n = (p: string) => {
    const s = p.replace(/\\/g, '/').replace(/\/+$/, '');
    return win ? s.toLowerCase() : s;
  };
  return n(a) === n(b);
}

/** La ligne de commande `cmd` cite le repo `root` (avec `\` ou `/`, sans casse sous Windows). */
export function commandMentions(cmd: string, root: string, win = process.platform === 'win32'): boolean {
  const variants = [root, root.replace(/\\/g, '/'), root.replace(/\//g, '\\')];
  const hay = win ? cmd.toLowerCase() : cmd;
  return variants.some((v) => hay.includes(win ? v.toLowerCase() : v));
}

// ---------------------------------------------------------------------------------------------------------
// Sorties partagées (§3) : out/ et public/dev-book/, état noté dans .studio/etat.json
// ---------------------------------------------------------------------------------------------------------

export type OutputMode = 'normal' | 'livre de test';

/** Empreinte de `book.json` de la sortie : un build hors du studio la change (origine alors inconnue). */
export interface Stamp {
  size: number;
  mtime: number;
}

export interface OutputRecord {
  bookId: string;
  /** Dossier source (casse réelle). */
  source: string;
  mode: OutputMode;
  /** Début du build (ISO) : un fichier source plus récent rend la sortie périmée. */
  date: string;
  /** `git rev-parse --short HEAD`, `null` si Git est indisponible. */
  commit: string | null;
  /** Arbre de travail non propre au moment du build (`null` : inconnu). */
  modifie: boolean | null;
  stamp: Stamp;
}

export type OutputProblem = 'absent' | 'inconnu' | 'test' | 'autre' | 'perime';

export interface OutputVerdict {
  ok: boolean;
  problem: OutputProblem | null;
  /** Phrase affichée (refus du serveur de test, état de la sortie). */
  message: string;
  record: OutputRecord | null;
}

export const sameStamp = (a: Stamp | null | undefined, b: Stamp | null | undefined): boolean =>
  !!a && !!b && a.size === b.size && Math.abs(a.mtime - b.mtime) < 1;

export function frDate(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * État d'une sortie partagée pour le livre ouvert. `label` : `out/` ou `public/dev-book/`. `actual` : empreinte actuelle de
 * son `book.json` (`null` si absent). `newest` : fichier le plus récent du dossier source (hors `blender/`).
 */
export function outputVerdict(
  label: string,
  record: OutputRecord | null,
  actual: Stamp | null,
  open: { source: string; bookId: string | null } | null,
  newest: { rel: string; mtime: number } | null,
  win = process.platform === 'win32',
): OutputVerdict {
  const no = (problem: OutputProblem, message: string): OutputVerdict => ({ ok: false, problem, message, record });
  if (!actual) return no('absent', `${label} absent (jamais construit, ou build interrompu : book.json retiré)`);
  if (!record || !sameStamp(record.stamp, actual)) {
    return { ok: false, problem: 'inconnu', message: `${label} construit hors du studio ou modifié depuis : origine inconnue`, record: null };
  }
  const built = Date.parse(record.date);
  if (record.mode === 'livre de test') return no('test', `${label} contient le livre de test (suite complète du ${frDate(built)})`);
  if (!open || !samePath(record.source, open.source, win)) {
    return no('autre', `${label} contient le livre « ${record.bookId} » (${record.source}), pas le livre ouvert`);
  }
  if (newest && newest.mtime > built) {
    return no('perime', `${label} périmé : ${newest.rel} modifié le ${frDate(newest.mtime)}, après le build du ${frDate(built)}`);
  }
  return { ok: true, problem: null, message: `${label} : livre « ${record.bookId} », construit le ${frDate(built)}`, record };
}

// ---------------------------------------------------------------------------------------------------------
// Journal : découpage en lignes d'un flux de sortie
// ---------------------------------------------------------------------------------------------------------

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g;

/**
 * Découpe `chunk` en lignes complètes, en gardant la fin incomplète dans `partial`. Couleurs ANSI retirées ; un `\r` seul
 * (ligne de progression réécrite) termine aussi la ligne.
 */
export function splitLines(partial: string, chunk: string): { lines: string[]; partial: string } {
  const parts = (partial + chunk).split(/\r\n|\n|\r/);
  const rest = parts.pop() ?? '';
  return { lines: parts.map((l) => l.replace(ANSI, '')).filter((l) => l.trim() !== ''), partial: rest };
}

/** Nom de fichier de journal : `<nom>-AAAAMMJJ-HHMMSS.log`. */
export function journalFileName(name: string, ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${name}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.log`;
}

/** Journaux à supprimer pour ne garder que les `keep` plus récents de `name` (noms triés par date). */
export function journalsToDelete(files: string[], name: string, keep = 10): string[] {
  const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d{8}-\\d{6}(?:-\\d+)?\\.log$`);
  const mine = files.filter((f) => re.test(f)).sort();
  return mine.slice(0, Math.max(0, mine.length - keep));
}

// ---------------------------------------------------------------------------------------------------------
// Rapport de book:check (`build-book --report`) : résumé par scène
// ---------------------------------------------------------------------------------------------------------

export interface ReportFileLine {
  level: 'error' | 'warning';
  origin: string;
  scene: string | null;
  message: string;
}

export interface CheckSummary {
  ok: boolean;
  errors: number;
  warnings: number;
  perScene: Record<string, { errors: number; warnings: number }>;
  /** Lignes du livre (sans scène), à afficher sous le tableau. */
  bookLines: ReportFileLine[];
  /** Toutes les lignes, dans l'ordre du rapport (ST4 : la page les classe par outil et les reformule, sans les modifier). */
  lines: ReportFileLine[];
}

export function summarizeReport(raw: unknown): CheckSummary | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { lines?: unknown }).lines)) return null;
  const lines = (raw as { lines: ReportFileLine[] }).lines;
  const s: CheckSummary = { ok: !!(raw as { ok?: unknown }).ok, errors: 0, warnings: 0, perScene: {}, bookLines: [], lines: [] };
  for (const l of lines) {
    s.lines.push({ level: l.level, origin: l.origin, scene: l.scene ?? null, message: String(l.message) });
    const err = l.level === 'error';
    if (err) s.errors++;
    else s.warnings++;
    if (l.scene) {
      const e = (s.perScene[l.scene] ??= { errors: 0, warnings: 0 });
      if (err) e.errors++;
      else e.warnings++;
    } else s.bookLines.push(l);
  }
  return s;
}

// ---------------------------------------------------------------------------------------------------------
// Restes d'un studio tué (correctif ST1) : descendants vivants des PID notés dans .studio/pids.json
// ---------------------------------------------------------------------------------------------------------

/** Un processus du système : parent, groupe (hors Windows), création (ms, `null` si inconnue), ligne de commande. */
export interface ProcRow {
  pid: number;
  ppid: number;
  pgid: number | null;
  start: number | null;
  command: string;
  cwd: string | null;
}

/** PID noté par un studio : processus géré, ou le studio lui-même (`nom` = `studio`). */
export interface Recorded {
  pid: number;
  nom: string;
  /** Création du processus noté (ms). */
  debut: number;
}

/** Branche restée en marche : processus de tête (arrêté avec tout son arbre), nombre de processus de la branche. */
export interface Leftover {
  pid: number;
  /** Groupe de processus à arrêter hors Windows (`null` : arbre du PID). */
  group: number | null;
  nom: string;
  command: string;
  start: number | null;
  count: number;
}

/** Marge sur les dates de création (résolution de `ps`, horloges) pour écarter un PID réutilisé par un autre programme. */
const START_SLACK_MS = 3_000;

/**
 * Restes d'un studio précédent : processus vivants qui descendent d'un PID noté (le numéro du parent reste connu sous
 * Windows même après sa mort ; hors Windows, le groupe de processus sert aussi de repère), créés après lui, regroupés en
 * branches. Une branche n'est retenue que si l'un de ses processus cite le repo (ligne de commande ou dossier courant).
 * Le studio courant et ses ascendants sont exclus. Si un studio noté est encore vivant (autre studio sur un autre port),
 * aucun reste n'est proposé : ses processus ne sont pas des restes.
 */
export function findLeftovers(
  procs: ProcRow[],
  recorded: Recorded[],
  root: string,
  selfPid: number,
  win = process.platform === 'win32',
): { leftovers: Leftover[]; liveStudio: number | null } {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  // Le studio courant et ses ascendants (npm, tsx, console) : jamais des restes, même si un PID noté a été réutilisé.
  const self = new Set<number>();
  for (let cur: number | undefined = selfPid, n = 0; cur && !self.has(cur) && n < 64; n++) {
    self.add(cur);
    cur = byPid.get(cur)?.ppid;
  }
  const rec = new Map(recorded.filter((r) => !self.has(r.pid)).map((r) => [r.pid, r]));
  const fresh = (p: ProcRow, r: Recorded) => p.start === null || p.start >= r.debut - START_SLACK_MS;
  const belongs = (p: ProcRow) => commandMentions(p.command, root, win) || (p.cwd !== null && samePath(p.cwd, root, win));

  for (const r of rec.values()) {
    const p = byPid.get(r.pid);
    if (r.nom === 'studio' && p && fresh(p, r) && belongs(p)) return { leftovers: [], liveStudio: r.pid };
  }

  const origin = (p: ProcRow): Recorded | null => {
    const own = rec.get(p.pid);
    if (own && fresh(p, own)) return own;
    const seen = new Set<number>([p.pid]);
    for (let cur = p.ppid, n = 0; cur > 0 && !seen.has(cur) && n < 64; n++) {
      if (self.has(cur)) return null;
      seen.add(cur);
      const r = rec.get(cur);
      if (r && fresh(p, r)) return r;
      const q = byPid.get(cur);
      if (!q) break;
      cur = q.ppid;
    }
    if (!win && p.pgid !== null) {
      const r = rec.get(p.pgid);
      if (r && fresh(p, r)) return r;
    }
    return null;
  };

  const cand = new Map<number, { p: ProcRow; r: Recorded }>();
  for (const p of procs) {
    if (p.pid <= 4 || self.has(p.pid)) continue;
    const r = origin(p);
    if (r) cand.set(p.pid, { p, r });
  }
  const children = new Map<number, number[]>();
  for (const { p } of cand.values()) if (cand.has(p.ppid)) (children.get(p.ppid) ?? children.set(p.ppid, []).get(p.ppid)!).push(p.pid);
  const branch = (pid: number): ProcRow[] => [cand.get(pid)!.p, ...(children.get(pid) ?? []).flatMap(branch)];

  const leftovers: Leftover[] = [];
  for (const { p, r } of cand.values()) {
    if (cand.has(p.ppid)) continue; // pas une tête de branche
    const members = branch(p.pid);
    if (!members.some(belongs)) continue;
    const shown = members.find((m) => commandMentions(m.command, root, win)) ?? p;
    leftovers.push({
      pid: p.pid,
      group: !win && p.pgid !== null && rec.has(p.pgid) ? p.pgid : null,
      nom: r.nom,
      command: shown.command,
      start: p.start,
      count: members.length,
    });
  }
  return { leftovers: leftovers.sort((a, b) => a.pid - b.pid), liveStudio: null };
}
