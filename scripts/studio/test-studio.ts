// scripts/studio/test-studio.ts — tests sans navigateur du studio (ST1, ST2) : `npm run test:studio`.
// Règles pures (protection des requêtes, état des sorties, journaux, rapport de book:check), puis fichiers sur un dossier
// temporaire (dossier réservé blender/, fichier le plus récent, ouverture d'un livre, casse réelle).
// ST2 : forme écrite de book.json (ordre des clés, octet pour octet), formulaire, champs conservés, gabarit sans écraser,
// version de Blender la plus récente, nom de dossier d'un nouveau livre.
// ST3 : nom du projet Pages, sorties de wrangler (whoami, pages deploy), adresses du réseau local, QR d'essai et d'impression,
// réglages et état (projet par défaut, publications).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listSourceFiles } from '../book-check';
import { copyTemplate, listDir, newestSourceFile, OpenBook, readEtat, readReglages, resolveBookDir, walkSource, writeFileAtomic } from './book';
import {
  DEFAULT_PROJECT,
  lanAddresses,
  lanSceneUrl,
  parseDeploy,
  parseWhoami,
  printQrs,
  printQrScene,
  projectNameError,
  trialQrFile,
  trialQrScenes,
  trialSceneUrl,
  writeTrialQrs,
} from './essai';
import {
  addedScenes,
  composeBook,
  emptyForm,
  folderNameError,
  formatBook,
  formFromBody,
  pickBlenderDir,
  readableBook,
  SCENE_PATTERN_SOURCE,
  validateBook,
  visibleValue,
  withReceivedValues,
} from './bookjson';
import { SCENE_ID_PATTERN } from '../../src/schema/glbi';
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
const pending: Promise<void>[] = [];
function test(name: string, fn: () => void | Promise<void>): void {
  const r = fn();
  const ok = () => {
    n++;
    console.log(`  ok  ${name}`);
  };
  if (r instanceof Promise) pending.push(r.then(ok));
  else ok();
}

console.log('test:studio — studio de fabrication (ST1, ST2, ST3)');

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
  // ST4 : toutes les lignes, dans l'ordre du rapport (classées par outil dans la page).
  assert.deepEqual(s.lines.map((l) => [l.level, l.origin, l.scene, l.message]), [
    ['error', 'edit', 'trex', 'a'],
    ['warning', 'build', 'trex', 'b'],
    ['warning', 'build', null, 'fichier(s) source non référencé(s)'],
  ]);
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

// ---------------------------------------------------------------------------------------------------------
// ST2 : book.json, gabarit, Blender
// ---------------------------------------------------------------------------------------------------------

const L = (fr: string, en: string, es: string) => ({ fr, en, es });
const sampleBook = {
  bookId: 'test-dino',
  title: L('Dinos de test', 'Test dinos', 'Dinos de prueba'),
  languages: ['fr', 'en', 'es'],
  scenes: ['trex', 'raptor', 'ptero'],
  origin: 'https://dino.editions-liger.com',
  ogImage: 'images/og.png',
  legal: { year: 2026, text: L('© Éditions Liger', '© Éditions Liger', '© Éditions Liger') },
};

