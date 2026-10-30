// scripts/docs/test-docs.ts — tests sans navigateur des guides (lot GD) : `npm run test:docs`.
// Un cas par règle d'écriture (scripts/docs/guide-rules.ts), l'en-tête et ses parties, puis les guides du repo (docs/), qui
// doivent être conformes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { lighten, parseGuide } from './guide-rules';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
let n = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    n++;
  } catch (e) {
    console.error(`ÉCHEC : ${name}`);
    throw e;
  }
}

const HEAD = ['---', 'titre: Essai', 'surtitre: Guide', 'sous-titre: Pour les tests', 'pastilles: A | B', 'pied: Essai · guide', 'parties:', '  - Tout | #2563eb | 1-2', '---'];
/** Guide minimal conforme ; `body` remplace son corps. Le corps commence à la ligne 10. */
const guide = (body: string[]) => [...HEAD, ...body].join('\n');
const OK = ['# Essai', '', 'Intro.', '', '## 1. Un', '', 'Texte.', '', '- a', '    - b', '', '### 1.1 Sous', '', '## 2. Deux', '', '| a | b |', '|---|---|', '| 1 | 2 |'];
const issues = (body: string[]) => parseGuide(guide(body)).issues;
/** Une seule erreur, à la ligne `line`, dont le message contient `part`. */
function one(body: string[], line: number, part: string): void {
  const list = issues(body);
  assert.equal(list.length, 1, JSON.stringify(list));
  assert.equal(list[0].line, line);
  assert.ok(list[0].message.includes(part), list[0].message);
}

test('guide minimal conforme ; en-tête lu', () => {
  const p = parseGuide(guide(OK));
  assert.deepEqual(p.issues, []);
  assert.equal(p.meta!.titre, 'Essai');
  assert.deepEqual(p.meta!.pastilles, ['A', 'B']);
  assert.deepEqual(p.meta!.parties, [{ name: 'Tout', color: '#2563eb', from: 1, to: 2 }]);
  assert.equal(p.bodyLine, 10);
  assert.equal(lighten('#000000', 0.5), '#808080');
});

test('règle 1 : section « ## N. Titre » numérotée dans l’ordre', () => {
  one(['## 1. Un', '', '## Deux', '', '## 2. Deux'], 12, 'forme attendue « ## N. Titre »');
  one(['## 2. Deux'], 10, 'n° 1 attendu');
});

test('règle 1 : sous-section « ### N.n Titre » dans sa section, dans l’ordre ; pas de niveau 4', () => {
  one(['## 1. Un', '', '### Sous', '', '## 2. Deux'], 12, 'forme attendue « ### N.n Titre »');
  one(['## 1. Un', '', '### 1.2 Sous', '', '## 2. Deux'], 12, '1.1 attendue');
  one(['## 1. Un', '', '### 2.1 Sous', '', '## 2. Deux'], 12, 'dans la section 1');
  one(['## 1. Un', '', '#### Détail', '', '## 2. Deux'], 12, 'niveau 4');
});

test('règle 2 : sous-listes indentées de 4 espaces, sans tabulation', () => {
  one(['## 1. Un', '', '- a', '  - b', '', '## 2. Deux'], 13, 'indenté de 2 espace(s)');
  one(['## 1. Un', '', '- a', '        - b', '', '## 2. Deux'], 13, 'un seul niveau de plus');
  const t = issues(['## 1. Un', '', '- a', '\t- b', '', '## 2. Deux']);
  assert.ok(t.some((i) => i.line === 13 && i.message.includes('tabulation')), JSON.stringify(t));
});

test('règle 3 : aucun tableau dans une liste', () => {
  one(['## 1. Un', '', '1. a', '', '    | x | y |', '    |---|---|', '', '## 2. Deux'], 14, 'tableau dans une liste');
  one(['## 1. Un', '', '- a', '| x | y |', '|---|---|', '', '## 2. Deux'], 13, 'tableau collé sous une liste');
});

test('règle 4 : une ligne vide avant chaque liste', () => {
  one(['## 1. Un', '', 'Texte :', '- a', '', '## 2. Deux'], 13, 'liste sans ligne vide avant');
  one(['## 1. Un', '', '### 1.1 Sous', '- a', '', '## 2. Deux'], 13, 'liste sans ligne vide avant');
  // Bloc de code : pas contrôlé ; suite indentée d'un élément : la liste continue.
  assert.deepEqual(issues(['## 1. Un', '', '```', 'x', '- y', '  - z', '```', '', '- a', '  suite', '- b', '', '## 2. Deux']), []);
});

test('en-tête : absent, clé inconnue ou manquante, partie mal formée, parties qui ne couvrent pas les sections', () => {
  assert.match(parseGuide('# Titre').issues[0].message, /en-tête absent/);
  const bad = parseGuide(['---', 'titre: X', 'couleur: rouge', 'parties:', '  - A | bleu | 1', '---', '## 1. Un'].join('\n')).issues.map((i) => i.message);
  assert.ok(bad.some((m) => m.includes('clé « couleur » inconnue')));
  assert.ok(bad.some((m) => m.includes('« pied » manquant')));
  assert.ok(bad.some((m) => m.includes('forme attendue « Nom | #rrggbb | 1-3 »')));
  one(['## 1. Un', '', '## 2. Deux', '', '## 3. Trois'], 8, "les parties s'arrêtent");
});

test('guides du repo (docs/guide-*.md) conformes', () => {
  const dir = path.join(ROOT, 'docs');
  const files = fs.readdirSync(dir).filter((f) => /^guide-.+\.md$/.test(f));
  assert.ok(files.length >= 2, 'guides de l’atelier et du studio attendus');
  for (const f of files) {
    const p = parseGuide(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.deepEqual(p.issues, [], `docs/${f}`);
  }
});

console.log(`test:docs : ${n} test(s) réussi(s)`);
