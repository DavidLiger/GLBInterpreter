// scripts/atelier/server.ts — serveur de l'atelier de configuration (piste A, A2 ; spec-atelier-glbi.md §9).
//
//   npm run atelier -- --source <dossier du livre> [--port 4100] [--no-open]
//
// Seul point d'entrée du navigateur : http://127.0.0.1:<port>/atelier/ (écoute sur 127.0.0.1 seulement). Lance `next dev`
// avec ATELIER=1 (page src/app/atelier/page.atelier.tsx, exclue de tout build) sur le port suivant libre, puis :
//   /atelier/__api/…       API en lecture seule (A2) : livre, scène (couches, fusion `draft`, rapport, diagnostic), événements
//   /atelier/<fichier>     fichier du dossier source s'il existe (scenes/<id>.glb, sounds/…, images/…) ; sinon transmis à
//                          `next dev` comme /<fichier> (public/ : décodeurs, police, icônes de l'interface)
//   le reste               transmis à `next dev` (page, /_next/…, WebSocket du rechargement à chaud)
// Les chemins relatifs de la configuration se résolvent depuis /atelier/ comme dans le livre publié (D-8.1 inchangée).
//
// Aucune écriture en A2 : ni le dossier source, ni le GLB. Le dossier source est scruté toutes les 500 ms ; un fichier
// modifié est pris en compte quand sa taille et sa date n'ont pas bougé pendant deux relevés (un GLB, en plus, quand son
// en-tête annonce la taille du fichier : écriture par Blender terminée). Le rapport est alors recalculé et la page prévenue.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { checkBookSource, listFiles, Report, ROOT, toPosix } from '../book-check';
import { checkSchemaFresh } from '../export-schema';
import { mergeLayers } from '../../src/schema/merge';
import type { BuiltScene, ModelCredit } from '../../src/schema/glbi';
import type { AtelierScene, BookResponse, ChangeEvent, ReportLine, SceneResponse } from '../../src/atelier/api';
import { diagnoseGlb } from './diagnose';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4100;
const BASE = '/atelier/';
const API = '/atelier/__api/';
const SCAN_MS = 500;
/** Relevés identiques requis avant de prendre un fichier modifié en compte. */
const STABLE_SCANS = 2;
/** Au-delà, un GLB dont l'en-tête ne correspond toujours pas à la taille est pris en compte (rapport : illisible). */
const GLB_WAIT_MS = 60_000;

// ---------------------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------------------

interface Options {
  source: string;
  port: number;
  open: boolean;
}

function parseArgs(argv: string[]): Options {
  let source: string | null = null;
  let port = DEFAULT_PORT;
  let open = true;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (!v) throw new Error(`option ${a} : valeur manquante`);
      return v;
    };
    if (a === '--source') source = next();
    else if (a === '--port') {
      port = Number(next());
      if (!Number.isInteger(port) || port < 1024 || port > 65534) throw new Error('--port : entier entre 1024 et 65534 attendu');
    } else if (a === '--no-open') open = false;
    else throw new Error(`option inconnue « ${a} » (options : --source <dossier>, --port <n>, --no-open)`);
  }
  if (!source) throw new Error('--source <dossier du livre> obligatoire (ex. npm run atelier -- --source books/test-dino)');
  return { source: path.resolve(process.cwd(), source), port, open };
}

// ---------------------------------------------------------------------------------------------------------
// État du livre (relu à chaque modification du dossier source)
// ---------------------------------------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

interface BookState {
  response: BookResponse;
  /** Lignes du rapport, pour le filtre par scène. */
  report: ReportLine[];
}

let sourceDir = '';
let generation = 0;
let bookState: BookState | null = null;
const sceneCache = new Map<string, { generation: number; value: Promise<SceneResponse> }>();

