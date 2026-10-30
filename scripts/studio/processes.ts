// scripts/studio/processes.ts — lancement et arrêt des processus du studio, journaux, PID notés, interrogation du système
// (ST1, spec-app-bureau.md §6, §10).
//
// - Lancement sans shell : scripts npm par `node <npm-cli.js> --prefix <repo> run <script> -- <args>` (crochets `pre*` compris ;
//   `--prefix` fait partir npm du repo à sa casse réelle et inscrit le chemin du repo dans la ligne de commande, ce qui permet
//   de reconnaître les restes d'un studio tué), programmes Node par `node <fichier> <args>` ; arguments en tableau.
// - Arrêt : Windows `taskkill /PID <pid> /T /F` (arbre) ; ailleurs, processus lancé dans son propre groupe (`detached`),
//   SIGTERM au groupe puis SIGKILL après 5 s. Jamais `pkill -f`, jamais de recherche par nom de commande.
// - PID lancés notés dans `.studio/pids.json` ; au démarrage, un PID encore vivant dont la ligne de commande cite le repo
//   (Windows : `Get-CimInstance Win32_Process`) est proposé à l'arrêt.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { commandMentions, journalFileName, journalsToDelete, samePath, splitLines, type ProcRow } from './rules';

export const IS_WIN = process.platform === 'win32';
/** Lignes gardées en mémoire par journal. */
export const JOURNAL_LINES = 2000;
/** Fichiers gardés par nom dans `.studio/journaux/`. */
export const JOURNAL_FILES = 10;

// ---------------------------------------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------------------------------------

/** Journal d'un processus ou d'une tâche : 2 000 dernières lignes en mémoire, copie dans `.studio/journaux/`. */
export class Journal {
  readonly lines: string[] = [];
  private partial: Record<'out' | 'err', string> = { out: '', err: '' };
  private file: number | null = null;
  /** Lignes ajoutées depuis le dernier envoi à la page (SSE). */
  pending: string[] = [];
  /** Appelé pour chaque ligne ajoutée (détection de « atelier : prêt »). */
  onLine: ((line: string) => void) | null = null;

  constructor(readonly name: string, private readonly dir: string) {}

  /** Nouveau lancement : nouveau fichier (les 10 derniers par nom sont gardés), ligne d'en-tête. */
  start(header: string): void {
    this.close();
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      let file = path.join(this.dir, journalFileName(this.name, Date.now()));
      for (let i = 2; fs.existsSync(file); i++) file = file.replace(/(-\d+)?\.log$/, `-${i}.log`);
      this.file = fs.openSync(file, 'a');
      for (const old of journalsToDelete(fs.readdirSync(this.dir), this.name, JOURNAL_FILES)) {
        fs.rmSync(path.join(this.dir, old), { force: true });
      }
    } catch {
      this.file = null; // journal en mémoire seulement
    }
    this.add([header]);
  }

  /** Sortie d'un processus (morceau quelconque). */
  write(chunk: Buffer | string, stream: 'out' | 'err'): void {
    const r = splitLines(this.partial[stream], chunk.toString());
    this.partial[stream] = r.partial;
    if (r.lines.length) this.add(r.lines);
  }

  /** Ligne du studio lui-même (lancement, arrêt, refus). */
  note(text: string): void {
    this.add([`[studio] ${text}`]);
  }

  /** Fin d'un processus : lignes incomplètes vidées, fichier fermé. */
  end(): void {
    const rest = [this.partial.out, this.partial.err].filter((l) => l.trim());
    this.partial = { out: '', err: '' };
    if (rest.length) this.add(rest);
  }

  close(): void {
    if (this.file !== null) {
      try {
        fs.closeSync(this.file);
      } catch {
        // déjà fermé
      }
      this.file = null;
    }
  }

  private add(lines: string[]): void {
    this.lines.push(...lines);
    if (this.lines.length > JOURNAL_LINES) this.lines.splice(0, this.lines.length - JOURNAL_LINES);
    this.pending.push(...lines);
    if (this.pending.length > JOURNAL_LINES) this.pending.splice(0, this.pending.length - JOURNAL_LINES);
    if (this.onLine) for (const l of lines) this.onLine(l);
    if (this.file !== null) {
      try {
        fs.writeSync(this.file, `${lines.join('\n')}\n`);
      } catch {
        this.close();
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Lancement
// ---------------------------------------------------------------------------------------------------------

/** `npm-cli.js` : celui qui a lancé le studio (`npm run studio`), sinon celui installé avec Node. */
export function npmCli(): string {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.join(path.dirname(path.dirname(process.execPath)), 'lib/node_modules/npm/bin/npm-cli.js'),
  ];
  for (const c of candidates) if (c && /npm-cli\.js$/i.test(c) && fs.existsSync(c)) return c;
  throw new Error('npm-cli.js introuvable : lancer le studio par npm run studio (ou studio.cmd)');
}

/** Environnement des enfants : celui du studio, sans les variables de npm propres au lancement du studio. */
export function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '0', npm_config_update_notifier: 'false' };
  for (const k of Object.keys(env)) {
    // Variables du `npm run studio` (dossier de lancement, à une casse peut-être fausse ; script) : npm les recalcule.
    if (/^(INIT_CWD|npm_lifecycle_.*|npm_package_.*|npm_command|npm_config_local_prefix)$/i.test(k)) delete env[k];
  }
  // Réservée à l'atelier (next dev de l'atelier) : refusée par build-book. Source par défaut de build-book : jamais implicite.
  delete env.ATELIER;
  delete env.BOOK_SOURCE;
  // Annonces de test (AN1) : réservée au build du livre de test de la suite complète (posée par sa seule étape).
  delete env.GLBI_ANNONCES_TEST;
  return env;
}

