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
// Fichiers du studio : .studio/ (etat.json, pids.json, reglages.json, journaux/, book-check.json, verifications.json : dernier book:check de chaque livre, CC2), ignoré par Git.
// Aucun fichier de src/ n'importe ce dossier ; le contrôle de fin de build cherche le marqueur `glbi-studio-st1` dans out/.
//
// ST2 (spec-app-bureau.md §4, §8) : le studio est le seul outil qui écrit `book.json` (formulaire validé par `bookSchema`,
// création d'un livre, ajout, retrait et ordre des scènes ; `bookId` d'un livre existant et renommage d'une scène refusés) ;
// Blender ouvert sur `blender/<id>.blend` en processus indépendant (jamais arrêté par le studio), gabarit de scène copié
// sans jamais écraser. Second lancement : la page n'est rouverte que si aucun onglet n'est connecté.
//
// ST3 (spec-app-bureau.md §7, §9) : « Publier un essai » (tâche : `wrangler whoami` puis `wrangler pages deploy <repo>/out
// --project-name <projet> --branch main`, par `npx wrangler@4.151.1`, sans shell, depuis le dossier parent du repo) refusé si
// out/ n'est pas le livre ouvert, en mode normal, à jour ; jamais en même temps qu'un build ou la suite complète (qui
// suppriment out/). « Se connecter à Cloudflare » (`wrangler login`, navigateur ouvert). QR d'essai écrits dans
// dist/qr-essai/<bookId>/<id>.svg (→ https://<projet>.pages.dev/s/<id>), build inchangé. Adresse Wi-Fi du PC et QR du serveur
// de test, QR d'impression du build (dist/qr/<bookId>/) : affichés dans la page (GET /__studio/qr, sans effet).
//
// AN2 (spec-annonces.md §6, §13) : feuille « Annonces », commune à tous les livres (sans livre ouvert) : clés de signature hors
// du repo (dossier du profil, ou d'essai par GLBI_ANNONCES_CLES), keys.ts écrit après confirmation (ou keys.ts d'essai par
// GLBI_ANNONCES_KEYS_TS), brouillon dans .studio/annonces/, signature refusée hors des règles, sortie signée publiée par la
// tâche « annonces » (`wrangler pages deploy .studio/annonces/sortie`), puis flux relu à son adresse et vérifié par
// src/annonces/feed.ts. Détail : scripts/studio/annonces.ts.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';
import {
  addedScenes,
  composeBook,
  folderNameError,
  formFromBody,
  NEW_BOOK_DIRS,
  SCENE_PATTERN_SOURCE,
  cardTypeUsage,
  scenesUsingCardField,
  validateBook,
  withReceivedValues,
} from './bookjson';
import { LANGUAGES, RESERVED_SOURCE_DIR } from '../../src/schema/glbi';
import { MESSAGES } from '../../src/i18n/messages';
import {
  draftFrom,
  draftText,
  generateKeys,
  importImage,
  keysConfig,
  keysTsText,
  keysView,
  KEY_ROLES,
  nodeFetcher,
  PRODUCTION_FEED_URL,
  publishedFeedUrl,
  readBack,
  readDraft,
  readPublics,
  readSignedFeed,
  sha256Hex,
  signDraft,
  checkDraft,
  todayText,
  type Draft,
  type ReadBack,
} from './annonces';
import { todayOf } from '../../src/annonces/feed';
import {
  copyTemplate,
  JEU_BLEND_DIR,
  JEU_BLEND_NAME,
  DEFAULT_PORTS,
  detectBlender,
  drives,
  gitState,
  listDir,
  MAX_RECENTS,
  OpenBook,
  readEtat,
  readReglages,
  realCase,
  recordOutput,
  resolveBookDir,
  stampOf,
  TESTS_PORT,
  ANNONCES_TESTS_PORT,
  writeEtat,
  writeReglages,
  writeFileAtomic,
  type BrowseKind,
  type Etat,
  type Publication,
  type Reglages,
} from './book';
import {
  DEPLOY_BRANCH,
  lanAddresses,
  lanSceneUrl,
  parseDeploy,
  parseWhoami,
  printGameQrFile,
  printQrFile,
  printQrs,
  projectNameError,
  projectUrl,
  qrSvg,
  readOutBook,
  safeId,
  trialGameQrFile,
  trialGameUrl,
  trialQrFile,
  trialQrScenes,
  WRANGLER_PACKAGE,
  WRANGLER_VERSION,
  writeTrialQrs,
  type DeployResult,
  type WhoAmI,
} from './essai';
import {
  belongsToRepo,
  exited,
  IS_WIN,
  isAlive,
  Journal,
  killTreeNow,
  launch,
  launchIndependent,
  npmExec,
  openFolder,
  npmRun,
  openBrowser,
  PidFile,
  portBusy,
  portOwners,
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
  parseCheckRecords,
  restoredCheck,
  samePath,
  STUDIO_MARKER,
  summarizeReport,
  withCheckRecord,
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
/** Dernier book:check de chaque livre (CC2) : repris à l'ouverture du livre, après une relance du studio. */
const CHECKS_FILE = path.join(STUDIO_DIR, 'verifications.json');
const UI_DIR = path.join(ROOT, 'scripts', 'studio', 'ui');
const OUT_BOOK = path.join(ROOT, 'out', 'book.json');
const DEV_BOOK = path.join(ROOT, 'public', 'dev-book', 'book.json');
const HTTP_SERVER_BIN = path.join(ROOT, 'node_modules', 'http-server', 'bin', 'http-server');
// Annonces (AN2) : brouillon, images, sortie signée et état ; jamais de clé ici.
const ANNONCES_DIR = path.join(STUDIO_DIR, 'annonces');
const ANNONCES_DRAFT = path.join(ANNONCES_DIR, 'brouillon.json');
const ANNONCES_IMAGES = path.join(ANNONCES_DIR, 'images');
const ANNONCES_OUT = path.join(ANNONCES_DIR, 'sortie');
const ANNONCES_ETAT = path.join(ANNONCES_DIR, 'etat.json');
/** Dossier des clés et keys.ts (réels, ou d'essai par variable d'environnement), lus une fois au démarrage. */
const KEYS = keysConfig(ROOT);

/** Écart entre le dossier de lancement (ou le chemin du script) et la casse réelle du repo (incident d'Î16). */
const CASE_WARNING =
  CWD_TYPED !== CWD_REAL || ROOT_TYPED !== ROOT
    ? `Studio lancé depuis « ${CWD_TYPED} » ; casse réelle du repo : « ${ROOT} ». Toutes les commandes partent de la casse réelle.`
    : null;

// ---------------------------------------------------------------------------------------------------------
// Processus et tâches
// ---------------------------------------------------------------------------------------------------------

type ProcessName = 'atelier' | 'dev' | 'serveur-test';
type TaskName = 'book-check' | 'dev-book' | 'build' | 'test-engine' | 'test-schema' | 'suite' | 'publier' | 'cloudflare' | 'annonces';
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
  build: 'Préparer le livre',
  'test-engine': 'test:engine',
  'test-schema': 'test:schema',
  suite: 'Suite complète',
  publier: 'Publication d’essai',
  cloudflare: 'Connexion à Cloudflare',
  annonces: 'Publication des annonces',
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
  // ST3 : la publication lit out/ (refusée pendant un build ou la suite, qui le suppriment, et inversement) ; la connexion
  // n'écrit rien du repo.
  publier: entry('publier', 'task'),
  cloudflare: entry('cloudflare', 'task'),
  // AN2 : publication du flux d'annonces (lit .studio/annonces/sortie/, n'écrit rien du repo ni d'un livre).
  annonces: entry('annonces', 'task'),
};
/** Tâches qui suppriment ou réécrivent out/ : jamais pendant une publication d'essai. */
const OUT_WRITERS: TaskName[] = ['build', 'suite'];
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
/** Connexion de wrangler à Cloudflare, lue au dernier `wrangler whoami` (début de chaque publication) ou après `login`. */
let cloudflare: (WhoAmI & { date: number }) | null = null;

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

/** Lance `l` pour `e` depuis le repo (casse réelle), ou `cwd` ; PID noté dans .studio/pids.json jusqu'à sa fin. */
function spawnFor(e: Entry, l: Launch, cwd: string = ROOT): ChildProcess {
  e.journal.note(`$ ${showCommand(l)}${cwd !== ROOT ? `   (depuis ${cwd})` : ''}`);
  const child = launch(l, cwd, e.journal);
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
  /** Dossier de départ (défaut : le repo). */
  cwd?: string;
  /** Lecture de la sortie de l'étape (code 0) ; un message = échec de la tâche (ST3 : `wrangler whoami`). */
  check?: (lines: string[]) => string | null;
  /** Après succès ; un texte = détail affiché à la fin de la tâche (ST3 : adresse publiée) ; `{ fail }` : tâche en erreur (AN2). */
  after?: () => void | string | { fail: string } | Promise<void | string | { fail: string }>;
}

