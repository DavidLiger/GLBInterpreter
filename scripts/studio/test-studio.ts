// scripts/studio/test-studio.ts — tests sans navigateur du studio (ST1) : `npm run test:studio`.
// Règles pures (protection des requêtes, état des sorties, journaux, rapport de book:check), puis fichiers sur un dossier
// temporaire (dossier réservé blender/, fichier le plus récent, ouverture d'un livre, casse réelle).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listSourceFiles } from '../book-check';
import { newestSourceFile, OpenBook, resolveBookDir } from './book';
import {
  actionAllowed,
  commandMentions,
  findLeftovers,
  hostAllowed,
  journalsToDelete,
  outputVerdict,
  samePath,
  splitLines,
  summarizeReport,
  type OutputRecord,
  type ProcRow,
} from './rules';

let n = 0;
function test(name: string, fn: () => void): void {
  fn();
  n++;
  console.log(`  ok  ${name}`);
}

console.log('test:studio — studio de fabrication (ST1)');

test('Host et Origin : 127.0.0.1 et localhost du port seulement', () => {
  assert.equal(hostAllowed('127.0.0.1:4000', undefined, 4000), true);
  assert.equal(hostAllowed('localhost:4000', 'http://localhost:4000', 4000), true);
  assert.equal(hostAllowed('LOCALHOST:4000', 'http://127.0.0.1:4000', 4000), true);
  assert.equal(hostAllowed('evil.example:4000', undefined, 4000), false, 'rebinding DNS');
  assert.equal(hostAllowed('127.0.0.1', undefined, 4000), false, 'port absent');
  assert.equal(hostAllowed('127.0.0.1:4001', undefined, 4000), false);
  assert.equal(hostAllowed(undefined, undefined, 4000), false);
  assert.equal(hostAllowed('127.0.0.1:4000', 'http://evil.example', 4000), false, 'autre origine');
  assert.equal(hostAllowed('127.0.0.1:4000', 'null', 4000), false, 'origine opaque');
  assert.equal(hostAllowed('127.0.0.1:4000', 'https://127.0.0.1:4000', 4000), false);
});

test('action : POST JSON, en-tête du studio, Origin du studio', () => {
  const ok = { method: 'POST', contentType: 'application/json', studioHeader: '1', origin: 'http://127.0.0.1:4000', host: '127.0.0.1:4000' };
  assert.equal(actionAllowed(ok, 4000), true);
  assert.equal(actionAllowed({ ...ok, contentType: 'application/json; charset=utf-8' }, 4000), true);
  assert.equal(actionAllowed({ ...ok, method: 'GET' }, 4000), false);
  assert.equal(actionAllowed({ ...ok, contentType: 'text/plain' }, 4000), false, 'formulaire simple d’un autre site');
  assert.equal(actionAllowed({ ...ok, studioHeader: undefined }, 4000), false);
  assert.equal(actionAllowed({ ...ok, origin: undefined }, 4000), false);
  assert.equal(actionAllowed({ ...ok, origin: 'http://evil.example' }, 4000), false);
});

test('chemins : casse ignorée sous Windows seulement ; ligne de commande qui cite le repo', () => {
  assert.equal(samePath('D:\\GLBInterpreter\\glbinterpreter', 'd:/glbinterpreter/GLBINTERPRETER/', true), true);
  assert.equal(samePath('/home/a/Repo', '/home/a/repo', false), false);
  const root = 'D:\\GLBInterpreter\\glbinterpreter';
  assert.equal(commandMentions('"C:\\Program Files\\nodejs\\node.exe" npm-cli.js --prefix D:\\GLBInterpreter\\glbinterpreter run atelier', root, true), true);
  assert.equal(commandMentions('node d:/glbinterpreter/glbinterpreter/node_modules/next/dist/bin/next dev', root, true), true);
  assert.equal(commandMentions('node C:\\autre\\server.js', root, true), false);
});