export interface Launch {
  /** Programme (toujours Node) et arguments, pour l'affichage et `pids.json`. */
  file: string;
  args: string[];
  /** Variables ajoutées à l'environnement des enfants (AN1 : GLBI_ANNONCES_TEST du build du livre de test). */
  env?: Record<string, string>;
}

/** `npm run <script> -- <args>` depuis le repo, sans shell. */
export function npmRun(root: string, script: string, args: string[] = []): Launch {
  return { file: process.execPath, args: [npmCli(), '--prefix', root, 'run', script, ...(args.length ? ['--', ...args] : [])] };
}

/**
 * `npx <paquet> <args>` sans shell (ST3) : `node <npm-cli.js> exec --yes --package=<paquet> -- <commande> <args>` ; `--yes`
 * évite la question d'installation (de toute façon sautée sans terminal). Le dossier de départ est choisi par l'appelant.
 */
export function npmExec(pkg: string, command: string, args: string[] = []): Launch {
  return { file: process.execPath, args: [npmCli(), 'exec', '--yes', `--package=${pkg}`, '--', command, ...args] };
}

/** Ligne de commande affichable (guillemets autour des arguments à espaces). */
export const showCommand = (l: Launch): string =>
  [l.file, ...l.args].map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ');

/** Lance `l` depuis `cwd`, sortie dans `journal`. Ailleurs que sous Windows : propre groupe de processus. */
export function launch(l: Launch, cwd: string, journal: Journal): ChildProcess {
  const child = spawn(l.file, l.args, {
    cwd,
    env: { ...childEnv(), ...l.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: !IS_WIN,
  });
  child.stdout?.on('data', (d: Buffer) => journal.write(d, 'out'));
  child.stderr?.on('data', (d: Buffer) => journal.write(d, 'err'));
  return child;
}

/** Fin d'un processus : code de sortie (`null` : arrêté par un signal). */
export function exited(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve) => {
    child.once('exit', (code) => resolve(code));
    child.once('error', () => resolve(-1));
  });
}

// ---------------------------------------------------------------------------------------------------------
// Arrêt
// ---------------------------------------------------------------------------------------------------------

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Groupe de processus (Linux, macOS) encore vivant. */
function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Arrêt immédiat et synchrone d'un arbre (Windows) ou d'un groupe (ailleurs), par son PID seulement. */
export function killTreeNow(pid: number, signal: NodeJS.Signals = 'SIGKILL'): void {
  if (IS_WIN) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // déjà arrêté
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Arrêt propre de l'arbre (Windows) ou du groupe (ailleurs : SIGTERM, puis SIGKILL après 5 s, y compris aux membres du groupe
 * restés après la fin du premier). Résolu quand tout est arrêté (10 s au plus).
 */