/** Sorties d'un processus terminé lues jusqu'au bout (les dernières lignes peuvent arriver après `exit`) ; 2 s au plus. */
function streamsClosed(child: ChildProcess): Promise<void> {
  const done = (st: ChildProcess['stdout']) => !st || st.destroyed || st.readableEnded;
  if (done(child.stdout) && done(child.stderr)) return Promise.resolve();
  return Promise.race([new Promise<void>((r) => child.once('close', () => r())), sleep(2_000).then(() => undefined)]);
}

/** Tâche : étapes dans l'ordre, arrêt à la première en échec. Renvoie vrai si toutes ont réussi. */
async function runTask(e: Entry, steps: Step[]): Promise<boolean> {
  begin(e, 'en cours');
  let doneDetail: string | null = null;
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
    const lines: string[] = [];
    // Sortie du programme seulement (pas les lignes « [studio] » : la commande affichée, les notes).
    if (s.check) e.journal.onLine = (line) => void (line.startsWith('[studio] ') || lines.push(line));
    const child = spawnFor(e, l, s.cwd);
    const code = await exited(child);
    if (s.check) {
      await streamsClosed(child);
      e.journal.onLine = null;
    }
    if (e.stopping) break;
    if (code !== 0) {
      finish(e, 'erreur', code, steps.length > 1 ? `échec à l'étape ${i + 1} : ${s.label}` : null);
      return false;
    }
    const failed = s.check ? s.check(lines) : null;
    if (failed) {
      e.journal.note(failed);
      finish(e, 'erreur', null, failed);
      return false;
    }
    const d = await s.after?.();
    if (typeof d === 'string') doneDetail = d;
    else if (d && typeof d === 'object') {
      e.journal.note(d.fail);
      finish(e, 'erreur', null, d.fail);
      return false;
    }
  }
  if (e.stopping) {
    finish(e, 'arrêté', null);
    return false;
  }
  finish(e, 'terminé', 0, doneDetail);
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
  /** Dossier sans book.json : « Créer un livre ici » proposé (ST2). */
  creer?: { parent: string; name: string };
  /** Messages de `bookSchema` (`formatIssues`) : book.json non écrit (ST2). */
  erreurs?: string[];
  /** Empreinte de book.json après enregistrement (base du formulaire, ST2). */
  stamp?: { size: number; mtime: number } | null;
  inchange?: boolean;
  /** Annonces (AN2) : brouillon lu, contrôle (refus et avertissements), nom d'une image importée. */
  brouillon?: Draft;
  controle?: unknown;
  nom?: string;
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
  if (!v.ok) return fail(`${v.message} : serveur de test refusé : « Préparer le livre » d’abord`);
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
  if (OUT_WRITERS.includes(name) && running(entries.publier)) {
    return fail('publication d’essai en cours (elle envoie out/) : attendre sa fin, ou l’arrêter');
  }
  if (name === 'publier') {
    const w = OUT_WRITERS.map((n) => entries[n]).find(running);
    if (w) return fail(`${w.label} en cours (il supprime et réécrit out/) : attendre sa fin avant de publier`);
  }
  if ((name === 'publier' && running(entries.cloudflare)) || (name === 'cloudflare' && running(entries.publier))) {
    return fail(`${entries[name === 'publier' ? 'cloudflare' : 'publier'].label} en cours : attendre sa fin`);
  }
  if ((name === 'annonces' && running(entries.cloudflare)) || (name === 'cloudflare' && running(entries.annonces))) {
    return fail(`${entries[name === 'annonces' ? 'cloudflare' : 'annonces'].label} en cours : attendre sa fin`);
  }
  const needsBook = name === 'book-check' || name === 'build' || name === 'dev-book' || name === 'publier';
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
      void runTask(e, steps).then(() => readCheck(dir, e.startedAt));
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
          // AN1 : livre de test construit avec le flux d'annonces de test (clés de test, serveur de test sur le port 4175).
          launch: () => ({ ...npmRun(ROOT, 'build', ['--source', realCase(testBook) ?? testBook, '--part-mib', '1']), env: { GLBI_ANNONCES_TEST: '1' } }),
          after: () => {
            etat.out = recordOutput(OUT_BOOK, realCase(testBook) ?? testBook, 'livre de test', buildStart, git);
            saveEtat();
          },
        },
        {
          label: `test:install (${suiteDurationText()})`,
          before: async () => (await requireFreePort(TESTS_PORT, 'tests d’installation')) ?? requireFreePort(ANNONCES_TESTS_PORT, 'flux d’annonces de test'),
          launch: () => npmRun(ROOT, 'test:install'),
          // Durée de la suite complète menée à son terme, annoncée au lancement suivant (MJ3, point de CC3).
          after: () => {
            if (e.startedAt) {
              reglages.suite = { dureeMs: Date.now() - e.startedAt, date: Date.now() };
              saveReglages();
            }
          },
        },
      ];
      break;
    }
    case 'publier': {
      const r = publishSteps();
      if ('error' in r) return fail(r.error);
      steps = r.steps;
      void runTask(e, steps);
      return { ok: true, message: `publication d’essai lancée vers ${projectUrl(reglages.essai.projet)} (premier lancement : téléchargement de wrangler par npx, une minute environ)` };
    }
    case 'cloudflare':
      steps = [
        {
          label: 'wrangler login (navigateur ouvert, 2 min au plus)',
          cwd: path.dirname(ROOT),
          launch: () => npmExec(WRANGLER_PACKAGE, 'wrangler', ['login']),
        },
        whoamiStep(),
      ];
      void runTask(e, steps);
      return { ok: true, message: 'connexion à Cloudflare : autoriser wrangler dans la page du navigateur qui s’ouvre (2 min au plus)' };
    case 'annonces': {
      const r = annoncesSteps();
      if ('error' in r) return fail(r.error);
      void runTask(e, r.steps);
      return { ok: true, message: `publication des annonces lancée vers ${publishedFeedUrl(reglages.annonces.projet)}` };
    }
  }
  void runTask(e, steps);
  return { ok: true, message: `lancement : ${e.label}${name === 'suite' ? ` (${suiteDurationText()})` : ''}` };
}

// ---------------------------------------------------------------------------------------------------------
// Publication d'essai (ST3, §9)
// ---------------------------------------------------------------------------------------------------------

/** `wrangler whoami` : connexion lue dans la sortie (code 0 dans les deux cas) ; non connecté = échec de la tâche. */
function whoamiStep(): Step {
  return {
    label: 'connexion à Cloudflare (wrangler whoami)',
    cwd: path.dirname(ROOT),
    launch: () => npmExec(WRANGLER_PACKAGE, 'wrangler', ['whoami']),
    check: (lines) => {
      const w = parseWhoami(lines);
      cloudflare = { ...w, date: Date.now() };
      changed();
      if (w.connecte === false) return 'wrangler n’est pas connecté à Cloudflare : « Se connecter à Cloudflare », puis publier à nouveau';
      return null;
    },
  };
}

/**
 * Étapes de « Publier un essai » : out/ du livre ouvert, mode normal, à jour (refus sinon, avant et juste avant l'envoi) ;
 * wrangler connecté ; `wrangler pages deploy <repo>/out --project-name <projet> --branch main` depuis le dossier parent du
 * repo (méthode d'Î16) ; puis QR d'essai écrits et publication notée dans .studio/etat.json.
 */