function readJsonLoose(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Rapport du livre entier : mêmes contrôles, même ordre et mêmes textes que `npm run book:check -- --source <dossier>`. */
async function computeBook(): Promise<BookState> {
  const report = new Report();
  const stale = checkSchemaFresh();
  if (stale) report.error(stale);
  const checked = await checkBookSource(sourceDir, report);
  const summary =
    report.errors.length || !checked
      ? `build-book : ${report.errors.length} erreur(s), ${report.warnings.length} avertissement(s). Rien n'a été écrit.`
      : `build-book : livre « ${checked.book.bookId} » valide (${checked.scenes.length} scène(s), ${report.warnings.length} avertissement(s))`;

  const files = fs.existsSync(sourceDir) ? listFiles(sourceDir) : [];
  const rawBook = readJsonLoose(path.join(sourceDir, 'book.json'));
  const bookScenes = isObj(rawBook) && Array.isArray(rawBook.scenes) ? rawBook.scenes.filter((s): s is string => typeof s === 'string') : [];
  const scenes: AtelierScene[] = bookScenes.map((id) => ({ id, inBook: true }));
  for (const f of files) {
    const m = /^scenes\/([^/]+)\.glb$/i.exec(f);
    if (m && !bookScenes.includes(m[1])) scenes.push({ id: m[1], inBook: false });
  }
  const assets: Record<string, string[]> = {};
  for (const f of files) {
    const dir = f.includes('/') ? f.slice(0, f.indexOf('/')) : '.';
    (assets[dir] ??= []).push(f);
  }

  const lines = report.lines as ReportLine[];
  return {
    report: lines,
    response: {
      source: toPosix(sourceDir),
      book: isObj(rawBook) ? (rawBook as BookResponse['book']) : null,
      scenes,
      assets,
      report: lines,
      summary,
      generation,
    },
  };
}

function dedupeCredits(list: { credit: ModelCredit }[]): ModelCredit[] {
  const out = new Map<string, ModelCredit>();
  for (const { credit: c } of list) {
    const key = JSON.stringify([c.name, c.author, c.license, c.url]);
    if (!out.has(key)) out.set(key, c);
  }
  return [...out.values()];
}

async function computeScene(id: string, state: BookState): Promise<SceneResponse> {
  const glbRel = `scenes/${id}.glb`;
  const glbFile = path.join(sourceDir, glbRel);
  const editFile = path.join(sourceDir, `scenes/${id}.edit.json`);
  const { diagnostic, raw3d } = await diagnoseGlb(glbFile);
  const rawEdit = fs.existsSync(editFile) ? readJsonLoose(editFile) : undefined;
  const editUsable = isObj(rawEdit) ? rawEdit : undefined;

  let draft: BuiltScene | null = null;
  let orphans: string[] = [];
  let editIgnored = fs.existsSync(editFile) && !editUsable;
  if (raw3d !== undefined) {
    // Fusion `draft` (src/schema/merge.ts) : objet affichable malgré les erreurs (libellés manquants remplacés par les `id`).
    const m = mergeLayers(raw3d, editUsable, { mode: 'draft', sceneId: id, glbiVersion: diagnostic.glbiVersion });
    orphans = m.orphans;
    editIgnored ||= editUsable !== undefined && m.edit === null;
    if (m.draft) draft = { ...m.draft, build: { glb: glbRel, modelCredits: dedupeCredits(diagnostic.srcCredits) } };
  }
  return {
    id,
    inBook: state.response.scenes.some((s) => s.id === id && s.inBook),
    glb: glbRel,
    glbMtime: fs.existsSync(glbFile) ? fs.statSync(glbFile).mtimeMs : null,
    layer3d: raw3d ?? null,
    edit: rawEdit ?? null,
    draft,
    orphans,
    editIgnored,
    report: state.report.filter((l) => l.scene === id),
    diagnostic,
    generation,
  };
}

/** Recalculs sérialisés : une modification pendant un calcul en relance un seul à la fin. */
let computing: Promise<void> | null = null;
let recomputeWanted = false;

async function recompute(): Promise<void> {
  if (computing) {
    recomputeWanted = true;
    return computing;
  }
  computing = (async () => {
    do {
      recomputeWanted = false;
      generation++;
      sceneCache.clear();
      try {
        bookState = await computeBook();
      } catch (e) {
        console.error('atelier : relecture du livre impossible', e);
      }
    } while (recomputeWanted);
  })();
  try {
    await computing;
  } finally {
    computing = null;
  }
}

async function currentBook(): Promise<BookState> {
  if (computing) await computing;
  if (!bookState) await recompute();
  return bookState!;
}

async function sceneResponse(id: string): Promise<SceneResponse> {
  const state = await currentBook();
  const hit = sceneCache.get(id);
  if (hit && hit.generation === generation) return hit.value;
  const value = computeScene(id, state);
  sceneCache.set(id, { generation, value });
  value.catch(() => sceneCache.delete(id));
  return value;
}

// ---------------------------------------------------------------------------------------------------------
// Surveillance du dossier source (scrutation : même comportement sous Windows, Linux et macOS)
// ---------------------------------------------------------------------------------------------------------

type Stamp = { size: number; mtime: number };
const known = new Map<string, Stamp>();
const pending = new Map<string, { stamp: Stamp | null; same: number; since: number }>();

function snapshot(): Map<string, Stamp> {
  const snap = new Map<string, Stamp>();
  if (!fs.existsSync(sourceDir)) return snap;
  for (const rel of listFiles(sourceDir)) {
    try {
      const st = fs.statSync(path.join(sourceDir, rel));
      snap.set(rel, { size: st.size, mtime: st.mtimeMs });
    } catch {
      // supprimé entre la liste et le stat : vu au relevé suivant
    }
  }
  return snap;
}

const sameStamp = (a: Stamp | null | undefined, b: Stamp | null | undefined) =>
  (!a && !b) || (!!a && !!b && a.size === b.size && a.mtime === b.mtime);

/** GLB complet : l'en-tête (magic `glTF`, longueur totale) annonce la taille réelle du fichier. */
function glbComplete(rel: string, size: number): boolean {
  try {
    const fd = fs.openSync(path.join(sourceDir, rel), 'r');
    try {
      const h = Buffer.alloc(12);
      if (fs.readSync(fd, h, 0, 12, 0) < 12) return false;
      return h.toString('latin1', 0, 4) === 'glTF' && h.readUInt32LE(8) === size;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

function scan(): void {
  const snap = snapshot();
  const now = Date.now();
  for (const rel of new Set([...snap.keys(), ...known.keys(), ...pending.keys()])) {
    const cur = snap.get(rel) ?? null;
    if (sameStamp(cur, known.get(rel)) && !pending.has(rel)) continue;
    const p = pending.get(rel);
    if (!p || !sameStamp(p.stamp, cur)) pending.set(rel, { stamp: cur, same: 0, since: p?.since ?? now });
    else p.same++;
  }
  const ready: string[] = [];
  for (const [rel, p] of pending) {
    if (p.same < STABLE_SCANS - 1) continue;
    if (p.stamp && /\.glb$/i.test(rel) && !glbComplete(rel, p.stamp.size) && now - p.since < GLB_WAIT_MS) continue;
    ready.push(rel);
  }
  if (!ready.length) return;
  for (const rel of ready) {
    const p = pending.get(rel)!;
    pending.delete(rel);
    if (sameStamp(p.stamp, known.get(rel))) continue; // revenu à l'état connu
    if (p.stamp) known.set(rel, p.stamp);
    else known.delete(rel);
  }
  const changed = ready.sort();
  console.log(`atelier : modifié : ${changed.join(', ')}`);
  void recompute().then(() => broadcast({ files: changed, generation }));
}

// ---------------------------------------------------------------------------------------------------------
// Événements (SSE)
// ---------------------------------------------------------------------------------------------------------

const clients = new Set<http.ServerResponse>();

function broadcast(e: ChangeEvent): void {
  const msg = `event: change\ndata: ${JSON.stringify(e)}\n\n`;
  for (const c of clients) c.write(msg);
}

function events(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
  res.write(`event: hello\ndata: ${JSON.stringify({ generation })}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
}

// ---------------------------------------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------------------------------------

const TYPES: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** Fichier du dossier source désigné par `rel` (décodé), ou `null` (absent, dossier, ou hors du dossier source). */
function sourceFile(rel: string): string | null {
  if (!rel || rel.includes('\0')) return null;
  const full = path.resolve(sourceDir, rel);
  if (full !== sourceDir && !full.startsWith(sourceDir + path.sep)) return null;
  try {
    return fs.statSync(full).isFile() ? full : null;
  } catch {
    return null;
  }
}

/** Fichier du dossier source, sans cache (un réexport doit être relu), avec les requêtes `Range` (sons). */
function serveFile(req: http.IncomingMessage, res: http.ServerResponse, full: string): void {
  const size = fs.statSync(full).size;
  const headers: Record<string, string | number> = {
    'content-type': TYPES[path.extname(full).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-store',
    'accept-ranges': 'bytes',
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) {
      res.writeHead(416, { 'content-range': `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(full, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'content-length': size });
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(full).pipe(res);
}

let nextPort = 0;

function proxy(req: http.IncomingMessage, res: http.ServerResponse, url: string): void {
  const p = http.request({ host: HOST, port: nextPort, method: req.method, path: url, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  p.on('error', () => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="2"><p style="font-family:sans-serif">next dev démarre… (rechargement automatique)</p>');
  });
  req.pipe(p);
}

async function api(req: http.IncomingMessage, res: http.ServerResponse, route: string): Promise<void> {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'lecture seule (A2)' });
  if (route === 'book') return sendJson(res, 200, (await currentBook()).response);
  if (route === 'events') return events(req, res);
  const m = /^scene\/([^/]+)$/.exec(route);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const state = await currentBook();
    if (!state.response.scenes.some((s) => s.id === id)) return sendJson(res, 404, { error: `scène « ${id} » inconnue` });
    return sendJson(res, 200, await sceneResponse(id));
  }
  sendJson(res, 404, { error: `API inconnue : ${route}` });
}

function handle(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = req.url ?? '/';
  const q = url.indexOf('?');
  const pathname = q < 0 ? url : url.slice(0, q);
  const query = q < 0 ? '' : url.slice(q);
  if (pathname === '/') {
    res.writeHead(302, { location: BASE });
    res.end();
    return;
  }
  if (pathname === '/atelier') {
    res.writeHead(308, { location: BASE + query });
    res.end();
    return;
  }
  if (pathname.startsWith(API)) {
    api(req, res, pathname.slice(API.length)).catch((e: Error) => {
      console.error('atelier : API', e);
      if (!res.headersSent) sendJson(res, 500, { error: e.message });
      else res.end();
    });
    return;
  }
  if (pathname.startsWith(BASE) && pathname !== BASE) {
    let rel: string;
    try {
      rel = decodeURIComponent(pathname.slice(BASE.length));
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    const file = sourceFile(rel);
    if (file) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET, HEAD' });
        res.end();
        return;
      }
      return serveFile(req, res, file);
    }
    // Pas dans le dossier source : fichier de l'application (public/ : décodeurs, police, icônes de l'interface).
    return proxy(req, res, `/${pathname.slice(BASE.length)}${query}`);
  }
  proxy(req, res, url);
}

/** WebSocket (rechargement à chaud de `next dev`, /_next/webpack-hmr) : relais brut vers `next dev`. */
function upgrade(req: http.IncomingMessage, socket: net.Socket, head: Buffer): void {
  const up = net.connect(nextPort, HOST, () => {
    let h = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) h += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    up.write(`${h}\r\n`);
    if (head?.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
}

// ---------------------------------------------------------------------------------------------------------
// Lancement
// ---------------------------------------------------------------------------------------------------------

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(port, HOST, () => s.close(() => resolve(true)));
  });
}