export async function stopTree(pid: number, child?: ChildProcess | null): Promise<void> {
  if (IS_WIN) {
    killTreeNow(pid);
    if (child) await Promise.race([exited(child), sleep(10_000)]);
    return;
  }
  killTreeNow(pid, 'SIGTERM');
  const t0 = Date.now();
  let killed = false;
  while (Date.now() - t0 < 10_000) {
    const alive = groupAlive(pid) || isAlive(pid);
    if (!alive) break;
    if (!killed && Date.now() - t0 >= 5_000) {
      killTreeNow(pid, 'SIGKILL');
      killed = true;
    }
    await sleep(200);
  }
  if (child) await Promise.race([exited(child), sleep(1_000)]);
}

// ---------------------------------------------------------------------------------------------------------
// PID notés (.studio/pids.json)
// ---------------------------------------------------------------------------------------------------------

export interface PidEntry {
  pid: number;
  /** Processus ou tâche du studio (`atelier`, `build`…). */
  nom: string;
  debut: string;
  commande: string;
}

export class PidFile {
  private entries = new Map<number, PidEntry>();

  constructor(private readonly file: string) {}

  /** Entrées laissées par un studio précédent (fichier illisible : aucune). */
  readPrevious(): PidEntry[] {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Array.isArray(raw) ? raw.filter((e) => e && Number.isInteger(e.pid) && e.pid > 0) : [];
    } catch {
      return [];
    }
  }

  add(e: PidEntry): void {
    this.entries.set(e.pid, e);
    this.save();
  }

  remove(pid: number): void {
    if (this.entries.delete(pid)) this.save();
  }

  list(): PidEntry[] {
    return [...this.entries.values()];
  }

  save(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, `${JSON.stringify([...this.entries.values()], null, 2)}\n`);
    } catch {
      // .studio/ non inscriptible : restes non détectables au prochain lancement
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Système : lignes de commande, dossier courant, ports
// ---------------------------------------------------------------------------------------------------------

/** Script PowerShell (encodé, sans guillemets à échapper) ; sortie en UTF-8. */
export function powershell(script: string, timeoutMs = 20_000): Promise<string> {
  const full = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$ProgressPreference = 'SilentlyContinue'\n${script}`;
  const encoded = Buffer.from(full, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    let out = '';
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const timer = setTimeout(() => p.kill(), timeoutMs);
    p.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')));
    p.on('error', () => resolve(''));
    p.on('close', () => {
      clearTimeout(timer);
      resolve(out);
    });
  });
}

/** Ligne de commande et dossier courant (Linux : `/proc` ; Windows : CIM, sans dossier courant) des PID vivants. */
export async function processInfo(pids: number[]): Promise<Map<number, { command: string; cwd: string | null }>> {
  const out = new Map<number, { command: string; cwd: string | null }>();
  const alive = [...new Set(pids)].filter((p) => Number.isInteger(p) && p > 0 && isAlive(p));
  if (!alive.length) return out;
  if (IS_WIN) {
    const filter = alive.map((p) => `ProcessId=${p}`).join(' OR ');
    const text = await powershell(
      `Get-CimInstance Win32_Process -Filter "${filter}" | ForEach-Object { "$($_.ProcessId)\`t$($_.CommandLine)" }`,
    );
    for (const line of text.split(/\r?\n/)) {
      const m = /^(\d+)\t(.*)$/.exec(line);
      if (m) out.set(Number(m[1]), { command: m[2], cwd: null });
    }
    return out;
  }
  for (const pid of alive) {
    let command = '';
    let cwd: string | null = null;
    try {
      command = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' ').trim();
      cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
    } catch {
      const r = spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
      command = (r.stdout ?? '').trim();
    }
    out.set(pid, { command, cwd });
  }
  return out;
}

/**
 * Tous les processus du système, avec leur parent et leur date de création (restes d'un studio tué, correctif ST1).
 * Windows : une requête `Get-CimInstance Win32_Process` (le numéro du parent reste connu après sa mort). Ailleurs :
 * `ps -eo pid,ppid,pgid,etimes,args`, plus le dossier courant (`/proc`) quand il est lisible.
 */
export async function listProcesses(): Promise<ProcRow[]> {
  const rows: ProcRow[] = [];
  if (IS_WIN) {
    const text = await powershell(
      'Get-CimInstance Win32_Process | ForEach-Object { $t = 0; if ($_.CreationDate) { $t = ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() }; ' +
        '"$($_.ProcessId)`t$($_.ParentProcessId)`t$t`t$($_.CommandLine)" }',
      60_000,
    );
    for (const line of text.split(/\r?\n/)) {
      const m = /^(\d+)\t(\d+)\t(\d+)\t(.*)$/.exec(line);
      if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), pgid: null, start: Number(m[3]) || null, command: m[4], cwd: null });
    }
    return rows;
  }
  const r = spawnSync('ps', ['-eo', 'pid=,ppid=,pgid=,etimes=,args='], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const now = Date.now();
  for (const line of (r.stdout ?? '').split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const pid = Number(m[1]);
    let cwd: string | null = null;
    try {
      cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
    } catch {
      // autre utilisateur, ou pas de /proc (macOS)
    }
    rows.push({ pid, ppid: Number(m[2]), pgid: Number(m[3]), start: now - Number(m[4]) * 1000, command: m[5], cwd });
  }
  return rows;
}

