// scripts/studio/server.ts — studio de fabrication d'un livre, socle (ST1, spec-app-bureau.md §2, §3, §6, §7, §10).
//
//   npm run studio [-- --port 4000] [-- --no-open]          (ou double-clic sur studio.cmd à la racine du repo)
//
// Page locale http://127.0.0.1:<port>/ (scripts/studio/ui/, HTML, CSS et JS sans framework), servie par ce serveur, qui est
// le parent de tous les processus gérés :
//   processus   atelier (`npm run atelier -- --source <livre> --no-open`), lecteur de développement (`dev:book` puis
//               `npm run dev -- -p <port>`), serveur de test du livre exporté (`http-server out -p <port> -c-1`) ;
//   tâches      book:check, dev:book, build du livre, test:engine, test:schema, suite complète (livre de test, build
//               `--part-mib 1`, test:install).
// Un seul livre ouvert à la fois. Une seule tâche à la fois parmi celles qui écrivent out/, .next/ ou public/dev-book/ (build,
// suite, dev:book) ; avant un build ou la suite, le serveur de test et `dev` sont arrêtés. État des sorties dans
// .studio/etat.json : le serveur de test refuse un out/ d'un autre livre, du livre de test, construit hors du studio ou périmé.
//
// Protection : écoute sur 127.0.0.1 seulement ; `Host` et `Origin` contrôlés sur toute requête (403 sinon) ; toute action
// passe par un `POST` JSON portant l'en-tête `x-glbi-studio: 1` (une autre origine devrait passer par un préflight, refusé).
// Chemins : repo et livre ramenés à leur casse réelle (`fs.realpathSync.native`) ; toutes les commandes partent de là.
// Fichiers du studio : .studio/ (etat.json, pids.json, reglages.json, journaux/, book-check.json), ignoré par Git.
// Aucun fichier de src/ n'importe ce dossier ; le contrôle de fin de build cherche le marqueur `glbi-studio-st1` dans out/.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';
import {
  DEFAULT_PORTS,
  gitState,
  MAX_RECENTS,
  OpenBook,
  readEtat,
  readReglages,
  realCase,
  recordOutput,
  resolveBookDir,
  stampOf,
  TESTS_PORT,
  writeEtat,
  writeReglages,
  type Etat,
  type Reglages,
} from './book';
import {
  belongsToRepo,
  exited,
  IS_WIN,
  isAlive,
  Journal,
  killTreeNow,
  launch,
  npmRun,
  openBrowser,
  PidFile,
  portBusy,
  portOwners,
  powershell,
  processInfo,
  showCommand,
  stopTree,
  listProcesses,
  type Launch,
} from './processes';
import {
  ACTION_HEADER,
  actionAllowed,
  findLeftovers,
  frDate,
  hostAllowed,
  outputVerdict,
  samePath,
  STUDIO_MARKER,
  summarizeReport,
  type Leftover,
  type OutputVerdict,
} from './rules';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4000;
const SCAN_MS = 2_000;
const TAB_WAIT_MS = 3_000;
const SSE_RETRY_MS = 1_000;
const MAX_BODY = 64 * 1024;

// ---------------------------------------------------------------------------------------------------------
// Chemins (casse réelle, §10)
// ---------------------------------------------------------------------------------------------------------

const ROOT_TYPED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT = realCase(ROOT_TYPED) ?? ROOT_TYPED;
const CWD_TYPED = process.cwd();
const CWD_REAL = realCase(CWD_TYPED) ?? CWD_TYPED;
const STUDIO_DIR = path.join(ROOT, '.studio');
const ETAT_FILE = path.join(STUDIO_DIR, 'etat.json');
const REGLAGES_FILE = path.join(STUDIO_DIR, 'reglages.json');
const JOURNAUX = path.join(STUDIO_DIR, 'journaux');
const CHECK_REPORT = path.join(STUDIO_DIR, 'book-check.json');
const UI_DIR = path.join(ROOT, 'scripts', 'studio', 'ui');
const OUT_BOOK = path.join(ROOT, 'out', 'book.json');
const DEV_BOOK = path.join(ROOT, 'public', 'dev-book', 'book.json');
const HTTP_SERVER_BIN = path.join(ROOT, 'node_modules', 'http-server', 'bin', 'http-server');

/** Écart entre le dossier de lancement (ou le chemin du script) et la casse réelle du repo (incident d'Î16). */
const CASE_WARNING =
  CWD_TYPED !== CWD_REAL || ROOT_TYPED !== ROOT
    ? `Studio lancé depuis « ${CWD_TYPED} » ; casse réelle du repo : « ${ROOT} ». Toutes les commandes partent de la casse réelle.`
    : null;

// ---------------------------------------------------------------------------------------------------------
// Processus et tâches
// ---------------------------------------------------------------------------------------------------------

type ProcessName = 'atelier' | 'dev' | 'serveur-test';
type TaskName = 'book-check' | 'dev-book' | 'build' | 'test-engine' | 'test-schema' | 'suite';
type Name = ProcessName | TaskName;
type State = 'arrêté' | 'démarrage' | 'prêt' | 'en cours' | 'terminé' | 'erreur';

interface Entry {
  name: Name;
  label: string;
  kind: 'process' | 'task';
  /** Écrit out/, .next/ ou public/dev-book/ : une seule de ces tâches à la fois. */
  exclusive: boolean;
  state: State;
  code: number | null;
  startedAt: number | null;
  endedAt: number | null;
  detail: string | null;
  child: ChildProcess | null;
  stopping: boolean;
  journal: Journal;
  port: number | null;
}