function publishSteps(): { steps: Step[] } | { error: string } {
  const refused = (v: OutputVerdict) => `${v.message} : publication refusée : « Préparer le livre » d’abord`;
  const first = outVerdict();
  if (!first.ok || !first.record) return { error: refused(first) };
  const projet = reglages.essai.projet;
  const bad = projectNameError(projet);
  if (bad) return { error: bad };
  const rec = first.record;
  const parent = path.dirname(ROOT);
  const outDir = path.join(ROOT, 'out');
  let deploy: DeployResult = { termine: false, deploiement: null, alias: null };
  return {
    steps: [
      whoamiStep(),
      {
        label: `envoi de out/ vers ${projectUrl(projet)}`,
        cwd: parent,
        before: () => {
          const v = outVerdict();
          if (!v.ok || !v.record) return refused(v);
          if (v.record.date !== rec.date) return 'out/ reconstruit pendant la publication : relancer « Publier un essai »';
          return null;
        },
        launch: () => npmExec(WRANGLER_PACKAGE, 'wrangler', ['pages', 'deploy', outDir, '--project-name', projet, '--branch', DEPLOY_BRANCH]),
        check: (lines) => {
          deploy = parseDeploy(lines);
          return null;
        },
        after: async () => {
          const e = entries.publier;
          const adresse = projectUrl(projet);
          if (!deploy.termine) e.journal.note('fin du déploiement non reconnue dans la sortie de wrangler (code 0) : vérifier l’adresse');
          const ob = readOutBook(OUT_BOOK);
          let qr = 'QR d’essai non écrits';
          if ('error' in ob) e.journal.note(`QR d’essai non écrits : ${ob.error}`);
          else {
            try {
              const urls = await writeTrialQrs(ROOT, ob.bookId, projet, ob.scenes, ob.game);
              qr = `${urls.length} QR d’essai dans dist/qr-essai/${ob.bookId}/`;
              e.journal.note(`${qr} (${adresse}/s/<scène>)`);
            } catch (err) {
              e.journal.note(`QR d’essai non écrits : ${(err as Error).message}`);
            }
            const pub: Publication = {
              projet, adresse, deploiement: deploy.deploiement ?? deploy.alias, date: new Date().toISOString(), build: rec.date,
              source: rec.source, commit: rec.commit, scenes: ob.scenes,
            };
            etat.publications[ob.bookId] = pub;
            saveEtat();
          }
          const extra = deploy.alias ? ` ; alias ${deploy.alias} : la branche ${DEPLOY_BRANCH} n’est pas la production du projet, l’adresse stable n’est pas mise à jour` : '';
          e.journal.note(`publié : ${adresse}${deploy.deploiement ? ` (ce déploiement : ${deploy.deploiement})` : ''}${extra}`);
          return `publié sur ${adresse}${deploy.deploiement ? ` (ce déploiement : ${deploy.deploiement})` : ''} ; ${qr}${extra}`;
        },
      },
    ],
  };
}

/** Projet Cloudflare Pages des essais (`.studio/reglages.json`). */
function setTrialProject(body: Record<string, unknown>): Result {
  const projet = String(body.projet ?? '').trim();
  const bad = projectNameError(projet);
  if (bad) return fail(bad);
  if (running(entries.publier)) return fail('publication d’essai en cours : changer de projet après sa fin');
  reglages.essai = { projet };
  saveReglages();
  changed();
  return { ok: true, message: `projet d’essai : ${projet} (${projectUrl(projet)})` };
}

/** Port du serveur de test (celui du serveur lancé, sinon le réglage). */
const testPort = () => entries['serveur-test'].port ?? reglages.ports.test;

/**
 * GET /__studio/qr (sans effet) : `type=essai` (dist/qr-essai/<bookId>/<id>.svg), `type=impression` (dist/qr/<bookId>/), ou
 * `type=reseau&ip=<adresse du PC>[&scene=<id>]` (adresse du serveur de test par le réseau local, QR fait à la demande).
 */
async function serveQr(url: URL, res: http.ServerResponse): Promise<void> {
  const type = url.searchParams.get('type');
  const scene = url.searchParams.get('scene') ?? '';
  const bookId = book?.info.bookId ?? '';
  let svg: string | null = null;
  if (type === 'essai' || type === 'impression') {
    // QR du mini-jeu (MJ3) : `jeu=1`, sans scène.
    const jeu = url.searchParams.get('jeu') === '1';
    const f = jeu
      ? type === 'essai' ? trialGameQrFile(ROOT, bookId) : printGameQrFile(ROOT, bookId)
      : type === 'essai' ? trialQrFile(ROOT, bookId, scene) : printQrFile(ROOT, bookId, scene);
    if (f) svg = fs.readFileSync(f, 'utf8');
  } else if (type === 'reseau') {
    const ip = url.searchParams.get('ip') ?? '';
    const known = lanAddresses(os.networkInterfaces()).some((a) => a.ip === ip);
    const sceneOk = scene === '' || (safeId(scene) && !!book?.info.scenes.some((s) => s.id === scene));
    if (known && sceneOk) svg = await qrSvg(lanSceneUrl(ip, testPort(), scene || null));
  }
  if (!svg) return sendJson(res, 404, fail('QR introuvable'));
  res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(svg);
}

/**
 * Résumé par scène du dernier book:check (`--report`), pour le tableau du livre. Date = début de la vérification (ST4 : un
 * fichier modifié pendant qu'elle tourne rend l'étape « Vérifier » à refaire).
 */
function readCheck(dir: string, startedAt: number | null): void {
  if (!book || book.info.dir !== dir) return;
  let raw: unknown = null;
  try {
    raw = JSON.parse(fs.readFileSync(CHECK_REPORT, 'utf8'));
  } catch {
    // absent : échec inattendu ou arrêt
  }
  const s = summarizeReport(raw);
  const date = startedAt ?? Date.now();
  // Vérification arrêtée ou en échec sans rapport (MJ3, point de CC2) : le dernier résultat du livre reste affiché (celui de
  // l'écran, sinon celui gardé dans .studio/verifications.json), marqué « vérification interrompue » ; sans résultat précédent,
  // l'étape le dit.
  const interrupted = { date, message: 'pas de rapport (arrêt ou échec inattendu) : voir le journal de book:check' };
  const prev = book.info.check && !('error' in book.info.check) ? book.info.check : restoredCheck(readCheckRecords(), dir);
  book.info.check = s ? { ...s, date } : prev ? { ...prev, interrupted } : { date, error: interrupted.message };
  if (s) {
    try {
      fs.mkdirSync(STUDIO_DIR, { recursive: true });
      fs.writeFileSync(CHECKS_FILE, `${JSON.stringify(withCheckRecord(readCheckRecords(), { dir, date, report: raw }), null, 2)}\n`);
    } catch (e) {
      studioJournal.note(`dernier résultat de book:check non gardé (${CHECKS_FILE}) : ${(e as Error).message}`);
    }
  }
  book.refresh();
  changed();
}

function readCheckRecords() {
  try {
    return parseCheckRecords(JSON.parse(fs.readFileSync(CHECKS_FILE, 'utf8')));
  } catch {
    return [];
  }
}

/** Livre ouvert : dernier book:check gardé pour ce livre (CC2), sinon rien (« pas encore vérifié »). */
function restoreCheck(): void {
  if (!book) return;
  const c = restoredCheck(readCheckRecords(), book.info.dir);
  if (!c) return;
  book.info.check = c;
  book.refresh();
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
  if ('error' in r) return { ok: false, error: r.error, creer: r.createHere };
  if (book && samePath(book.info.dir, r.dir)) {
    book.refresh();
    changed();
    return { ok: true, message: 'livre déjà ouvert' };
  }
  const task = Object.values(entries).find((e) => e.kind === 'task' && e.name !== 'cloudflare' && running(e));
  if (task) return fail(`${task.label} en cours : l'arrêter ou attendre sa fin avant de changer de livre`);
  const live = PROCESSES.filter((n) => running(entries[n]));
  if (book && live.length && !confirmed) {
    return { ok: false, confirm: `Changer de livre arrête : ${live.map((n) => entries[n].label).join(', ')}. Continuer ?` };
  }
  for (const n of live) await stopEntry(entries[n]);
  book = new OpenBook(r.dir, r.typed);
  restoreCheck();
  remember(r.dir);
  relance = live.length ? live : null;
  studioJournal.note(`livre ouvert : ${r.dir}${r.typed ? ` (saisi « ${r.typed} », ramené à la casse réelle)` : ''}`);
  changed();
  return { ok: true, message: `livre ouvert : ${r.dir}` };
}

const BROWSE_KINDS: readonly BrowseKind[] = ['livre', 'parent', 'blender', 'gabarit', 'image'];

/**
 * « Parcourir… » (correctif ST2 du 20/10, choix de David) : explorateur dans la page, au premier plan, nourri par ce serveur
 * (lecture seule du disque : dossiers, livres repérés par leur book.json, `.exe` ou `.blend` selon le choix). Remplace la boîte
 * de dialogue Windows ouverte par PowerShell, qui s'affichait derrière le navigateur. Le sélecteur de fichiers du navigateur ne
 * donne jamais le chemin complet : il ne peut pas servir ici.
 */