async function freePortAfter(port: number): Promise<number> {
  for (let p = port + 1; p < port + 50; p++) if (await portFree(p)) return p;
  throw new Error(`aucun port libre après ${port} pour next dev`);
}

let child: ChildProcess | null = null;

function stopChild(): void {
  if (!child || child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGTERM');
}

function startNext(port: number): ChildProcess {
  const require = createRequire(import.meta.url);
  const nextBin = require.resolve('next/dist/bin/next', { paths: [ROOT] });
  const c = spawn(process.execPath, [nextBin, 'dev', '-H', HOST, '-p', String(port)], {
    cwd: ROOT,
    env: { ...process.env, ATELIER: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const relay = (s: NodeJS.ReadableStream | null, out: NodeJS.WriteStream) =>
    s?.on('data', (d: Buffer) => {
      for (const line of d.toString().split(/\r?\n/)) if (line.trim()) out.write(`[next] ${line}\n`);
    });
  relay(c.stdout, process.stdout);
  relay(c.stderr, process.stderr);
  c.on('exit', (code) => {
    console.error(`atelier : next dev s'est arrêté (code ${code}) ; arrêt de l'atelier (un seul atelier à la fois par copie du repo)`);
    process.exit(code ?? 1);
  });
  return c;
}

function waitReady(url: string, timeoutMs = 180_000): Promise<boolean> {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const tryOnce = () => {
      http
        .get(url, (r) => {
          r.resume();
          if (r.statusCode === 200) resolve(true);
          else if (Date.now() - t0 > timeoutMs) resolve(false);
          else setTimeout(tryOnce, 1000);
        })
        .on('error', () => (Date.now() - t0 > timeoutMs ? resolve(false) : setTimeout(tryOnce, 1000)));
    };
    tryOnce();
  });
}

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const p = spawn(cmd, args as string[], { stdio: 'ignore', detached: true });
  p.on('error', () => console.log(`atelier : ouvrir ${url} dans le navigateur`));
  p.unref();
}

async function main(): Promise<void> {
  let opts: Options;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`atelier : ${(e as Error).message}`);
    process.exit(2);
  }
  sourceDir = opts.source;
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    console.error(`atelier : dossier source introuvable : ${toPosix(sourceDir)}`);
    process.exit(2);
  }
  if (!(await portFree(opts.port))) {
    console.error(`atelier : le port ${opts.port} est déjà utilisé (atelier déjà lancé ?) ; choisir un autre port avec --port`);
    process.exit(2);
  }
  // Décodeurs de public/decoders/ (hook `predev` de `npm run dev`, non exécuté ici).
  await import('../copy-decoders');

  for (const [rel, stamp] of snapshot()) known.set(rel, stamp);
  await recompute();
  nextPort = await freePortAfter(opts.port);

  const server = http.createServer(handle);
  server.on('upgrade', upgrade);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, HOST, resolve);
  });
  child = startNext(nextPort);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.on(sig, () => {
      stopChild();
      process.exit(0);
    });
  }
  process.on('exit', stopChild);
  setInterval(scan, SCAN_MS).unref();

  const url = `http://${HOST}:${opts.port}${BASE}`;
  const s = bookState?.response;
  console.log(`atelier : livre ${toPosix(sourceDir)} (${s?.scenes.length ?? 0} scène(s)) ; ${s?.summary ?? ''}`);
  console.log(`atelier : ${url} (next dev sur le port ${nextPort}, lecture seule ; Ctrl+C pour arrêter)`);
  if (await waitReady(url)) {
    console.log('atelier : prêt');
    if (opts.open) openBrowser(url);
  } else {
    console.error(`atelier : next dev ne répond pas sur ${url}`);
  }
}

main().catch((e) => {
  console.error('atelier : échec inattendu', e);
  stopChild();
  process.exit(1);
});