const JOURNAL_LABELS: Record<Name | 'studio', string> = {
  studio: 'Studio',
  atelier: 'Atelier',
  dev: 'Lecteur de développement',
  'serveur-test': 'Serveur de test',
  'book-check': 'book:check',
  'dev-book': 'dev:book',
  build: 'Build du livre',
  'test-engine': 'test:engine',
  'test-schema': 'test:schema',
  suite: 'Suite complète',
};

function entry(name: Name, kind: Entry['kind'], exclusive = false): Entry {
  return {
    name, label: JOURNAL_LABELS[name], kind, exclusive, state: 'arrêté', code: null, startedAt: null, endedAt: null,
    detail: null, child: null, stopping: false, journal: new Journal(name, JOURNAUX), port: null,
  };
}

const entries: Record<Name, Entry> = {
  atelier: entry('atelier', 'process'),
  dev: entry('dev', 'process'),
  'serveur-test': entry('serveur-test', 'process'),
  'book-check': entry('book-check', 'task'),
  'dev-book': entry('dev-book', 'task', true),
  build: entry('build', 'task', true),
  'test-engine': entry('test-engine', 'task'),
  'test-schema': entry('test-schema', 'task'),
  suite: entry('suite', 'task', true),
};
const PROCESSES: ProcessName[] = ['atelier', 'dev', 'serveur-test'];
const studioJournal = new Journal('studio', JOURNAUX);
const journals = (): Journal[] => [studioJournal, ...Object.values(entries).map((e) => e.journal)];

const pids = new PidFile(path.join(STUDIO_DIR, 'pids.json'));
const reglages: Reglages = readReglages(REGLAGES_FILE);
const etat: Etat = readEtat(ETAT_FILE);
let book: OpenBook | null = null;
let port = DEFAULT_PORT;
/** PID d'un studio précédent encore vivants, qui citent le repo (proposés à l'arrêt). */
let restes: Leftover[] = [];
/** Ports attendus occupés (PID et ligne de commande de l'occupant). */
let portIssues: { port: number; usage: string; reason: string | null; owners: { pid: number; command: string; ours: boolean }[] }[] = [];
/** Processus arrêtés par un changement de livre, proposés à la relance. */
let relance: ProcessName[] | null = null;

const running = (e: Entry) => e.state === 'démarrage' || e.state === 'prêt' || e.state === 'en cours';
const exclusiveRunning = (): Entry | null => Object.values(entries).find((e) => e.exclusive && running(e)) ?? null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const duration = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
};

function saveEtat(): void {
  try {
    writeEtat(ETAT_FILE, etat);
  } catch (e) {
    studioJournal.note(`.studio/etat.json non écrit (${(e as Error).message})`);
  }
}

/** Lance `l` pour `e` depuis le repo (casse réelle) ; PID noté dans .studio/pids.json jusqu'à sa fin. */
function spawnFor(e: Entry, l: Launch): ChildProcess {
  e.journal.note(`$ ${showCommand(l)}`);
  const child = launch(l, ROOT, e.journal);
  e.child = child;
  const pid = child.pid;
  if (pid) pids.add({ pid, nom: e.name, debut: new Date().toISOString(), commande: showCommand(l) });
  child.once('error', (err) => e.journal.note(`lancement impossible : ${err.message}`));
  child.once('exit', (code, signal) => {
    if (pid) pids.remove(pid);
    e.journal.end();
    if (e.child === child) e.child = null;
    e.journal.note(signal ? `fin (signal ${signal})` : `fin (code ${code})`);
  });
  return child;
}

function finish(e: Entry, state: State, code: number | null, detail: string | null = null): void {
  e.state = state;
  e.code = code;
  e.endedAt = Date.now();
  e.detail = detail;
  e.child = null;
  e.stopping = false;
  if (e.startedAt) e.journal.note(`${state} après ${duration(e.endedAt - e.startedAt)}`);
  e.journal.close();
  changed();
}

function begin(e: Entry, state: State): void {
  e.state = state;
  e.code = null;
  e.startedAt = Date.now();
  e.endedAt = null;
  e.detail = null;
  e.stopping = false;
  e.journal.start(`=== ${e.label} — ${frDate(e.startedAt)} — repo ${ROOT}${book ? ` — livre ${book.info.dir}` : ''} ===`);
  changed();
}

interface Step {
  label: string;
  /** Contrôle ou préparation ; un message = refus (tâche en erreur). */
  before?: () => Promise<string | null> | string | null;
  launch: () => Launch;
  after?: () => void;
}

/** Tâche : étapes dans l'ordre, arrêt à la première en échec. Renvoie vrai si toutes ont réussi. */
async function runTask(e: Entry, steps: Step[]): Promise<boolean> {
  begin(e, 'en cours');
  for (const [i, s] of steps.entries()) {
    e.detail = steps.length > 1 ? `étape ${i + 1}/${steps.length} : ${s.label}` : null;
    changed();
    if (e.stopping) break;
    const refused = s.before ? await s.before() : null;
    if (refused) {
      e.journal.note(refused);
      finish(e, 'erreur', null, refused);
      return false;
    }
    if (e.stopping) break;
    let l: Launch;
    try {
      l = s.launch();
    } catch (err) {
      e.journal.note((err as Error).message);
      finish(e, 'erreur', null, (err as Error).message);
      return false;
    }
    const code = await exited(spawnFor(e, l));
    if (e.stopping) break;
    if (code !== 0) {
      finish(e, 'erreur', code, steps.length > 1 ? `échec à l'étape ${i + 1} : ${s.label}` : null);
      return false;
    }
    s.after?.();
  }
  if (e.stopping) {
    finish(e, 'arrêté', null);
    return false;
  }
  finish(e, 'terminé', 0);
  return true;
}