function browseList(body: Record<string, unknown>): Result & { liste?: unknown } {
  const kind = BROWSE_KINDS.find((k) => k === body.quoi) ?? 'livre';
  let dir = unquote(body.chemin);
  if (!dir) {
    const books = realCase(path.join(ROOT, 'books')) ?? ROOT;
    const exe = reglages.blender.exe;
    const gab = reglages.blender.gabarit;
    const start =
      kind === 'livre' ? (book ? path.dirname(book.info.dir) : books)
      : kind === 'parent' ? (book ? path.dirname(book.info.dir) : books)
      : kind === 'blender' ? (exe ? path.dirname(exe) : IS_WIN ? 'C:\\Program Files\\Blender Foundation' : ROOT)
      : kind === 'image' ? (process.env.USERPROFILE ?? process.env.HOME ?? ROOT)
      : gab ? path.dirname(gab) : (book?.info.dir ?? books);
    dir = realCase(start) ? start : ROOT;
  }
  const l = listDir(path.resolve(ROOT, dir), kind);
  if ('error' in l) return fail(l.error);
  const raccourcis = [
    ...(book ? [{ nom: 'Livre ouvert', chemin: book.info.dir }] : []),
    { nom: 'Livres du repo (books/)', chemin: path.join(ROOT, 'books') },
    { nom: 'Dossier personnel', chemin: process.env.USERPROFILE ?? process.env.HOME ?? ROOT },
    ...reglages.recents.slice(0, 5).map((r) => ({ nom: `Récent : ${path.basename(r)}`, chemin: r })),
  ].filter((r) => !!realCase(r.chemin));
  return { ok: true, liste: { ...l, quoi: kind, lecteurs: drives(), raccourcis, sep: path.sep } };
}

// ---------------------------------------------------------------------------------------------------------
// book.json (ST2, §4) : formulaire, enregistrement, création d'un livre
// ---------------------------------------------------------------------------------------------------------

const unquote = (v: unknown) => String(v ?? '').trim().replace(/^"(.*)"$/, '$1').trim();
const isStamp = (v: unknown): v is { size: number; mtime: number } =>
  !!v && typeof v === 'object' && Number.isFinite((v as { size?: unknown }).size) && Number.isFinite((v as { mtime?: unknown }).mtime);

const BOOKID_REFUSED = (id: string) =>
  `changer le bookId d’un livre existant est refusé (« ${id} » : clé de progression et nom du cache, figés après publication) : créer un autre livre`;

/** Objet composé du formulaire pour le livre ouvert (tout `book.json` est dans le formulaire depuis MJ3 : jeu et seuil). */
function composeForOpenBook(form: ReturnType<typeof formFromBody>) {
  return composeBook(form);
}

/** Validation en direct du formulaire (aucune écriture) : messages de `bookSchema` et refus du studio. */
function validateForm(body: Record<string, unknown>): Result {
  const form = formFromBody(body.livre);
  if (body.creation === true) {
    const obj = composeBook(form);
    const v = validateBook(obj);
    return { ok: v.ok, erreurs: v.ok ? [] : withReceivedValues(v.errors, obj) };
  }
  if (!book) return fail('aucun livre ouvert');
  const errors: string[] = [];
  const diskId = book.info.file.content.bookIdOnDisk;
  if (diskId !== null && form.bookId.trim() !== diskId) errors.push(BOOKID_REFUSED(diskId));
  const obj = composeForOpenBook(form);
  const v = validateBook(obj);
  if (!v.ok) errors.push(...withReceivedValues(v.errors, obj));
  return { ok: !errors.length, erreurs: errors };
}

/** Copie du gabarit pour des scènes nouvellement ajoutées (seulement si `blender/<id>.blend` n'existe pas). */
function templateFor(dir: string, ids: string[]): string[] {
  const g = reglages.blender.gabarit;
  if (!g || !ids.length) return [];
  return ids.map((id) => {
    const c = copyTemplate(dir, id, g);
    studioJournal.note(c.message);
    return c.message;
  });
}

/**
 * « Enregistrer » : book.json du formulaire, validé par `bookSchema` (jamais écrit s'il est refusé), clés dans l'ordre du
 * contrat ; contenu identique : rien n'est écrit ; fichier modifié à la main depuis la lecture (`base`) ou invalide sur le
 * disque : confirmation ; fichier temporaire puis renommage ; gabarit copié pour les scènes ajoutées.
 */
async function saveBook(body: Record<string, unknown>): Promise<Result> {
  if (!book) return fail('aucun livre ouvert');
  const dir = book.info.dir;
  const target = path.join(dir, 'book.json');
  book.reload();
  const disk = book.info.file;
  const form = formFromBody(body.livre);
  const diskId = disk.content.bookIdOnDisk;
  if (diskId !== null && form.bookId.trim() !== diskId) return fail(BOOKID_REFUSED(diskId));
  const obj = composeForOpenBook(form);
  const v = validateBook(obj);
  if (!v.ok) return { ok: false, error: `book.json non écrit : refusé par bookSchema (${v.errors.length} message(s))`, erreurs: withReceivedValues(v.errors, obj) };
  let existing: string | null = null;
  try {
    existing = fs.readFileSync(target, 'utf8');
  } catch {
    // absent
  }
  if (existing === v.text) return { ok: true, message: 'book.json identique au formulaire : rien écrit', stamp: disk.stamp, inchange: true };
  if (body.confirme !== true && disk.stamp) {
    if (!isStamp(body.base) || body.base.size !== disk.stamp.size || Math.abs(body.base.mtime - disk.stamp.mtime) >= 1) {
      return { ok: false, confirm: 'book.json a été modifié à la main depuis sa lecture par le studio. L’écraser avec le contenu du formulaire ?' };
    }
    // Point de CC3 : cardFields et cardTypes ensemble (écrits à la main) : le formulaire a repris cardTypes, cardFields serait perdu.
    if (disk.content.bothCardForms) {
      return { ok: false, confirm: 'book.json contient à la fois cardFields et cardTypes (refusé par bookSchema). Le formulaire a repris les types de cartes (cardTypes) : les intitulés de cardFields seront perdus à l’enregistrement. Enregistrer quand même ?' };
    }
    if (!disk.valid) {
      return { ok: false, confirm: `book.json actuel ${disk.readable ? 'refusé par bookSchema' : 'illisible'} : le remplacer par le formulaire (ce qui n’était pas lisible est perdu) ?` };
    }
  }
  try {
    await writeFileAtomic(target, v.text);
  } catch (e) {
    return fail(`book.json non écrit : ${(e as Error).message}`);
  }
  studioJournal.note(`book.json écrit : ${target}`);
  const before = disk.readable ? disk.content.form.scenes : [];
  const msgs = templateFor(dir, addedScenes(before, v.book.scenes));
  book.reload();
  changed();
  return { ok: true, message: ['book.json enregistré', ...msgs].join(' ; '), stamp: book.info.file.stamp };
}

/**
 * « Créer un livre » : dossier parent + nom du dossier (proposé = `bookId`) ; book.json (au moins une scène, validé par
 * `bookSchema`), dossiers scenes/, blender/, images/, icons/, sounds/ ; gabarit copié pour les scènes ; livre ouvert.
 * Un dossier existant est accepté s'il ne contient pas de book.json (« Créer un livre ici »).
 */
async function createBook(body: Record<string, unknown>): Promise<Result> {
  const task = Object.values(entries).find((e) => e.kind === 'task' && e.name !== 'cloudflare' && running(e));
  if (task) return fail(`${task.label} en cours : l'arrêter ou attendre sa fin avant de créer un livre`);
  const parentTyped = unquote(body.parent);
  if (!parentTyped) return fail('dossier parent vide');
  const parent = realCase(path.resolve(ROOT, parentTyped));
  if (!parent || !fs.statSync(parent).isDirectory()) return fail(`dossier parent introuvable : ${path.resolve(ROOT, parentTyped)}`);
  const name = String(body.dossier ?? '').trim();
  const nameError = folderNameError(name);
  if (nameError) return fail(nameError);
  // Correctif ST2 (20/10) : un dossier qui contient déjà un livre est refusé avant toute validation du formulaire.
  const target = path.join(parent, name);
  if (fs.existsSync(target)) {
    if (!fs.statSync(target).isDirectory()) return fail(`${target} existe et n'est pas un dossier`);
    if (fs.existsSync(path.join(target, 'book.json'))) return fail(`${target} contient déjà un book.json : l'ouvrir plutôt que créer un livre`);
  }
  const form = formFromBody(body.livre);
  const obj = composeBook(form);
  const v = validateBook(obj);
  if (!v.ok) return { ok: false, error: `livre non créé : book.json refusé par bookSchema (${v.errors.length} message(s))`, erreurs: withReceivedValues(v.errors, obj) };
  const live = PROCESSES.filter((n) => running(entries[n]));
  if (book && live.length && body.confirme !== true) {
    return { ok: false, confirm: `Le nouveau livre sera ouvert, ce qui arrête : ${live.map((n) => entries[n].label).join(', ')}. Continuer ?` };
  }
  try {
    for (const d of NEW_BOOK_DIRS) fs.mkdirSync(path.join(target, d), { recursive: true });
    await writeFileAtomic(path.join(target, 'book.json'), v.text);
  } catch (e) {
    return fail(`livre non créé : ${(e as Error).message}`);
  }
  const real = realCase(target) ?? target;
  studioJournal.note(`livre créé : ${real} (book.json, ${NEW_BOOK_DIRS.map((d) => `${d}/`).join(', ')})`);
  const msgs = templateFor(real, v.book.scenes);
  const opened = await openBookAction(real, true);
  if (!opened.ok) return { ok: false, error: `livre créé dans ${real}, mais non ouvert : ${opened.error}` };
  return { ok: true, message: [`livre créé : ${real}`, ...msgs, 'icon.png à ajouter (icône du livre, obligatoire)'].join(' ; ') };
}