test('état de out/ : absent, inconnu, livre de test, autre livre, périmé, à jour', () => {
  const t0 = Date.parse('2026-10-18T10:00:00Z');
  const rec: OutputRecord = {
    bookId: 'dino', source: 'D:\\Livres\\dino', mode: 'normal', date: new Date(t0).toISOString(),
    commit: 'abc1234', modifie: false, stamp: { size: 100, mtime: t0 + 60_000 },
  };
  const open = { source: 'd:\\livres\\DINO', bookId: 'dino' };
  const stamp = { size: 100, mtime: t0 + 60_000 };
  const before = { rel: 'scenes/trex.edit.json', mtime: t0 - 1000 };
  assert.equal(outputVerdict('out/', rec, null, open, before, true).problem, 'absent');
  assert.equal(outputVerdict('out/', rec, { size: 101, mtime: stamp.mtime }, open, before, true).problem, 'inconnu', 'build hors du studio');
  assert.equal(outputVerdict('out/', null, stamp, open, before, true).problem, 'inconnu');
  assert.equal(outputVerdict('out/', { ...rec, mode: 'livre de test' }, stamp, open, before, true).problem, 'test');
  assert.equal(outputVerdict('out/', rec, stamp, { source: 'D:\\Livres\\autre', bookId: 'autre' }, before, true).problem, 'autre');
  assert.equal(outputVerdict('out/', rec, stamp, null, before, true).problem, 'autre');
  const stale = outputVerdict('out/', rec, stamp, open, { rel: 'sounds/roar.mp3', mtime: t0 + 5000 }, true);
  assert.equal(stale.problem, 'perime');
  assert.match(stale.message, /sounds\/roar\.mp3 modifié le/);
  const ok = outputVerdict('out/', rec, stamp, open, before, true);
  assert.equal(ok.ok, true, ok.message);
});

test('journal : lignes découpées (fin incomplète gardée, couleurs retirées), 10 fichiers gardés par nom', () => {
  let r = splitLines('', 'a\r\nb\x1b[32mvert\x1b[39m\npartie');
  assert.deepEqual(r.lines, ['a', 'bvert']);
  assert.equal(r.partial, 'partie');
  r = splitLines(r.partial, ' fin\n\n');
  assert.deepEqual(r.lines, ['partie fin']);
  const files = Array.from({ length: 12 }, (_, i) => `build-20261018-1000${String(i).padStart(2, '0')}.log`);
  files.push('dev-20261018-100000.log', 'build-dev-20261018-100000.log');
  assert.deepEqual(journalsToDelete(files, 'build', 10), ['build-20261018-100000.log', 'build-20261018-100001.log']);
  assert.deepEqual(journalsToDelete(files, 'dev', 10), []);
});

test('rapport de book:check : résumé par scène et lignes du livre', () => {
  const s = summarizeReport({
    ok: false,
    lines: [
      { level: 'error', origin: 'edit', scene: 'trex', message: 'a' },
      { level: 'warning', origin: 'build', scene: 'trex', message: 'b' },
      { level: 'warning', origin: 'build', scene: null, message: 'fichier(s) source non référencé(s)' },
    ],
  });
  assert.ok(s);
  assert.equal(s.ok, false);
  assert.deepEqual(s.perScene, { trex: { errors: 1, warnings: 1 } });
  assert.equal(s.bookLines.length, 1);
  assert.equal(summarizeReport(null), null);
});