/** Arrêt d'un processus ou d'une tâche (arbre ou groupe) ; résolu quand il est arrêté. */
async function stopEntry(e: Entry): Promise<void> {
  if (!running(e)) return;
  e.stopping = true;
  e.journal.note('arrêt demandé');
  changed();
  // `dev` qui attend son dev:book : dev:book est arrêté avec lui.
  if (e.name === 'dev' && !e.child && running(entries['dev-book'])) await stopEntry(entries['dev-book']);
  const child = e.child;
  if (child?.pid) await stopTree(child.pid, child);
  if (e.kind === 'process' && running(e)) finish(e, 'arrêté', null);
}

async function stopAll(): Promise<void> {
  await Promise.all(Object.values(entries).map((e) => stopEntry(e)));
}

/** Arrêt immédiat de tout ce qui tourne encore (fin du studio, y compris sur erreur inattendue). */
function killAllNow(): void {
  for (const e of Object.values(entries)) if (e.child?.pid && isAlive(e.child.pid)) killTreeNow(e.child.pid);
}

// ---------------------------------------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------------------------------------

const PORT_USAGE = () => [
  { port: reglages.ports.atelier, usage: 'atelier', owner: entries.atelier },
  { port: reglages.ports.dev, usage: 'lecteur de développement', owner: entries.dev },
  { port: reglages.ports.test, usage: 'serveur de test', owner: entries['serveur-test'] },
  { port: TESTS_PORT, usage: 'tests d’installation (suite complète)', owner: entries.suite },
];

/** Occupant(s) d'un port : PID, ligne de commande, et s'il s'agit d'un processus du repo (arrêt proposé). */
async function describePort(p: number, usage: string): Promise<(typeof portIssues)[number] | null> {
  const b = await portBusy(p);
  if (!b.busy) return null;
  const owners = await portOwners(p);
  const info = await processInfo(owners);
  return {
    port: p,
    usage,
    reason: b.reason,
    owners: owners.map((pid) => {
      const i = info.get(pid);
      return { pid, command: i?.command ?? '(ligne de commande inconnue)', ours: !!i && belongsToRepo(i, ROOT) };
    }),
  };
}

async function checkPorts(): Promise<void> {
  const issues: typeof portIssues = [];
  for (const u of PORT_USAGE()) {
    if (running(u.owner)) continue; // occupé par le studio lui-même
    const d = await describePort(u.port, u.usage);
    if (d) issues.push(d);
  }
  portIssues = issues;
  for (const i of issues) studioJournal.note(portMessage(i));
  changed();
}

function portMessage(i: (typeof portIssues)[number]): string {
  const who = i.owners.length ? i.owners.map((o) => `PID ${o.pid} (${o.command})`).join(', ') : 'processus inconnu';
  return `port ${i.port} (${i.usage}) occupé par ${who}${i.reason ? ` ; ${i.reason}` : ''}`;
}

/** Port libre avant un lancement ; sinon message (avec le PID de l'occupant), signalé aussi dans le bandeau des ports. */
async function requireFreePort(p: number, usage: string): Promise<string | null> {
  const d = await describePort(p, usage);
  if (!d) {
    portIssues = portIssues.filter((x) => x.port !== p);
    return null;
  }
  portIssues = [...portIssues.filter((x) => x.port !== p), d];
  changed();
  return portMessage(d);
}

// ---------------------------------------------------------------------------------------------------------
// Sorties partagées
// ---------------------------------------------------------------------------------------------------------

function outVerdict(): OutputVerdict {
  return outputVerdict('out/', etat.out, stampOf(OUT_BOOK), book ? { source: book.info.dir, bookId: book.info.bookId } : null, book?.info.newest ?? null);
}

function devBookVerdict(): OutputVerdict {
  return outputVerdict('public/dev-book/', etat.devBook, stampOf(DEV_BOOK), book ? { source: book.info.dir, bookId: book.info.bookId } : null, book?.info.newest ?? null);
}

/** Avant un build ou la suite : serveur de test et `dev` arrêtés (out/ ouvert sous Windows, .next/ supprimé par le build). */
async function stopForBuild(e: Entry): Promise<null> {
  for (const n of ['serveur-test', 'dev'] as const) {
    if (running(entries[n])) {
      e.journal.note(`${entries[n].label} arrêté avant le build`);
      await stopEntry(entries[n]);
    }
  }
  return null;
}