// ---------------------------------------------------------------------------------------------------------
// Blender (ST2, §8)
// ---------------------------------------------------------------------------------------------------------

/**
 * Durée annoncée de la suite complète (MJ3, point de CC3) : celle de la dernière suite menée à son terme par ce studio ;
 * jamais mesurée : le dire (repère : environ 19 min sous Windows en octobre 2026, 118 tests).
 */
function suiteDurationText(): string {
  const s = reglages.suite;
  if (!s) return 'durée encore jamais mesurée par ce studio : compter une vingtaine de minutes sous Windows';
  return `environ ${Math.max(1, Math.round(s.dureeMs / 60_000))} min d’après la dernière suite, le ${frDate(s.date).slice(0, 10)}`;
}

function saveReglages(): void {
  try {
    writeReglages(REGLAGES_FILE, reglages);
  } catch (e) {
    studioJournal.note(`.studio/reglages.json non écrit (${(e as Error).message})`);
  }
}

/** Réglages de Blender : `blender.exe` et gabarit (vides : non réglés) ; chaque fichier doit exister. */
function setBlender(body: Record<string, unknown>): Result {
  const exe = unquote(body.exe);
  const gabarit = unquote(body.gabarit);
  const exeReal = exe ? realCase(path.resolve(exe)) : null;
  if (exe && (!exeReal || !stampOf(exeReal))) return fail(`blender.exe introuvable : ${path.resolve(exe)}`);
  const gabaritReal = gabarit ? realCase(path.resolve(ROOT, gabarit)) : null;
  if (gabarit && (!gabaritReal || !stampOf(gabaritReal))) return fail(`gabarit introuvable : ${path.resolve(ROOT, gabarit)}`);
  if (gabaritReal && !/\.blend$/i.test(gabaritReal)) return fail('gabarit : un fichier .blend est attendu');
  reglages.blender = { exe: exeReal, gabarit: gabaritReal, detecte: true };
  saveReglages();
  changed();
  return { ok: true, message: 'réglages de Blender enregistrés' };
}

function detectBlenderAction(): Result {
  const found = detectBlender();
  reglages.blender.detecte = true;
  if (!found) {
    saveReglages();
    return fail('aucun blender.exe trouvé dans C:\\Program Files\\Blender Foundation\\Blender <version>\\ : saisir son chemin');
  }
  reglages.blender.exe = found;
  saveReglages();
  changed();
  return { ok: true, message: `Blender détecté : ${found}` };
}

/** Scène de book.json (lue sur le disque) ; sinon message. */
function sceneOf(v: unknown): { id: string; blend: string } | { error: string } {
  if (!book) return { error: 'aucun livre ouvert' };
  const id = String(v ?? '');
  if (!book.info.scenes.some((s) => s.id === id)) return { error: `scène « ${id} » absente de book.json (enregistrer d'abord le formulaire)` };
  return { id, blend: path.join(book.info.dir, RESERVED_SOURCE_DIR, `${id}.blend`) };
}

/** `.blend` du mini-jeu demandé (`blender/jeu/<nom>.blend`, MJ3) : nom d'un fichier de ce dossier ; sinon message. */
function jeuBlendOf(v: unknown): { id: string; blend: string; rel: string } | { error: string } {
  if (!book) return { error: 'aucun livre ouvert' };
  const name = String(v ?? '');
  if (!JEU_BLEND_NAME.test(name)) return { error: `nom de fichier refusé « ${name} » (un .blend de ${RESERVED_SOURCE_DIR}/jeu/)` };
  return { id: name, blend: path.join(book.info.dir, JEU_BLEND_DIR, name), rel: `${RESERVED_SOURCE_DIR}/jeu/${name}` };
}

/**
 * « Ouvrir dans Blender » : `blender/<id>.blend` d'une scène, ou `blender/jeu/<nom>.blend` du mini-jeu (`body.jeu`, MJ3) ;
 * processus indépendant (non géré, non arrêté, hors journal).
 */
async function openInBlender(body: Record<string, unknown>): Promise<Result> {
  const sc = body.jeu !== undefined ? jeuBlendOf(body.jeu) : sceneOf(body.scene);
  if ('error' in sc) return fail(sc.error);
  const rel = 'rel' in sc ? sc.rel : `${RESERVED_SOURCE_DIR}/${sc.id}.blend`;
  if (!stampOf(sc.blend)) return fail(`${rel} absent : « Ouvrir dans Blender » désactivé (« Créer depuis le gabarit » ou « Enregistrer sous » dans Blender)`);
  const exe = reglages.blender.exe;
  if (!exe) return fail('chemin de blender.exe non réglé (section Blender)');
  if (!stampOf(exe)) return fail(`blender.exe introuvable : ${exe} (section Blender)`);
  const r = await launchIndependent(exe, sc.blend, path.dirname(sc.blend));
  if ('error' in r) {
    studioJournal.note(`Blender non lancé sur ${sc.blend} : ${r.error}`);
    return fail(`Blender non lancé : ${r.error}`);
  }
  studioJournal.note(`Blender ouvert sur ${sc.blend}${r.pid ? ` (PID ${r.pid})` : ''} : processus indépendant, ni suivi ni arrêté par le studio`);
  return { ok: true, message: `Blender ouvert sur ${rel}` };
}

// ---------------------------------------------------------------------------------------------------------
// Onglet de l'atelier ouvert à la main (MJ3, point de CC2) : onglets connectés à l'atelier, relevés toutes les 2 s ; un
// onglet déjà ouvert est passé sur la scène ou le jeu demandé par le serveur de l'atelier (`/atelier/__api/ouvrir`).
// ---------------------------------------------------------------------------------------------------------

let atelierTabs = 0;

/** Requête du studio à l'API de l'atelier (127.0.0.1, `Host` de l'atelier, sans `Origin` ; ne compte pas comme un onglet). */
function atelierApi(route: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const port = entries.atelier.port;
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: HOST, port, method: data ? 'POST' : 'GET', path: `/atelier/__api/${route}`, timeout: 2000,
        headers: { host: `127.0.0.1:${port}`, 'x-atelier-probe': '1', ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('atelier : pas de réponse')));
    req.on('error', reject);
    req.end(data);
  });
}

async function pollAtelierTabs(): Promise<void> {
  const before = atelierTabs;
  const m = entries.atelier;
  if (m.state !== 'prêt' || !m.port) atelierTabs = 0;
  else {
    try {
      const r = await atelierApi('onglets');
      atelierTabs = typeof r.json.onglets === 'number' ? r.json.onglets : 0;
    } catch {
      atelierTabs = 0;
    }
  }
  if (atelierTabs !== before) changed();
}

/** Onglet de l'atelier déjà ouvert (à la main ou par une autre page du studio) passé sur `scene`, ou sur le jeu (`jeu`). */
async function atelierGoTo(body: Record<string, unknown>): Promise<Result> {
  const m = entries.atelier;
  if (m.state !== 'prêt' || !m.port) return fail('atelier non démarré');
  const scene = String(body.scene ?? '');
  if (body.jeu !== true && scene && !safeId(scene)) return fail(`scène « ${scene} » refusée`);
  const hash = body.jeu === true ? '#/jeu' : scene ? `#/s/${scene}` : null;
  if (!hash) return { ok: true, message: 'Atelier déjà ouvert dans un autre onglet du navigateur' };
  try {
    const r = await atelierApi('ouvrir', { hash });
    if (r.status !== 200) return fail(String(r.json.error ?? `atelier : HTTP ${r.status}`));
    const n = Number(r.json.onglets ?? 0);
    if (!n) return fail('aucun onglet de l’atelier ouvert');
    return { ok: true, message: `Atelier déjà ouvert dans un autre onglet : il affiche maintenant ${body.jeu === true ? 'le jeu' : `la scène ${scene}`}` };
  } catch (e) {
    return fail(`atelier injoignable : ${(e as Error).message}`);
  }
}