/**
 * Processus « du repo » : sa ligne de commande cite le repo, ou (Linux) son dossier courant est le repo (un processus qui
 * change son titre, comme `next-server` ou `http-server`, réécrit sa ligne de commande dans `/proc`).
 */
export const belongsToRepo = (info: { command: string; cwd: string | null }, root: string): boolean =>
  commandMentions(info.command, root) || (info.cwd !== null && samePath(info.cwd, root));

function tryConnect(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    const done = (v: boolean) => {
      s.destroy();
      resolve(v);
    };
    s.setTimeout(500, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

function tryBind(port: number, host: string): Promise<NodeJS.ErrnoException | null> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', (e: NodeJS.ErrnoException) => resolve(e));
    s.listen({ port, host, exclusive: true }, () => s.close(() => resolve(null)));
  });
}

/** Port occupé : quelqu'un y répond (127.0.0.1 ou ::1), ou il ne peut pas être ouvert sur toutes les interfaces. */
export async function portBusy(port: number): Promise<{ busy: boolean; reason: string | null }> {
  if ((await tryConnect(port, '127.0.0.1')) || (await tryConnect(port, '::1'))) return { busy: true, reason: null };
  const e = await tryBind(port, '0.0.0.0');
  if (!e) return { busy: false, reason: null };
  if (e.code === 'EACCES') return { busy: true, reason: 'port réservé par le système (plage exclue de Windows ?)' };
  return { busy: true, reason: null };
}