/** out/ et .next/ supprimés avant un build (même effet que `rm -rf .next out`, README) ; état de out/ effacé. */
function cleanForBuild(e: Entry): string | null {
  etat.out = null;
  saveEtat();
  for (const d of ['out', '.next']) {
    try {
      fs.rmSync(path.join(ROOT, d), { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    } catch (err) {
      return `impossible de supprimer ${d}/ (${(err as Error).message}) : un fichier y est-il ouvert (explorateur, éditeur, serveur) ?`;
    }
  }
  e.journal.note('out/ et .next/ supprimés');
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// Lancements
// ---------------------------------------------------------------------------------------------------------

interface Result {
  ok: boolean;
  message?: string;
  error?: string;
  /** Changement de livre : confirmation demandée (processus en cours). */
  confirm?: string;
  chemin?: string | null;
}

const fail = (error: string): Result => ({ ok: false, error });

function requireBook(): string | null {
  if (!book) return 'aucun livre ouvert';
  return null;
}

/** Attente de la réponse HTTP 200 de `dev` ou du serveur de test (première compilation de Next comprise). */
async function waitHttp(e: Entry, p: number): Promise<void> {
  const once = (host: string) =>
    new Promise<number | null>((resolve) => {
      const r = http.get({ host, port: p, path: '/', timeout: 120_000 }, (res) => {
        res.resume();
        resolve(res.statusCode ?? null);
      });
      r.on('timeout', () => r.destroy());
      r.on('error', () => resolve(null));
    });
  const t0 = Date.now();
  while (e.state === 'démarrage' && e.child) {
    const s = (await once('127.0.0.1')) ?? (await once('localhost'));
    if (e.state !== 'démarrage' || !e.child) return;
    if (s === 200) {
      e.state = 'prêt';
      e.detail = null;
      e.journal.note(`prêt (HTTP 200 sur le port ${p}) après ${duration(Date.now() - t0)}`);
      changed();
      return;
    }
    if (Date.now() - t0 > 60_000 && !e.detail) {
      e.detail = s ? `répond ${s}, pas encore 200` : 'ne répond pas encore';
      changed();
    }
    await sleep(1_000);
  }
}

/** Fin inattendue d'un processus de longue durée. */
function watchProcess(e: Entry, child: ChildProcess): void {
  void exited(child).then((code) => {
    if (e.stopping || !running(e)) {
      if (running(e)) finish(e, 'arrêté', null);
      return;
    }
    e.journal.note(`s'est arrêté seul (code ${code})`);
    finish(e, 'erreur', code, `arrêté seul (code ${code})`);
  });
}

async function startAtelier(): Promise<Result> {
  const e = entries.atelier;
  const noBook = requireBook();
  if (noBook) return fail(noBook);
  if (running(e)) return fail('atelier déjà lancé');
  const p = reglages.ports.atelier;
  const busy = await requireFreePort(p, 'atelier');
  if (busy) return fail(busy);
  begin(e, 'démarrage');
  e.port = p;
  e.journal.onLine = (line) => {
    if (e.state === 'démarrage' && /atelier : prêt\b/.test(line)) {
      e.state = 'prêt';
      changed();
    }
  };
  const child = spawnFor(e, npmRun(ROOT, 'atelier', ['--source', book!.info.dir, '--no-open', '--port', String(p)]));
  watchProcess(e, child);
  return { ok: true, message: `atelier lancé sur le port ${p}` };
}

async function runDevBook(): Promise<boolean> {
  const e = entries['dev-book'];
  const dir = book!.info.dir;
  const git = gitState(ROOT);
  return runTask(e, [
    {
      label: 'dev:book',
      launch: () => npmRun(ROOT, 'dev:book', ['--source', dir]),
      after: () => {
        etat.devBook = recordOutput(DEV_BOOK, dir, 'normal', e.startedAt!, git);
        saveEtat();
      },
    },
  ]);
}

async function startDev(): Promise<Result> {
  const e = entries.dev;
  const noBook = requireBook();
  if (noBook) return fail(noBook);
  if (running(e)) return fail('lecteur de développement déjà lancé');
  const ex = exclusiveRunning();
  if (ex) return fail(`${ex.label} en cours : attendre sa fin (il écrit .next/, out/ ou public/dev-book/)`);
  const p = reglages.ports.dev;
  const busy = await requireFreePort(p, 'lecteur de développement');
  if (busy) return fail(busy);
  begin(e, 'démarrage');
  e.port = p;
  void (async () => {
    const v = devBookVerdict();
    if (!v.ok) {
      e.detail = 'dev:book en cours (livre de développement)';
      e.journal.note(`${v.message} : dev:book d'abord`);
      changed();
      const ok = await runDevBook();
      if (e.state !== 'démarrage') return; // arrêté pendant dev:book (stopEntry l'a déjà noté)
      if (e.stopping) return finish(e, 'arrêté', null);
      if (!ok) return finish(e, 'erreur', null, 'dev:book a échoué : voir son journal');
      e.detail = null;
    }
    const child = spawnFor(e, npmRun(ROOT, 'dev', ['-p', String(p)]));
    watchProcess(e, child);
    await waitHttp(e, p);
  })();
  return { ok: true, message: `lecteur de développement lancé sur le port ${p}` };
}

async function startTestServer(): Promise<Result> {
  const e = entries['serveur-test'];
  const noBook = requireBook();
  if (noBook) return fail(noBook);
  if (running(e)) return fail('serveur de test déjà lancé');
  const ex = exclusiveRunning();
  if (ex && ex.name !== 'dev-book') return fail(`${ex.label} en cours : attendre sa fin (il écrit out/)`);
  const v = outVerdict();
  if (!v.ok) return fail(`${v.message} : serveur de test refusé, reconstruire le livre ouvert (Build du livre)`);
  if (!fs.existsSync(HTTP_SERVER_BIN)) return fail('http-server absent de node_modules : lancer npm i -D -E http-server@14.1.1');
  const p = reglages.ports.test;
  const busy = await requireFreePort(p, 'serveur de test');
  if (busy) return fail(busy);
  begin(e, 'démarrage');
  e.port = p;
  const child = spawnFor(e, { file: process.execPath, args: [HTTP_SERVER_BIN, path.join(ROOT, 'out'), '-p', String(p), '-c-1'] });
  watchProcess(e, child);
  void waitHttp(e, p);
  return { ok: true, message: `serveur de test lancé sur le port ${p}` };
}

async function startProcess(name: ProcessName): Promise<Result> {
  if (name === 'atelier') return startAtelier();
  if (name === 'dev') return startDev();
  return startTestServer();
}

function startTask(name: TaskName): Result {
  const e = entries[name];
  if (running(e)) return fail(`${e.label} déjà en cours`);
  if (e.exclusive) {
    const ex = exclusiveRunning();
    if (ex) return fail(`une seule tâche à la fois parmi build, suite complète et dev:book : ${ex.label} en cours`);
  }
  const needsBook = name === 'book-check' || name === 'build' || name === 'dev-book';
  if (needsBook) {
    const noBook = requireBook();
    if (noBook) return fail(noBook);
  }
  const dir = book?.info.dir ?? '';
  const git = gitState(ROOT);
  let steps: Step[];
  switch (name) {
    case 'book-check':
      steps = [
        {
          label: 'book:check',
          before: () => {
            fs.rmSync(CHECK_REPORT, { force: true });
            return null;
          },
          launch: () => npmRun(ROOT, 'book:check', ['--source', dir, '--report', CHECK_REPORT]),
        },
      ];
      void runTask(e, steps).then(() => readCheck(dir));
      return { ok: true, message: 'book:check lancé' };
    case 'dev-book':
      void runDevBook();
      return { ok: true, message: 'dev:book lancé' };
    case 'build':
      steps = [
        {
          label: 'build',
          before: async () => (await stopForBuild(e)) ?? cleanForBuild(e),
          launch: () => npmRun(ROOT, 'build', ['--source', dir]),
          after: () => {
            etat.out = recordOutput(OUT_BOOK, dir, 'normal', e.startedAt!, git);
            saveEtat();
          },
        },
      ];
      break;
    case 'test-engine':
      steps = [{ label: 'test:engine', launch: () => npmRun(ROOT, 'test:engine') }];
      break;
    case 'test-schema':
      steps = [{ label: 'test:schema', launch: () => npmRun(ROOT, 'test:schema') }];
      break;
    case 'suite': {
      const testBook = path.join(ROOT, 'books', 'test-dino');
      let buildStart = 0;
      steps = [
        { label: 'livre de test (book:test-source)', before: () => stopForBuild(e), launch: () => npmRun(ROOT, 'book:test-source') },
        {
          label: 'build du livre de test (--part-mib 1)',
          before: () => {
            buildStart = Date.now();
            return cleanForBuild(e);
          },
          launch: () => npmRun(ROOT, 'build', ['--source', realCase(testBook) ?? testBook, '--part-mib', '1']),
          after: () => {
            etat.out = recordOutput(OUT_BOOK, realCase(testBook) ?? testBook, 'livre de test', buildStart, git);
            saveEtat();
          },
        },
        {
          label: 'test:install (environ 9 min sous Windows)',
          before: () => requireFreePort(TESTS_PORT, 'tests d’installation'),
          launch: () => npmRun(ROOT, 'test:install'),
        },
      ];
      break;
    }
  }
  void runTask(e, steps);
  return { ok: true, message: `lancement : ${e.label}${name === 'suite' ? ' (environ 9 min sous Windows)' : ''}` };
}

/** Résumé par scène du dernier book:check (`--report`), pour le tableau du livre. */
function readCheck(dir: string): void {
  if (!book || book.info.dir !== dir) return;
  let raw: unknown = null;
  try {
    raw = JSON.parse(fs.readFileSync(CHECK_REPORT, 'utf8'));
  } catch {
    // absent : échec inattendu ou arrêt
  }
  const s = summarizeReport(raw);
  book.info.check = s ? { ...s, date: Date.now() } : { date: Date.now(), error: 'pas de rapport (arrêt ou échec inattendu) : voir le journal de book:check' };
  book.refresh();
  changed();
}

// ---------------------------------------------------------------------------------------------------------
// Livre ouvert
// ---------------------------------------------------------------------------------------------------------

function remember(dir: string): void {
  reglages.recents = [dir, ...reglages.recents.filter((r) => !samePath(r, dir))].slice(0, MAX_RECENTS);
  try {
    writeReglages(REGLAGES_FILE, reglages);
  } catch {
    // non inscriptible : récents non gardés
  }
}

async function openBookAction(input: string, confirmed: boolean): Promise<Result> {
  const r = resolveBookDir(input, ROOT);
  if ('error' in r) return fail(r.error);
  if (book && samePath(book.info.dir, r.dir)) {
    book.refresh();
    changed();
    return { ok: true, message: 'livre déjà ouvert' };
  }
  const task = Object.values(entries).find((e) => e.kind === 'task' && running(e));
  if (task) return fail(`${task.label} en cours : l'arrêter ou attendre sa fin avant de changer de livre`);
  const live = PROCESSES.filter((n) => running(entries[n]));
  if (book && live.length && !confirmed) {
    return { ok: false, confirm: `Changer de livre arrête : ${live.map((n) => entries[n].label).join(', ')}. Continuer ?` };
  }
  for (const n of live) await stopEntry(entries[n]);
  book = new OpenBook(r.dir, r.typed);
  remember(r.dir);
  relance = live.length ? live : null;
  studioJournal.note(`livre ouvert : ${r.dir}${r.typed ? ` (saisi « ${r.typed} », ramené à la casse réelle)` : ''}`);
  changed();
  return { ok: true, message: `livre ouvert : ${r.dir}` };
}

/** « Parcourir… » (Windows) : boîte de dialogue de dossiers ouverte par le serveur (PowerShell, FolderBrowserDialog). */
async function browse(): Promise<Result> {
  if (!IS_WIN) return fail('« Parcourir… » n’existe que sous Windows : saisir le chemin');
  const start = (book?.info.dir ?? realCase(path.join(ROOT, 'books')) ?? ROOT).replace(/'/g, "''");
  const out = await powershell(
    [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$f = New-Object System.Windows.Forms.Form',
      '$f.TopMost = $true',
      '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
      "$d.Description = 'Dossier du livre (contenant book.json)'",
      '$d.ShowNewFolderButton = $false',
      `$d.SelectedPath = '${start}'`,
      'if ($d.ShowDialog($f) -eq [System.Windows.Forms.DialogResult]::OK) { $d.SelectedPath }',
      '$f.Dispose()',
    ].join('\n'),
    30 * 60_000,
  );
  const chemin = out.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? null;
  return { ok: true, chemin };
}

// ---------------------------------------------------------------------------------------------------------
// Restes d'un studio tué
// ---------------------------------------------------------------------------------------------------------

/**
 * Restes d'un studio arrêté brutalement (correctif ST1) : branches de processus encore vivantes qui descendent d'un PID noté
 * dans .studio/pids.json (processus gérés et studio lui-même) et citent le repo. Sous Windows, tuer le studio sans `/T`
 * laisse ses enfants en marche ; un enfant intermédiaire (npm) peut mourir et laisser ses descendants : ils sont retrouvés
 * par le numéro de leur parent, conservé par Windows. Le PID du studio courant est noté ensuite.
 */
async function findRestes(): Promise<void> {
  const prev = pids.readPrevious();
  const recorded = prev.flatMap((e) => {
    const debut = Date.parse(e.debut);
    return Number.isFinite(debut) ? [{ pid: e.pid, nom: e.nom, debut }] : [];
  });
  if (recorded.length) {
    const { leftovers, liveStudio } = findLeftovers(await listProcesses(), recorded, ROOT, process.pid);
    if (liveStudio) studioJournal.note(`un autre studio tourne sur ce repo (PID ${liveStudio}) : restes non recherchés`);
    restes = leftovers;
  }
  // Toujours suivis tant qu'ils ne sont ni arrêtés ni laissés (le studio courant peut être tué à son tour).
  for (const r of restes) {
    pids.add({ pid: r.group ?? r.pid, nom: r.nom, debut: new Date(r.start ?? Date.now()).toISOString(), commande: r.command });
  }
  pids.add({ pid: process.pid, nom: 'studio', debut: new Date(Date.now() - process.uptime() * 1000).toISOString(), commande: process.argv.join(' ') });
  for (const r of restes) studioJournal.note(`reste d'un studio précédent : PID ${r.pid} (${r.nom}, ${r.count} processus) : ${r.command}`);
}

async function stopRestes(): Promise<Result> {
  const list = restes;
  for (const r of list) {
    const target = !IS_WIN && r.group ? r.group : r.pid;
    if (isAlive(r.pid) || (target !== r.pid && isAlive(target))) {
      studioJournal.note(`arrêt du reste PID ${r.pid} (${r.nom}, ${r.count} processus)`);
      await stopTree(target);
    }
    pids.remove(r.group ?? r.pid);
  }
  restes = [];
  await checkPorts();
  return { ok: true, message: `${list.length} reste(s) arrêté(s)` };
}

async function stopPortOwner(pid: number): Promise<Result> {
  const known = portIssues.some((i) => i.owners.some((o) => o.pid === pid && o.ours));
  if (!known) return fail(`PID ${pid} : pas un processus du repo qui occupe un port attendu`);
  const i = (await processInfo([pid])).get(pid);
  if (!i || !belongsToRepo(i, ROOT)) return fail(`PID ${pid} : déjà arrêté ou ne cite plus le repo`);
  studioJournal.note(`arrêt du PID ${pid} (port occupé) : ${i.command}`);
  await stopTree(pid);
  await checkPorts();
  return { ok: true, message: `PID ${pid} arrêté` };
}

// ---------------------------------------------------------------------------------------------------------
// État envoyé à la page
// ---------------------------------------------------------------------------------------------------------

function view() {
  return {
    marker: STUDIO_MARKER,
    studio: { pid: process.pid, port, root: ROOT, caseWarning: CASE_WARNING, windows: IS_WIN, httpServer: fs.existsSync(HTTP_SERVER_BIN) },
    book: book ? book.info : null,
    recents: reglages.recents,
    ports: reglages.ports,
    outputs: { out: outVerdict(), devBook: devBookVerdict() },
    managed: Object.values(entries).map((e) => ({
      name: e.name, label: e.label, kind: e.kind, exclusive: e.exclusive, state: e.state, code: e.code,
      startedAt: e.startedAt, endedAt: e.endedAt, detail: e.detail, pid: e.child?.pid ?? null, port: e.port,
    })),
    exclusive: exclusiveRunning()?.name ?? null,
    restes: restes.map((r) => ({ pid: r.pid, nom: r.nom, commande: r.command, nombre: r.count })),
    portIssues,
    relance,
    journals: journals().map((j) => ({ name: j.name, label: JOURNAL_LABELS[j.name as Name | 'studio'] })),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Événements (SSE)
// ---------------------------------------------------------------------------------------------------------

const clients = new Set<http.ServerResponse>();
/** « Tout arrêter et quitter », Ctrl+C… : arrêt en cours. */
let quitting = false;
let lastSent = '';
let tabSeenAt = 0;
let changeTimer: NodeJS.Timeout | null = null;

function send(event: string, data: unknown): void {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(msg);
}

/** État modifié : envoi groupé (100 ms) s'il diffère du dernier envoyé. */
function changed(): void {
  if (changeTimer) return;
  changeTimer = setTimeout(() => {
    changeTimer = null;
    const text = JSON.stringify(view());
    if (text === lastSent) return;
    lastSent = text;
    for (const c of clients) c.write(`event: etat\ndata: ${text}\n\n`);
  }, 100);
}

/** Lignes nouvelles des journaux, envoyées toutes les 200 ms. */
function flushJournals(): void {
  for (const j of journals()) {
    if (!j.pending.length) continue;
    const lines = j.pending;
    j.pending = [];
    send('journal', { nom: j.name, lignes: lines });
  }
}

function events(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (quitting) {
    // Arrêt en cours : la page ne doit pas se reconnecter à ce studio-ci (elle attend le suivant).
    res.writeHead(503, { 'cache-control': 'no-store' });
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
  res.write(`retry: ${SSE_RETRY_MS}\n`);
  res.write(`event: etat\ndata: ${JSON.stringify(view())}\n\n`);
  clients.add(res);
  tabSeenAt = Date.now();
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
}

// ---------------------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------------------

const STATIC: Record<string, [string, string]> = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/studio.css': ['studio.css', 'text/css; charset=utf-8'],
  '/studio.js': ['studio.js', 'text/javascript; charset=utf-8'],
};

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function forbid(req: http.IncomingMessage, res: http.ServerResponse, why: string): void {
  studioJournal.note(`requête refusée (403, ${why}) : ${req.method} ${req.url} ; Host « ${req.headers.host ?? ''} », Origin « ${req.headers.origin ?? ''} »`);
  res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  res.end(`studio : requête refusée (${why})\n`);
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('corps de requête trop gros'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('JSON illisible'));
      }
    });
    req.on('error', reject);
  });
}

const isName = (v: unknown): v is Name => typeof v === 'string' && v in entries;

async function action(body: Record<string, unknown>): Promise<Result> {
  const a = body.action;
  switch (a) {
    case 'ouvrir':
      return openBookAction(String(body.chemin ?? ''), body.confirme === true);
    case 'parcourir':
      return browse();
    case 'oublierRecent':
      reglages.recents = reglages.recents.filter((r) => !samePath(r, String(body.chemin ?? '')));
      writeReglages(REGLAGES_FILE, reglages);
      changed();
      return { ok: true };
    case 'demarrer': {
      const n = body.nom;
      if (!isName(n)) return fail('processus ou tâche inconnu');
      return entries[n].kind === 'process' ? startProcess(n as ProcessName) : startTask(n as TaskName);
    }
    case 'arreter': {
      const n = body.nom;
      if (!isName(n)) return fail('processus ou tâche inconnu');
      await stopEntry(entries[n]);
      return { ok: true, message: `arrêt : ${entries[n].label}` };
    }
    case 'relancer': {
      const list = relance ?? [];
      relance = null;
      const msgs: string[] = [];
      for (const n of list) {
        const r = await startProcess(n);
        msgs.push(r.ok ? (r.message ?? n) : `${entries[n].label} : ${r.error}`);
      }
      changed();
      return { ok: true, message: msgs.join(' ; ') };
    }
    case 'oublierRelance':
      relance = null;
      changed();
      return { ok: true };
    case 'arreterRestes':
      return stopRestes();
    case 'laisserRestes':
      for (const r of restes) pids.remove(r.group ?? r.pid);
      restes = [];
      changed();
      return { ok: true, message: 'restes laissés en marche (plus suivis par le studio)' };
    case 'arreterPid':
      return stopPortOwner(Number(body.pid));
    case 'verifierPorts':
      await checkPorts();
      return { ok: true, message: portIssues.length ? `${portIssues.length} port(s) occupé(s)` : 'ports libres' };
    case 'ports': {
      const p = body.ports as Record<string, unknown> | undefined;
      const next = { ...reglages.ports };
      for (const k of ['atelier', 'dev', 'test'] as const) {
        const v = Number(p?.[k]);
        if (!Number.isInteger(v) || v < 1024 || v > 65534) return fail(`port ${k} : entier entre 1024 et 65534 attendu`);
        next[k] = v;
      }
      const all = [next.atelier, next.dev, next.test];
      if (new Set(all).size !== 3) return fail('trois ports différents attendus');
      if (all.includes(port) || all.includes(TESTS_PORT)) return fail(`ports ${port} (studio) et ${TESTS_PORT} (tests) réservés`);
      reglages.ports = next;
      writeReglages(REGLAGES_FILE, reglages);
      changed();
      return { ok: true, message: 'ports enregistrés (pris en compte au prochain démarrage de chaque processus)' };
    }
    case 'portsParDefaut':
      reglages.ports = { ...DEFAULT_PORTS };
      writeReglages(REGLAGES_FILE, reglages);
      changed();
      return { ok: true };
    case 'quitter':
      setTimeout(() => void shutdown('« Tout arrêter et quitter »'), 50);
      return { ok: true, message: 'arrêt du studio' };
    default:
      return fail(`action inconnue « ${String(a)} »`);
  }
}

function handle(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (!hostAllowed(req.headers.host, req.headers.origin, port)) return forbid(req, res, 'Host ou Origin non autorisé');
  const url = new URL(req.url ?? '/', `http://${HOST}:${port}`);
  const p = url.pathname;
  if (p === '/__studio/action') {
    const ok = actionAllowed(
      { method: req.method, contentType: req.headers['content-type'], studioHeader: req.headers[ACTION_HEADER], origin: req.headers.origin, host: req.headers.host },
      port,
    );
    if (!ok) return forbid(req, res, `POST JSON avec l’en-tête ${ACTION_HEADER} et une Origin du studio attendu`);
    readBody(req)
      .then((b) => (b && typeof b === 'object' && !Array.isArray(b) ? action(b as Record<string, unknown>) : fail('objet JSON attendu')))
      .then((r) => {
        changed();
        sendJson(res, 200, r);
      })
      .catch((e: Error) => sendJson(res, 400, fail(e.message)));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return forbid(req, res, `méthode ${req.method} non admise`);
  if (p === '/__studio/events') return events(req, res);
  if (p === '/__studio/etat') return sendJson(res, 200, view());
  if (p === '/__studio/ping') {
    if (url.searchParams.get('second') === '1') studioJournal.note('second lancement du studio : page rouverte, pas de second studio');
    return sendJson(res, 200, { studio: STUDIO_MARKER, pid: process.pid, root: ROOT });
  }
  if (p === '/__studio/journal') {
    const n = url.searchParams.get('nom') ?? '';
    const j = journals().find((x) => x.name === n);
    if (!j) return sendJson(res, 404, fail(`journal inconnu « ${n} »`));
    return sendJson(res, 200, { nom: j.name, lignes: j.lines });
  }
  const st = STATIC[p];
  if (st) {
    if (p === '/' || p === '/index.html') tabSeenAt = Date.now();
    try {
      const data = fs.readFileSync(path.join(UI_DIR, st[0]));
      res.writeHead(200, { 'content-type': st[1], 'cache-control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      sendJson(res, 500, fail(`page du studio introuvable (${st[0]})`));
    }
    return;
  }
  sendJson(res, 404, fail('introuvable'));
}

// ---------------------------------------------------------------------------------------------------------
// Lancement et arrêt du studio
// ---------------------------------------------------------------------------------------------------------

let server: http.Server | null = null;

async function shutdown(reason: string): Promise<void> {
  if (quitting) return;
  quitting = true;
  console.log(`studio : arrêt (${reason}) : arrêt des processus gérés…`);
  studioJournal.note(`arrêt du studio (${reason})`);
  flushJournals();
  send('bye', { reason });
  await Promise.race([stopAll(), sleep(15_000)]);
  killAllNow();
  for (const c of clients) c.end();
  for (const j of journals()) j.close();
  // Arrêt normal : plus rien à chercher au prochain lancement (un PID réutilisé ne doit pas passer pour un reste).
  pids.remove(process.pid);
  server?.close();
  console.log('studio : arrêté');
  process.exit(0);
}

function parseArgs(argv: string[]): { port: number; open: boolean } {
  let p = DEFAULT_PORT;
  let open = true;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') {
      p = Number(argv[++i]);
      if (!Number.isInteger(p) || p < 1024 || p > 65534) throw new Error('--port : entier entre 1024 et 65534 attendu');
    } else if (a === '--no-open') open = false;
    else throw new Error(`option inconnue « ${a} » (options : --port <n>, --no-open)`);
  }
  return { port: p, open };
}

/** Port du studio occupé : studio déjà lancé (page ouverte) ou autre processus (PID signalé). */
async function portTaken(p: number): Promise<never> {
  const ping = await new Promise<{ studio?: string; pid?: number } | null>((resolve) => {
    const r = http.get({ host: HOST, port: p, path: '/__studio/ping?second=1', headers: { host: `${HOST}:${p}` }, timeout: 3_000 }, (res) => {
      let t = '';
      res.on('data', (d) => (t += d));
      res.on('end', () => {
        try {
          resolve(JSON.parse(t));
        } catch {
          resolve(null);
        }
      });
    });
    r.on('timeout', () => r.destroy());
    r.on('error', () => resolve(null));
  });
  if (ping?.studio === STUDIO_MARKER) {
    console.log(`studio : déjà lancé (PID ${ping.pid}) : page http://${HOST}:${p}/ ouverte dans le navigateur ; cette fenêtre se ferme dans 5 s`);
    openBrowser(`http://${HOST}:${p}/`);
    await sleep(5_000);
    process.exit(0);
  }
  const d = await describePort(p, 'studio');
  const who = d?.owners.length ? d.owners.map((o) => `PID ${o.pid} (${o.command})`).join(', ') : 'un processus inconnu';
  console.error(`studio : le port ${p} est occupé par ${who} ; l'arrêter ou choisir un autre port (npm run studio -- --port <n>)`);
  process.exit(2);
}

async function main(): Promise<void> {
  let opts: { port: number; open: boolean };
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`studio : ${(e as Error).message}`);
    process.exit(2);
  }
  port = opts.port;
  if ((await portBusy(port)).busy) await portTaken(port);
  fs.mkdirSync(JOURNAUX, { recursive: true });
  studioJournal.start(`=== Studio — ${frDate(Date.now())} — repo ${ROOT} — PID ${process.pid} ===`);
  if (CASE_WARNING) {
    console.warn(`studio : ${CASE_WARNING}`);
    studioJournal.note(CASE_WARNING);
  }

  await findRestes();
  // Livre ouvert au dernier lancement (aucun processus démarré).
  const last = reglages.recents[0];
  if (last) {
    const r = resolveBookDir(last, ROOT);
    if (!('error' in r)) book = new OpenBook(r.dir, null);
  }

  server = http.createServer(handle);
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(port, HOST, resolve);
  });
  const startedAt = Date.now();
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const) {
    process.on(sig, () => {
      // Fenêtre de console fermée (Windows : quelques secondes avant la fin forcée) : arrêt immédiat des arbres d'abord.
      if (IS_WIN) killAllNow();
      void shutdown(sig === 'SIGINT' ? 'Ctrl+C' : sig === 'SIGHUP' ? 'console fermée' : sig);
    });
  }
  process.on('exit', killAllNow);
  process.on('uncaughtException', (e) => {
    console.error('studio : erreur inattendue', e);
    killAllNow();
    process.exit(1);
  });

  setInterval(() => {
    book?.refresh();
    changed();
  }, SCAN_MS).unref();
  setInterval(flushJournals, 200).unref();
  void checkPorts();

  const url = `http://${HOST}:${port}/`;
  console.log(`studio : ${url} (repo ${ROOT}, PID ${process.pid}) ; « Tout arrêter et quitter » dans la page, ou Ctrl+C ici`);
  if (restes.length) console.log(`studio : ${restes.length} processus d'un studio précédent encore en marche : voir la page`);
  if (opts.open) {
    // Un onglet resté ouvert se reconnecte seul (flux d'événements) : navigateur ouvert seulement sinon.
    await sleep(TAB_WAIT_MS);
    if (tabSeenAt < startedAt) openBrowser(url);
  }
}

main().catch((e) => {
  console.error('studio : échec inattendu', e);
  killAllNow();
  process.exit(1);
});