test('book.json : forme écrite identique à JSON.stringify(…, 2) dans l’ordre de bookSchema ; accents non échappés', () => {
  const v = validateBook(sampleBook);
  assert.ok(v.ok);
  assert.equal(v.text, `${JSON.stringify(sampleBook, null, 2)}\n`, 'livre de test (make-test-book.ts) réécrit octet pour octet');
  assert.ok(v.text.includes('© Éditions Liger') && !v.text.includes('\\u'), 'UTF-8 sans échappement');
  // Clés dans le désordre (objets imbriqués compris) : remises dans l'ordre du contrat.
  const shuffled = {
    legal: { text: { es: 'c', fr: 'a', en: 'b' }, year: 2027 },
    unlockThreshold: 2,
    scenes: ['a', 'b'],
    origin: 'https://x.example',
    title: { es: 'T', en: 'T', fr: 'T' },
    languages: ['fr', 'en', 'es'],
    bookId: 'x',
  };
  const w = validateBook(shuffled);
  assert.ok(w.ok);
  assert.deepEqual(Object.keys(JSON.parse(w.text)), ['bookId', 'title', 'languages', 'scenes', 'origin', 'legal', 'unlockThreshold']);
  assert.deepEqual(Object.keys(JSON.parse(w.text).legal), ['year', 'text']);
  assert.deepEqual(Object.keys(JSON.parse(w.text).legal.text), ['fr', 'en', 'es']);
  assert.ok(w.text.endsWith('}\n') && !w.text.endsWith('\n\n'), 'un seul retour à la ligne final');
  assert.equal(formatBook(w.book), w.text);
});

test('CC1 : cardFields du disque repris tel quel (pas encore dans le formulaire), écrit dans l’ordre de bookSchema', () => {
  const cardFields = [{ id: 'taille', label: { fr: 'Taille', en: 'Length', es: 'Longitud' } }, { id: 'poids', label: { fr: 'Poids', en: 'Weight', es: 'Peso' } }];
  const raw = { ...sampleBook, cardFields, unlockThreshold: 2 };
  const r = readableBook(raw, 2026);
  assert.deepEqual(r.cardFields, cardFields);
  const again = validateBook(composeBook(formFromBody(JSON.parse(JSON.stringify(r.form))), { unlockThreshold: r.unlockThreshold, cardFields: r.cardFields }));
  assert.ok(again.ok);
  assert.equal(again.text, `${JSON.stringify(raw, null, 2)}\n`, 'sans modification : octet pour octet, cardFields après legal');
  // Valeur reprise même invalide (intitulé en double) : refusée par bookSchema, rien d'écrit.
  const bad = validateBook(composeBook(r.form, { cardFields: [cardFields[0], cardFields[0]] }));
  assert.ok(!bad.ok && bad.errors.some((e) => e === 'book.json : cardFields : intitulé en double « taille »'));
});

test('formulaire : lu, recomposé, réécrit à l’identique ; unlockThreshold conservé ; ogImage vide omis ; refus de bookSchema', () => {
  const raw = { ...sampleBook, unlockThreshold: 3 };
  const r = readableBook(raw, 2026);
  assert.equal(r.bookIdOnDisk, 'test-dino');
  assert.equal(r.unlockThreshold, 3);
  const again = validateBook(composeBook(formFromBody(JSON.parse(JSON.stringify(r.form))), { unlockThreshold: r.unlockThreshold }));
  assert.ok(again.ok);
  assert.equal(again.text, `${JSON.stringify(raw, null, 2)}\n`, 'sans modification : octet pour octet');
  const noOg = validateBook(composeBook({ ...r.form, ogImage: '  ' }));
  assert.ok(noOg.ok && !('ogImage' in JSON.parse(noOg.text)) && !('unlockThreshold' in JSON.parse(noOg.text)));
  // Seuil conservé tel quel, même devenu invalide (retrait de scènes) : refusé par bookSchema, rien d'écrit.
  const bad = validateBook(composeBook({ ...r.form, scenes: ['trex'] }, { unlockThreshold: 3 }));
  assert.ok(!bad.ok && bad.errors.some((e) => e.startsWith('book.json : unlockThreshold')));
  const empty = validateBook(composeBook(emptyForm(2026)));
  assert.ok(!empty.ok && empty.errors.some((e) => /scenes/.test(e)) && empty.errors.some((e) => /title\.fr/.test(e)));
  assert.equal(emptyForm(2026).legal.text.fr, '© 2026 Éditions Liger');
  // Ce qui est lisible préremplit le formulaire ; le reste vide ; legal absent : prérempli.
  const partial = readableBook({ bookId: 'b', title: { fr: 'T', en: 3 }, scenes: ['a', 4, 'c'] }, 2030);
  assert.deepEqual(partial.form.title, { fr: 'T', en: '', es: '' });
  assert.deepEqual(partial.form.scenes, ['a', 'c']);
  assert.equal(partial.form.legal.text.es, '© 2030 Éditions Liger');
  assert.equal(readableBook(undefined, 2026).bookIdOnDisk, null);
  assert.equal(SCENE_PATTERN_SOURCE, SCENE_ID_PATTERN.source, 'motif envoyé à la page : celui du Zod');
  assert.deepEqual(addedScenes(['a', 'b'], ['b', 'c', 'a', 'd']), ['c', 'd']);
});