/** PID qui écoutent sur `port` (Windows : Get-NetTCPConnection ; Linux : ss ; macOS : lsof). Vide si inconnu. */
export async function portOwners(port: number): Promise<number[]> {
  if (IS_WIN) {
    const text = await powershell(
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`,
    );
    return [...new Set(text.split(/\r?\n/).map((l) => Number(l.trim())).filter((n) => Number.isInteger(n) && n > 0))];
  }
  const ss = spawnSync('ss', ['-ltnpH', `sport = :${port}`], { encoding: 'utf8' });
  if (ss.status === 0 && ss.stdout) {
    const pids = [...ss.stdout.matchAll(/pid=(\d+)/g)].map((m) => Number(m[1]));
    if (pids.length) return [...new Set(pids)];
  }
  const lsof = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' });
  return [...new Set((lsof.stdout ?? '').split(/\s+/).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

/** Ouvre une adresse dans le navigateur par défaut (sans shell). */
export function openBrowser(url: string): void {
  const [cmd, args] = IS_WIN
    ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  try {
    const p = spawn(cmd, args as string[], { stdio: 'ignore', detached: true, windowsHide: true });
    p.on('error', () => console.log(`studio : ouvrir ${url} dans le navigateur`));
    p.unref();
  } catch {
    console.log(`studio : ouvrir ${url} dans le navigateur`);
  }
}

/**
 * Dossier ouvert dans l'explorateur du système (CC2, point de clôture de ST4) : Windows `explorer.exe <dossier>` (il confie
 * la fenêtre à l'explorateur déjà lancé et se termine : rien n'est suivi par le studio), macOS `open`, ailleurs `xdg-open`.
 * Argument passé en tableau, sans shell (chemins avec espaces). `explorer.exe` sort avec le code 1 même quand il réussit :
 * seul l'échec du lancement compte.
 */
export function openFolder(dir: string): Promise<{ ok: true } | { error: string }> {
  const [cmd, args] = IS_WIN ? ['explorer.exe', [dir]] : process.platform === 'darwin' ? ['open', [dir]] : ['xdg-open', [dir]];
  return new Promise((resolve) => {
    try {
      const p = spawn(cmd, args as string[], { stdio: 'ignore', detached: true, windowsHide: false });
      // Commande absente (MJ3, point de CC2 : `xdg-open` manque sur un Linux sans bureau) : dit en clair.
      p.once('error', (e) => resolve({ error: (e as NodeJS.ErrnoException).code === 'ENOENT' ? `${cmd} introuvable` : e.message }));
      p.once('spawn', () => {
        if (IS_WIN) {
          p.unref();
          return resolve({ ok: true });
        }
        // `open` et `xdg-open` sortent en échec quand aucune application ne peut ouvrir le dossier : attendus 1,5 s au plus.
        const t = setTimeout(() => {
          p.unref();
          resolve({ ok: true });
        }, 1500);
        p.once('exit', (code) => {
          clearTimeout(t);
          resolve(code === 0 || code === null ? { ok: true } : { error: `${cmd} a échoué (code ${code}) : aucune application pour ouvrir un dossier ?` });
        });
      });
    } catch (e) {
      resolve({ error: (e as Error).message });
    }
  });
}

// ---------------------------------------------------------------------------------------------------------
// Blender (ST2, §8) : processus indépendant
// ---------------------------------------------------------------------------------------------------------

const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * Lance `exe` sur `file`, **indépendant du studio** : ni géré, ni noté dans `.studio/pids.json`, ni arrêté par « Tout
 * arrêter et quitter », sortie hors journal (Blender garde le travail non enregistré).
 * - Windows : `Start-Process` de PowerShell (comme un double-clic : sa propre console, hors de l'arbre et de la console du
 *   studio ; son parent, PowerShell, se termine aussitôt, donc il n'est jamais proposé comme reste d'un studio tué) ;
 * - ailleurs : processus détaché dans son propre groupe, rattaché au système à la fin du studio.
 * Renvoie le PID de Blender (`null` s'il est inconnu) ou un message d'échec.
 */
export async function launchIndependent(exe: string, file: string, cwd: string): Promise<{ pid: number | null } | { error: string }> {
  if (IS_WIN) {
    const script = [
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      'try {',
      `  $p = Start-Process -FilePath ${psQuote(exe)} -ArgumentList ${psQuote(`"${file}"`)} -WorkingDirectory ${psQuote(cwd)} -PassThru -ErrorAction Stop`,
      '  "PID $($p.Id)"',
      '} catch { "ERREUR $($_.Exception.Message)" }',
    ].join('\n');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    // Réponse lue dès la première ligne : Blender peut hériter de la sortie de PowerShell et la garder ouverte (la fin du
    // flux n'est donc pas attendue).
    return new Promise((resolve) => {
      let out = '';
      let done = false;
      const finish = (r: { pid: number | null } | { error: string }) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        p.stdout.destroy();
        resolve(r);
      };
      const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      });
      const timer = setTimeout(() => finish({ error: 'lancement de Blender sans réponse de PowerShell (30 s)' }), 30_000);
      p.stdout.on('data', (d: Buffer) => {
        out += d.toString('utf8');
        const pid = /^PID (\d+)/m.exec(out);
        if (pid) return finish({ pid: Number(pid[1]) });
        const err = /^ERREUR (.*)\r?\n/m.exec(out);
        if (err) finish({ error: err[1].trim() });
      });
      p.on('error', (e) => finish({ error: e.message }));
      p.on('exit', () => setTimeout(() => {
        const err = /^ERREUR (.*)$/m.exec(out);
        finish(err ? { error: err[1].trim() } : { error: 'lancement de Blender : PowerShell terminé sans réponse' });
      }, 200));
    });
  }
  return new Promise((resolve) => {
    try {
      const p = spawn(exe, [file], { cwd, stdio: 'ignore', detached: true });
      p.once('error', (e) => resolve({ error: e.message }));
      p.once('spawn', () => {
        p.unref();
        resolve({ pid: p.pid ?? null });
      });
    } catch (e) {
      resolve({ error: (e as Error).message });
    }
  });
}