/** « Ouvrir le dossier » (CC2) : dossier du livre ouvert dans l'Explorateur de Windows (ou l'explorateur du système). */
async function openBookFolder(): Promise<Result> {
  if (!book) return fail('aucun livre ouvert');
  const r = await openFolder(book.info.dir);
  if ('error' in r) {
    const hint = /^xdg-open introuvable/.test(r.error) ? ' (installer xdg-utils)' : '';
    studioJournal.note(`dossier du livre non ouvert : ${r.error}`);
    return fail(`Dossier du livre non ouvert : ${r.error}${hint}. L’ouvrir à la main : ${book.info.dir}`);
  }
  studioJournal.note(`dossier du livre ouvert dans l’explorateur : ${book.info.dir}`);
  return { ok: true, message: 'Dossier du livre ouvert dans l’Explorateur' };
}

/** `edit.json` des scènes du livre ouvert, lus tels quels (absent ou illisible : ignoré, scène sans carte). */
function readSceneEdits(): Record<string, unknown> {
  const edits: Record<string, unknown> = {};
  for (const s of book!.info.scenes) {
    try {
      edits[s.id] = JSON.parse(fs.readFileSync(path.join(book!.info.dir, 'scenes', `${s.id}.edit.json`), 'utf8'));
    } catch {
      // absent ou illisible : sans carte
    }
  }
  return edits;
}

/** Type de carte reçu de la page (`body.type` : `{ id, tete }`, CC3) ; `undefined` si absent. */
function typeOfBody(v: unknown): { id: string; tete: boolean } | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  return { id: typeof o.id === 'string' ? o.id : '', tete: o.tete === true };
}

/**
 * Scènes dont la carte donne une valeur à l'intitulé `body.id` (lecture seule de leur `edit.json`) : la page demande
 * confirmation avant de retirer cet intitulé (spec-carte-collection.md §9). CC3 : `body.type` (`{ id, tete }`) limite aux
 * cartes de ce type (type explicite, ou sans type si le type est en tête).
 */
function cardFieldUsage(body: Record<string, unknown>): Result & { scenes?: string[] } {
  if (!book) return fail('aucun livre ouvert');
  const id = typeof body.id === 'string' ? body.id : '';
  return { ok: true, scenes: scenesUsingCardField(readSceneEdits(), id, typeOfBody(body.type)) };
}

/**
 * Usage d'un type de carte (CC3, action `usageType`, lecture seule) : scènes dont la carte est de ce type (`{ id, tete }`),
 * et type explicite de chaque carte, pour les confirmations de la page (retrait d'un type, type de tête, retour à un type).
 */
function cardTypeUsageOf(body: Record<string, unknown>): Result & ReturnType<typeof cardTypeUsage> {
  if (!book) return fail('aucun livre ouvert') as Result & ReturnType<typeof cardTypeUsage>;
  const type = { id: typeof body.id === 'string' ? body.id : '', tete: body.tete === true };
  return { ok: true, ...cardTypeUsage(readSceneEdits(), type) };
}