test('refus : valeur reçue montrée pour bookId, origin, ogImage et les scènes (vide, / final, caractère invisible)', () => {
  assert.equal(visibleValue(''), 'vide');
  assert.equal(visibleValue('https://dino.editions-liger.com/'), '"https://dino.editions-liger.com/"');
  assert.equal(visibleValue('https://dino\u2011x.com '), '"https://dino\\u2011x.com␠"');
  const obj = composeBook({ ...emptyForm(2026), bookId: 'a', title: L('a', 'b', 'c'), scenes: ['ok', 'pas ok'], origin: '' });
  const v = validateBook(obj);
  assert.ok(!v.ok);
  const shown = withReceivedValues(v.errors, obj);
  assert.ok(shown.some((e) => e.startsWith('book.json : origin : ') && e.endsWith('(valeur reçue : vide)')), shown.join('\n'));
  assert.ok(shown.some((e) => e.startsWith('book.json : scenes.1 : ') && e.endsWith('(valeur reçue : "pas␠ok")')), shown.join('\n'));
});

test('nouveau livre : nom de dossier ; Blender : version la plus récente', () => {
  assert.equal(folderNameError('dino'), null);
  assert.equal(folderNameError('Mon livre 2'), null);
  for (const bad of ['', '.', '..', 'a/b', 'a\\b', 'a:b', 'fin.', 'fin ', ' début', 'CON', 'nul.txt']) assert.ok(folderNameError(bad), bad);
  assert.equal(pickBlenderDir(['Blender 4.2', 'Blender 4.10', 'Blender 4.5', 'Blender 3.6', 'autre']), 'Blender 4.10');
  assert.equal(pickBlenderDir(['Blender 5.0', 'Blender 4.5.3']), 'Blender 5.0');
  assert.equal(pickBlenderDir(['Blender', 'Readme']), null);
});