test('dossier source : blender/ ni listé ni compté dans le fichier le plus récent ; ouverture d’un livre', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glbi-studio-'));
  try {
    fs.mkdirSync(path.join(dir, 'scenes'));
    fs.mkdirSync(path.join(dir, 'blender/textures'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify({ bookId: 'essai', scenes: ['trex'], title: { fr: 'Essai' } }));
    fs.writeFileSync(path.join(dir, 'scenes/trex.glb'), 'x');
    const old = Date.now() / 1000 - 3600;
    fs.utimesSync(path.join(dir, 'scenes/trex.glb'), old, old);
    fs.utimesSync(path.join(dir, 'book.json'), old, old);
    fs.writeFileSync(path.join(dir, 'blender/trex.blend'), 'b');
    fs.writeFileSync(path.join(dir, 'blender/trex.blend1'), 'b');
    fs.writeFileSync(path.join(dir, 'blender/textures/peau.png'), 'p');
    fs.writeFileSync(path.join(dir, 'scenes/.trex.edit.json.123.tmp'), 't');
    assert.deepEqual(listSourceFiles(dir), ['book.json', 'scenes/.trex.edit.json.123.tmp', 'scenes/trex.glb']);
    assert.equal(newestSourceFile(dir)?.rel, 'book.json', 'blender/ et fichiers cachés ignorés');

    const opened = resolveBookDir(dir, '/');
    assert.ok(!('error' in opened));
    const b = new OpenBook(opened.dir, null);
    assert.equal(b.info.bookId, 'essai');
    assert.deepEqual(b.info.scenes.map((s) => [s.id, s.glb.present, s.edit.present, s.blend.present]), [['trex', true, false, true]]);
    assert.ok(b.info.errors.length > 0, 'book.json incomplet : messages de bookSchema');
    assert.ok('error' in resolveBookDir(path.join(dir, 'scenes'), '/'), 'dossier sans book.json refusé');
    assert.ok('error' in resolveBookDir(path.join(dir, 'absent'), '/'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('restes : branches descendant d’un PID noté (parent mort compris), studio courant exclu, PID réutilisé écarté', () => {
  const root = 'D:\\GLBInterpreter\\glbinterpreter';
  const T = 1_000_000;
  const P = (pid: number, ppid: number, start: number | null, command: string): ProcRow => ({ pid, ppid, pgid: null, start, command, cwd: null });
  const procs: ProcRow[] = [
    // ancien studio (100) tué ; npm de l'atelier (200) mort ; restent cmd 300 → tsx 301 → serveur 302 → next 303
    P(300, 200, T + 1_000, 'C:\\WINDOWS\\system32\\cmd.exe /d /s /c tsx scripts/atelier/server.ts --source D:\\Livres\\dino'),
    P(301, 300, T + 1_100, 'node D:\\GLBInterpreter\\glbinterpreter\\node_modules\\tsx\\dist\\cli.mjs scripts/atelier/server.ts'),
    P(302, 301, T + 1_200, 'node --import file:///D:/GLBInterpreter/glbinterpreter/node_modules/tsx/dist/loader.mjs scripts/atelier/server.ts'),
    P(303, 302, T + 5_000, 'node D:\\GLBInterpreter\\glbinterpreter\\node_modules\\next\\dist\\bin\\next dev'),
    // serveur de test (400) encore vivant lui-même
    P(400, 100, T + 2_000, 'node D:\\GLBInterpreter\\glbinterpreter\\node_modules\\http-server\\bin\\http-server D:\\GLBInterpreter\\glbinterpreter\\out -p 8001 -c-1'),
    // PID 500 noté mais réutilisé par un programme lancé AVANT l'entrée notée : écarté
    P(500, 1, T - 60_000, 'node D:\\GLBInterpreter\\glbinterpreter\\x.js'),
    // branche sans rapport avec le repo
    P(600, 100, T + 3_000, 'C:\\Windows\\notepad.exe'),
    // studio courant (900), lancé par npm (800) dont le PID réutilise celui de l'ancien serveur de dev noté (800)
    P(800, 1, T + 90_000, 'node npm-cli.js run studio'),
    P(900, 800, T + 91_000, 'node scripts/studio/server.ts'),
  ];
  const recorded = [
    { pid: 100, nom: 'studio', debut: T },
    { pid: 200, nom: 'atelier', debut: T + 900 },
    { pid: 400, nom: 'serveur-test', debut: T + 2_000 },
    { pid: 500, nom: 'dev', debut: T },
    { pid: 800, nom: 'dev', debut: T + 10 },
  ];
  const r = findLeftovers(procs, recorded, root, 900, true);
  assert.equal(r.liveStudio, null);
  assert.deepEqual(r.leftovers.map((x) => [x.pid, x.nom, x.count]), [[300, 'atelier', 4], [400, 'serveur-test', 1]]);
  assert.match(r.leftovers[0].command, /tsx/, 'ligne affichée : un processus qui cite le repo');
  // Studio noté encore vivant (autre port) : rien n'est proposé.
  const live = findLeftovers([...procs, P(100, 1, T + 10, 'node D:\\GLBInterpreter\\glbinterpreter\\scripts\\studio\\server.ts')], recorded, root, 900, true);
  assert.equal(live.liveStudio, 100);
  assert.deepEqual(live.leftovers, []);
  // Hors Windows : enfant rattaché à init, retrouvé par son groupe.
  const lin = findLeftovers(
    [{ pid: 700, ppid: 1, pgid: 200, start: T + 1_500, command: 'next-server (v16)', cwd: '/home/d/glbinterpreter' }],
    [{ pid: 200, nom: 'atelier', debut: T + 900 }],
    '/home/d/glbinterpreter',
    900,
    false,
  );
  assert.deepEqual(lin.leftovers.map((x) => [x.pid, x.group]), [[700, 200]]);
});

console.log(`test:studio : ${n} test(s) réussi(s)`);