/** « Créer depuis le gabarit » : copie en `blender/<id>.blend` seulement si le fichier n'existe pas ; sans gabarit, rien. */
function createFromTemplate(body: Record<string, unknown>): Result {
  const sc = sceneOf(body.scene);
  if ('error' in sc) return fail(sc.error);
  const g = reglages.blender.gabarit;
  if (!g) return fail('aucun gabarit de scène réglé (section Blender) : rien n’est créé');
  const c = copyTemplate(book!.info.dir, sc.id, g);
  studioJournal.note(c.message);
  book!.refresh();
  changed();
  return c.copied ? { ok: true, message: c.message } : fail(c.message);
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
// Annonces (AN2, spec-annonces.md §6, §13) : clés, brouillon, signature, publication et relecture
// ---------------------------------------------------------------------------------------------------------

interface AnnoncesEtat {
  /** Dernière signature réussie (aucune clé : identifiant, empreintes, dossier des clés). */
  signe: { date: string; keyId: string; sha256: string; taille: number; annonces: number; brouillon: string; dossierCles: string } | null;
  /** Dernière publication : relecture du flux à son adresse et verdict du vérificateur de l'app. */
  publication: { projet: string; adresse: string; date: string; sha256: string; verifie: boolean; ecarts: string[]; deploiement: string | null } | null;
}

function readAnnoncesEtat(): AnnoncesEtat {
  try {
    const raw = JSON.parse(fs.readFileSync(ANNONCES_ETAT, 'utf8'));
    return { signe: raw?.signe ?? null, publication: raw?.publication ?? null };
  } catch {
    return { signe: null, publication: null };
  }
}
const annoncesEtat: AnnoncesEtat = readAnnoncesEtat();
function saveAnnoncesEtat(): void {
  try {
    fs.mkdirSync(ANNONCES_DIR, { recursive: true });
    fs.writeFileSync(ANNONCES_ETAT, `${JSON.stringify(annoncesEtat, null, 2)}\n`);
  } catch (e) {
    studioJournal.note(`.studio/annonces/etat.json non écrit (${(e as Error).message})`);
  }
}

/** Empreinte du brouillon enregistré (signature à refaire s'il a changé depuis). */
function draftSha(): string | null {
  try {
    return sha256Hex(fs.readFileSync(ANNONCES_DRAFT));
  } catch {
    return null;
  }
}

/** Contrôle du brouillon pour la page (sans le payload construit). */
function draftControl(d: Draft) {
  const c = checkDraft(d, ANNONCES_IMAGES, todayOf(new Date()));
  return { refus: c.refus, avertissements: c.avertissements, taille: c.taille, images: c.images };
}

/** Brouillon enregistré seulement s'il change (fichier temporaire puis renommage). */
async function saveDraft(d: Draft): Promise<void> {
  const text = draftText(d);
  try {
    if (fs.readFileSync(ANNONCES_DRAFT, 'utf8') === text) return;
  } catch {
    // absent
  }
  fs.mkdirSync(ANNONCES_DIR, { recursive: true });
  await writeFileAtomic(ANNONCES_DRAFT, text);
}

/** Signature et sortie à jour : sortie signée inchangée, brouillon inchangé depuis, mêmes clés. */
function signedState(): { aJour: boolean; raison: string | null } {
  const sg = annoncesEtat.signe;
  if (!sg) return { aJour: false, raison: 'aucun flux signé' };
  const out = readSignedFeed(ANNONCES_OUT);
  if (!out || sha256Hex(out) !== sg.sha256) return { aJour: false, raison: 'flux signé absent ou modifié hors du studio : signer à nouveau' };
  if (draftSha() !== sg.brouillon) return { aJour: false, raison: 'brouillon modifié depuis la signature : signer à nouveau' };
  if (!samePath(sg.dossierCles, KEYS.dir)) return { aJour: false, raison: `flux signé avec les clés d’un autre dossier (${sg.dossierCles}) : signer à nouveau` };
  return { aJour: true, raison: null };
}

function annoncesView() {
  const cles = keysView(KEYS);
  const sv = reglages.annonces.sauvegarde;
  const textes = Object.fromEntries(Object.entries(MESSAGES).map(([l, m]) => [l, { ...m.annonces, close: m.common.close }]));
  const projet = reglages.annonces.projet;
  return {
    cles: { ...cles, sauvegarde: sv && samePath(sv.dir, KEYS.dir) ? sv.date : null },
    projet,
    adresse: projet ? publishedFeedUrl(projet) : null,
    production: PRODUCTION_FEED_URL,
    projetEssaiLivres: reglages.essai.projet,
    signe: annoncesEtat.signe ? { ...annoncesEtat.signe, ...signedState() } : null,
    publication: annoncesEtat.publication,
    aujourdhui: todayText(),
    textes,
  };
}

/** Projet Cloudflare Pages du flux d'annonces ; vide : publication refusée. Jamais le projet d'essai des livres. */
function setAnnoncesProject(body: Record<string, unknown>): Result {
  const projet = String(body.projet ?? '').trim();
  if (projet) {
    const bad = projectNameError(projet);
    if (bad) return fail(bad);
    if (projet === reglages.essai.projet) {
      return fail(`« ${projet} » est le projet d’essai des livres : la publication des annonces y remplacerait le livre publié en essai ; choisir un projet à part`);
    }
  }
  if (running(entries.annonces)) return fail('publication des annonces en cours : changer de projet après sa fin');
  reglages.annonces.projet = projet;
  saveReglages();
  changed();
  return { ok: true, message: projet ? `projet des annonces : ${projet} (${publishedFeedUrl(projet)})` : 'projet des annonces retiré : publication refusée tant qu’aucun projet n’est réglé' };
}

async function generateKeysAction(): Promise<Result> {
  const r = await generateKeys(KEYS);
  if ('error' in r) return fail(r.error);
  studioJournal.note(`annonces : clés ${r.publics.map((k) => `${k.keyId} (${KEY_ROLES[k.keyId as 'k1' | 'k2']})`).join(' et ')} générées dans ${KEYS.dir}${KEYS.essai ? ' (dossier d’essai)' : ''}`);
  changed();
  return { ok: true, message: `Clés générées dans ${KEYS.dir}. À sauvegarder maintenant (clé USB, coffre), puis écrire keys.ts.` };
}

async function writeKeysTsAction(confirmed: boolean): Promise<Result> {
  if (!KEYS.keysTs) return fail(KEYS.keysTsError ?? 'keys.ts non écrit');
  if (KEYS.dirError) return fail(KEYS.dirError);
  const publics = readPublics(KEYS.dir);
  if (!publics || publics.length !== 2) return fail(`clés publiques absentes ou illisibles dans ${KEYS.dir} : générer les clés d’abord`);
  const v = keysView(KEYS);
  if (v.keysTs.etat === 'à jour') return { ok: true, message: 'keys.ts déjà à jour : rien écrit' };
  if (!confirmed) {
    const warn = v.keysTs.etat === 'différent'
      ? 'keys.ts déclare d’autres clés : les apps déjà publiées avec ces clés ne liront plus les flux signés par les nouvelles. '
      : '';
    return {
      ok: false,
      confirm: `${warn}Écrire les clés publiques k1 (courante) et k2 (secours) dans ${KEYS.keysTs} ? Ensuite : commiter ce fichier, puis reconstruire et republier les livres (une app construite sans ces clés ne lit jamais le flux).`,
    };
  }
  await writeFileAtomic(KEYS.keysTs, keysTsText(publics, todayText()));
  studioJournal.note(`annonces : keys.ts écrit (${publics.map((k) => k.keyId).join(', ')}) : ${KEYS.keysTs}`);
  changed();
  return { ok: true, message: `keys.ts écrit (${KEYS.keysTs}) : le commiter, puis reconstruire et republier les livres` };
}

async function signAction(body: Record<string, unknown>): Promise<Result> {
  const d = draftFrom(body.brouillon);
  await saveDraft(d);
  if (running(entries.annonces)) return fail('publication des annonces en cours : signer après sa fin');
  const r = await signDraft(d, { cfg: KEYS, imagesDir: ANNONCES_IMAGES, outDir: ANNONCES_OUT });
  if (!r.ok) {
    studioJournal.note(`annonces : signature refusée : ${r.refus.map((x) => `${x.ou} : ${x.message}`).join(' ; ')}`);
    return { ok: false, error: `Signature refusée : ${r.refus.length} motif(s), voir la liste`, controle: { refus: r.refus, avertissements: r.avertissements, taille: null, images: {} } };
  }
  annoncesEtat.signe = {
    date: new Date().toISOString(), keyId: r.keyId, sha256: r.sha256, taille: r.taille, annonces: r.annonces, brouillon: draftSha() ?? '', dossierCles: KEYS.dir,
  };
  saveAnnoncesEtat();
  studioJournal.note(`annonces : flux signé par ${r.keyId} (${r.annonces} annonce(s), ${r.taille} octets, sha256 ${r.sha256.slice(0, 12)}…), vérifié par feed.ts : ${ANNONCES_OUT}`);
  changed();
  return { ok: true, message: `Flux signé par ${r.keyId} et vérifié (${r.annonces} annonce(s), ${r.taille} octets) : prêt à publier`, controle: draftControl(d) };
}

async function openKeysFolder(): Promise<Result> {
  if (KEYS.dirError) return fail(KEYS.dirError);
  if (!fs.existsSync(KEYS.dir)) return fail(`dossier des clés absent : ${KEYS.dir} (générer les clés d’abord)`);
  const r = await openFolder(KEYS.dir);
  if ('error' in r) return fail(`Dossier des clés non ouvert : ${r.error}. L’ouvrir à la main : ${KEYS.dir}`);
  return { ok: true, message: 'Dossier des clés ouvert dans l’Explorateur' };
}

/** GET /__studio/annonce-image?nom=… (sans effet) : image du brouillon, pour l'aperçu. */
function serveAnnonceImage(url: URL, res: http.ServerResponse): void {
  const nom = url.searchParams.get('nom') ?? '';
  const ext = /\.(webp|png|jpe?g)$/i.exec(nom)?.[1].toLowerCase();
  if (!ext || !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(nom)) return sendJson(res, 400, fail('nom d’image refusé'));
  try {
    const data = fs.readFileSync(path.join(ANNONCES_IMAGES, nom));
    res.writeHead(200, { 'content-type': ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg', 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    sendJson(res, 404, fail('image introuvable'));
  }
}

/**
 * Étapes de la publication des annonces : projet réglé (jamais celui des essais de livres), flux signé et à jour ; wrangler
 * connecté ; `wrangler pages deploy .studio/annonces/sortie --project-name <projet> --branch main` depuis le dossier parent du
 * repo ; puis relecture du flux à son adresse (jusqu'à une minute, le temps que Pages serve la nouvelle version) et
 * vérification par feed.ts avec les clés publiques du dossier : « publié et vérifié », ou l'écart (tâche en erreur).
 */
function annoncesSteps(): { steps: Step[] } | { error: string } {
  const projet = reglages.annonces.projet;
  if (!projet) return { error: 'aucun projet Cloudflare Pages réglé pour les annonces : le régler dans la feuille Annonces (projet créé à part)' };
  const bad = projectNameError(projet);
  if (bad) return { error: bad };
  if (projet === reglages.essai.projet) return { error: `« ${projet} » est le projet d’essai des livres : choisir un projet à part pour les annonces` };
  const st = signedState();
  if (!st.aJour) return { error: `publication refusée : ${st.raison}` };
  const sg = annoncesEtat.signe!;
  const publics = readPublics(KEYS.dir);
  if (!publics?.length) return { error: `clés publiques illisibles dans ${KEYS.dir} : relecture impossible` };
  const url = publishedFeedUrl(projet);
  let deploy: DeployResult = { termine: false, deploiement: null, alias: null };
  return {
    steps: [
      whoamiStep(),
      {
        label: `envoi des annonces vers https://${projet}.pages.dev`,
        cwd: path.dirname(ROOT),
        before: () => {
          const again = signedState();
          return again.aJour && annoncesEtat.signe?.sha256 === sg.sha256 ? null : `publication refusée : ${again.raison ?? 'flux signé à nouveau pendant la publication'}`;
        },
        launch: () => npmExec(WRANGLER_PACKAGE, 'wrangler', ['pages', 'deploy', ANNONCES_OUT, '--project-name', projet, '--branch', DEPLOY_BRANCH]),
        check: (lines) => {
          deploy = parseDeploy(lines);
          return null;
        },
        after: async () => {
          const e = entries.annonces;
          if (!deploy.termine) e.journal.note('fin du déploiement non reconnue dans la sortie de wrangler (code 0) : relecture quand même');
          if (deploy.alias) e.journal.note(`alias ${deploy.alias} : la branche ${DEPLOY_BRANCH} n’est pas la production du projet, l’adresse stable n’est pas mise à jour`);
          const expected = readSignedFeed(ANNONCES_OUT)!;
          let rb: ReadBack = { identique: false, verifie: false, ecarts: ['relecture non faite'] };
          for (let i = 1; i <= 12 && !e.stopping; i++) {
            rb = await readBack(url, expected, publics, nodeFetcher);
            e.journal.note(`relecture ${i} de ${url} : ${rb.verifie ? 'publié et vérifié' : rb.ecarts.join(' ; ')}`);
            if (rb.verifie || rb.identique) break;
            await sleep(5_000);
          }
          annoncesEtat.publication = {
            projet, adresse: url, date: new Date().toISOString(), sha256: sg.sha256, verifie: rb.verifie, ecarts: rb.ecarts,
            deploiement: deploy.deploiement ?? deploy.alias,
          };
          saveAnnoncesEtat();
          changed();
          if (!rb.verifie) return { fail: `publié, mais écart constaté à la relecture de ${url} : ${rb.ecarts.join(' ; ')}` };
          return `publié et vérifié : ${url} (flux signé par ${sg.keyId}, ${sg.annonces} annonce(s))`;
        },
      },
    ],
  };
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
    // ST2 : contrat de book.json envoyé tel quel (aucune règle recopiée dans la page), réglages de Blender.
    schema: { scenePattern: SCENE_PATTERN_SOURCE, languages: LANGUAGES },
    year: new Date().getFullYear(),
    blender: {
      exe: reglages.blender.exe,
      exeOk: !!reglages.blender.exe && !!stampOf(reglages.blender.exe),
      gabarit: reglages.blender.gabarit,
      gabaritOk: !!reglages.blender.gabarit && !!stampOf(reglages.blender.gabarit),
    },
    // ST3 : publication d'essai, réseau local (serveur de test), QR d'impression du build.
    essai: trialView(),
    reseau: { adresses: lanAddresses(os.networkInterfaces()), port: testPort() },
    impression: book?.info.bookId ? printQrs(ROOT, book.info.bookId) : { items: [], date: null },
    // MJ3 : onglets connectés à l'atelier (un atelier ouvert à la main est retrouvé) ; dernière suite complète mesurée.
    atelier: { onglets: atelierTabs },
    suite: reglages.suite,
    // AN2 : annonces (communes à tous les livres) ; aucune clé privée, seulement les clés publiques et l'état.
    annonces: annoncesView(),
  };
}

function trialView() {
  const projet = reglages.essai.projet;
  const id = book?.info.bookId ?? null;
  const pub = id ? (etat.publications[id] ?? null) : null;
  const out = etat.out;
  return {
    projet,
    adresse: projectUrl(projet),
    wrangler: WRANGLER_VERSION,
    cloudflare,
    publication: pub,
    /** out/ actuel = celui de la dernière publication de ce livre. */
    outPublie: !!pub && !!out && out.date === pub.build && samePath(out.source, pub.source),
    qr: pub && id
      ? [
          ...trialQrScenes(ROOT, id, pub.scenes ?? []).map((s) => ({ scene: s as string | null, url: `${pub.adresse}/s/${s}` })),
          // QR d'essai du mini-jeu (MJ3), si le livre publié en a un.
          ...(trialGameQrFile(ROOT, id) ? [{ scene: null, jeu: true, url: trialGameUrl(pub.projet) }] : []),
        ]
      : [],
  };
}

// ---------------------------------------------------------------------------------------------------------
// Événements (SSE)
// ---------------------------------------------------------------------------------------------------------

/**
 * Onglets connectés (flux d'événements). Correctif ST2 : un seul onglet actif ; un onglet qui se connecte remplace les autres,
 * qui reçoivent `remplace` et cessent de se reconnecter (chaque flux garde une des 6 connexions que le navigateur ouvre vers le
 * studio ; plusieurs onglets les épuisaient, et toute action restait alors en attente).
 */
const clients = new Set<http.ServerResponse>();
const tabOf = new Map<http.ServerResponse, string>();
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
  const tab = new URL(req.url ?? '/', 'http://x').searchParams.get('onglet') ?? '';
  for (const c of [...clients]) {
    if (tabOf.get(c) !== tab) {
      c.write(`event: remplace\ndata: {}\n\n`);
      studioJournal.note('studio ouvert dans un autre onglet : ancien onglet mis en veille');
    }
    clients.delete(c);
    tabOf.delete(c);
    c.end();
  }
  clients.add(res);
  tabOf.set(res, tab);
  tabSeenAt = Date.now();
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
    tabOf.delete(res);
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
    case 'lister':
      return browseList(body);
    case 'validerLivre':
      return validateForm(body);
    case 'enregistrerLivre':
      return saveBook(body);
    case 'creerLivre':
      return createBook(body);
    case 'blender':
      return setBlender(body);
    case 'detecterBlender':
      return detectBlenderAction();
    case 'ouvrirBlender':
      return openInBlender(body);
    case 'creerDepuisGabarit':
      return createFromTemplate(body);
    case 'reglerEssai':
      return setTrialProject(body);
    case 'atelierVers':
      return atelierGoTo(body);
    case 'ouvrirDossier':
      return openBookFolder();
    case 'usageIntitule':
      return cardFieldUsage(body);
    case 'usageType':
      return cardTypeUsageOf(body);
    // Annonces (AN2).
    case 'annoncesLire': {
      const d = readDraft(ANNONCES_DRAFT);
      return { ok: true, brouillon: d, controle: draftControl(d) };
    }
    case 'annoncesBrouillon': {
      const d = draftFrom(body.brouillon);
      await saveDraft(d);
      changed();
      return { ok: true, controle: draftControl(d) };
    }
    case 'annoncesImage': {
      const r = importImage(path.resolve(ROOT, unquote(body.chemin)), ANNONCES_IMAGES);
      if ('error' in r) return fail(r.error);
      return { ok: true, nom: r.nom, message: `image copiée dans le brouillon : ${r.nom}` };
    }
    case 'annoncesGenerer':
      return generateKeysAction();
    case 'annoncesKeysTs':
      return writeKeysTsAction(body.confirme === true);
    case 'annoncesSigner':
      return signAction(body);
    case 'annoncesProjet':
      return setAnnoncesProject(body);
    case 'annoncesSauvegarde':
      if (KEYS.dirError || !fs.existsSync(KEYS.dir)) return fail('aucune clé à sauvegarder');
      reglages.annonces.sauvegarde = { dir: KEYS.dir, date: Date.now() };
      saveReglages();
      changed();
      return { ok: true, message: 'sauvegarde des clés notée' };
    case 'annoncesDossierCles':
      return openKeysFolder();
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
  if (p === '/__studio/qr') {
    serveQr(url, res).catch((e: Error) => sendJson(res, 500, fail(e.message)));
    return;
  }
  if (p === '/__studio/annonce-image') return serveAnnonceImage(url, res);
  if (p === '/__studio/ping') {
    // Second lancement (point ajouté à la clôture de ST1) : la page n'est rouverte que si aucun onglet n'est connecté ;
    // sinon, les onglets connectés l'annoncent.
    const onglets = clients.size;
    if (url.searchParams.get('second') === '1') {
      studioJournal.note(
        onglets
          ? `second lancement du studio : ${onglets} onglet(s) déjà connecté(s), pas de nouvel onglet ni de second studio`
          : 'second lancement du studio : aucun onglet connecté, page rouverte ; pas de second studio',
      );
      if (onglets) send('second', { at: Date.now() });
    }
    return sendJson(res, 200, { studio: STUDIO_MARKER, pid: process.pid, root: ROOT, onglets });
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
  const ping = await new Promise<{ studio?: string; pid?: number; onglets?: number } | null>((resolve) => {
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
    if (ping.onglets) {
      console.log(`studio : déjà lancé (PID ${ping.pid}), page http://${HOST}:${p}/ déjà ouverte dans un onglet (pas de nouvel onglet) ; cette fenêtre se ferme dans 5 s`);
    } else {
      console.log(`studio : déjà lancé (PID ${ping.pid}) : page http://${HOST}:${p}/ ouverte dans le navigateur ; cette fenêtre se ferme dans 5 s`);
      openBrowser(`http://${HOST}:${p}/`);
    }
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
  // Annonces (AN2) : dossier des clés d'essai annoncé ; dossier refusé (dans le repo) signalé.
  if (KEYS.essai) studioJournal.note(`annonces : clés d’ESSAI (${'GLBI_ANNONCES_CLES'}) : ${KEYS.dir} ; keys.ts : ${KEYS.keysTs ?? `non écrit (${KEYS.keysTsError})`}`);
  if (KEYS.dirError) studioJournal.note(`annonces : ${KEYS.dirError}`);
  // Blender (ST2, §8) : chemin détecté au premier lancement, puis modifiable dans la page.
  if (!reglages.blender.detecte) {
    reglages.blender.detecte = true;
    if (!reglages.blender.exe) reglages.blender.exe = detectBlender();
    if (reglages.blender.exe) studioJournal.note(`Blender détecté : ${reglages.blender.exe}`);
    saveReglages();
  }
  // Livre ouvert au dernier lancement (aucun processus démarré).
  const last = reglages.recents[0];
  if (last) {
    const r = resolveBookDir(last, ROOT);
    if (!('error' in r)) {
      book = new OpenBook(r.dir, null);
      restoreCheck();
    }
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
    void pollAtelierTabs();
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