test('gabarit copié seulement si blender/<id>.blend n’existe pas ; écriture par renommage ; images pour ogImage', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glbi-studio-st2-'));
  try {
    const gabarit = path.join(dir, 'gabarit.blend');
    fs.writeFileSync(gabarit, 'GABARIT');
    const book = path.join(dir, 'livre');
    fs.mkdirSync(path.join(book, 'images'), { recursive: true });
    const a = copyTemplate(book, 'trex', gabarit);
    assert.ok(a.copied, a.message);
    assert.equal(fs.readFileSync(path.join(book, 'blender/trex.blend'), 'utf8'), 'GABARIT');
    fs.writeFileSync(path.join(book, 'blender/trex.blend'), 'TRAVAIL');
    const b = copyTemplate(book, 'trex', gabarit);
    assert.ok(!b.copied && /existe déjà/.test(b.message));
    assert.equal(fs.readFileSync(path.join(book, 'blender/trex.blend'), 'utf8'), 'TRAVAIL', 'jamais écrasé');
    assert.ok(!copyTemplate(book, 'raptor', path.join(dir, 'absent.blend')).copied);
    assert.ok(!fs.existsSync(path.join(book, 'blender/raptor.blend')));

    const target = path.join(book, 'book.json');
    await writeFileAtomic(target, 'un\n');
    await writeFileAtomic(target, 'deux\n');
    assert.equal(fs.readFileSync(target, 'utf8'), 'deux\n');
    assert.deepEqual(fs.readdirSync(book).filter((f) => f.endsWith('.tmp')), [], 'aucun fichier temporaire laissé');

    fs.writeFileSync(path.join(book, 'images/og.png'), 'p');
    fs.writeFileSync(path.join(book, 'images/notes.txt'), 't');
    fs.writeFileSync(path.join(book, 'blender/peau.png'), 'p');
    assert.deepEqual(walkSource(book).images, ['images/og.png'], 'blender/ exclu');

    // Livre ouvert : formulaire prérempli depuis le disque.
    fs.writeFileSync(target, `${JSON.stringify(sampleBook, null, 2)}\n`);
    const opened = new OpenBook(book, null);
    assert.ok(opened.info.file.valid && opened.info.file.stamp);
    assert.equal(opened.info.file.content.form.ogImage, 'images/og.png');
    assert.equal(opened.info.icon, false, 'icon.png absent signalé');
    // Explorateur de la page : dossiers (livres repérés), fichiers acceptés selon le choix, fichiers cachés exclus.
    fs.mkdirSync(path.join(dir, '.cache'));
    const l = listDir(dir, 'gabarit');
    assert.ok(!('error' in l));
    assert.deepEqual(l.dossiers, [{ nom: 'livre', livre: true }]);
    assert.deepEqual(l.fichiers, ['gabarit.blend']);
    assert.equal(l.parent, path.dirname(l.chemin));
    const d = listDir(dir, 'livre');
    assert.ok(!('error' in d) && d.fichiers.length === 0);
    assert.ok('error' in listDir(path.join(dir, 'absent'), 'livre'));
    const notBook = resolveBookDir(path.join(book, 'images'), '/');
    assert.ok('error' in notBook && notBook.createHere?.name === 'images', '« Créer un livre ici » proposé');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ST3 : projet Pages, sorties de wrangler, adresses des QR', () => {
  assert.equal(projectNameError('glbi-essai'), null);
  assert.ok(projectNameError(''));
  assert.ok(projectNameError('Glbi-Essai'), 'majuscules refusées');
  assert.ok(projectNameError('-essai') && projectNameError('essai-'), 'tiret au bord refusé');
  assert.ok(projectNameError('a'.repeat(59)));
  assert.equal(trialSceneUrl('glbi-essai', 'trex'), 'https://glbi-essai.pages.dev/s/trex');
  assert.equal(lanSceneUrl('192.168.1.20', 8001, 'trex'), 'http://192.168.1.20:8001/s/trex/');
  assert.equal(lanSceneUrl('192.168.1.20', 8001, null), 'http://192.168.1.20:8001/');

  // wrangler 4.151.1 : whoami sort en code 0 qu'il soit connecté ou non.
  assert.deepEqual(parseWhoami(['Getting User settings...', 'You are not authenticated. Please run `wrangler login`.']), { connecte: false, compte: null });
  assert.deepEqual(
    parseWhoami(['👋 You are logged in with an OAuth Token, associated with the email david@example.com.']),
    { connecte: true, compte: 'david@example.com' },
  );
  assert.deepEqual(parseWhoami(['👋 You are logged in with an User API Token. Unable to retrieve email for this user.']), { connecte: true, compte: null });
  assert.equal(parseWhoami(['rien']).connecte, null);

  assert.deepEqual(parseDeploy(['Uploading... (12/12)', '✨ Deployment complete! Take a peek over at https://a1b2c3.glbi-essai.pages.dev']), {
    termine: true, deploiement: 'https://a1b2c3.glbi-essai.pages.dev', alias: null,
  });
  assert.equal(parseDeploy(['✨ Deployment complete! Take a peek over at https://x.p.pages.dev', '✨ Deployment alias URL: https://essai.p.pages.dev']).alias, 'https://essai.p.pages.dev');
  assert.equal(parseDeploy(['Error']).termine, false);

  const lan = lanAddresses({
    lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    'vEthernet (WSL)': [{ address: '172.20.48.1', family: 'IPv4', internal: false }],
    Ethernet: [{ address: '192.168.1.30', family: 'IPv4', internal: false }],
    'Wi-Fi': [
      { address: 'fe80::1', family: 'IPv6', internal: false },
      { address: '192.168.1.20', family: 4, internal: false },
    ],
    autre: [{ address: '169.254.10.2', family: 'IPv4', internal: false }],
  });
  assert.deepEqual(lan.map((a) => a.ip), ['192.168.1.20', '192.168.1.30', '172.20.48.1'], 'Wi-Fi d’abord, virtuelle en dernier');
  assert.equal(lan[2].virtuelle, true);
  assert.equal(printQrScene('01-trex.svg'), 'trex');
  assert.equal(printQrScene('urls.txt'), null);
  assert.equal(printQrScene('01-../x.svg'), null, 'identifiant refusé');
});

test('ST3 : QR d’essai et d’impression sur disque ; réglages et état', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-st3-'));
  try {
    const urls = await writeTrialQrs(root, 'dino', 'glbi-essai', ['trex', 'raptor']);
    assert.deepEqual(urls, ['https://glbi-essai.pages.dev/s/trex', 'https://glbi-essai.pages.dev/s/raptor']);
    const f = trialQrFile(root, 'dino', 'trex');
    assert.ok(f && fs.readFileSync(f, 'utf8').startsWith('<svg'));
    assert.equal(trialQrFile(root, 'dino', '../x'), null);
    assert.deepEqual(trialQrScenes(root, 'dino', ['raptor', 'ptero', 'trex']), ['raptor', 'trex']);
    await writeTrialQrs(root, 'dino', 'glbi-essai', ['ptero']);
    assert.deepEqual(trialQrScenes(root, 'dino', ['trex', 'ptero']), ['ptero'], 'dossier vidé avant écriture');
    await assert.rejects(writeTrialQrs(root, '../x', 'glbi-essai', ['trex']));

    const qr = path.join(root, 'dist', 'qr', 'dino');
    fs.mkdirSync(qr, { recursive: true });
    fs.writeFileSync(path.join(qr, '01-trex.svg'), '<svg/>');
    fs.writeFileSync(path.join(qr, '02-raptor.svg'), '<svg/>');
    fs.writeFileSync(path.join(qr, 'urls.txt'), '01-trex.svg\thttps://dino.example/s/trex\n02-raptor.svg\thttps://dino.example/s/raptor\n');
    const p = printQrs(root, 'dino');
    assert.deepEqual(p.items.map((x) => [x.scene, x.url]), [['trex', 'https://dino.example/s/trex'], ['raptor', 'https://dino.example/s/raptor']]);
    assert.ok(p.date);
    assert.deepEqual(printQrs(root, 'absent').items, []);

    const reg = path.join(root, 'reglages.json');
    assert.equal(readReglages(reg).essai.projet, DEFAULT_PROJECT);
    fs.writeFileSync(reg, JSON.stringify({ essai: { projet: 'Mauvais Nom' } }));
    assert.equal(readReglages(reg).essai.projet, DEFAULT_PROJECT, 'nom refusé : valeur par défaut');
    fs.writeFileSync(reg, JSON.stringify({ essai: { projet: 'autre-essai' } }));
    assert.equal(readReglages(reg).essai.projet, 'autre-essai');
    const et = path.join(root, 'etat.json');
    assert.deepEqual(readEtat(et).publications, {});
    fs.writeFileSync(et, JSON.stringify({ out: null, devBook: null }));
    assert.deepEqual(readEtat(et).publications, {}, 'état de ST1/ST2 relu sans publication');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

await Promise.all(pending);
console.log(`test:studio : ${n} test(s) réussi(s)`);
