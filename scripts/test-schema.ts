// scripts/test-schema.ts — tests de la fusion des couches (A1, spec-atelier-glbi.md §5, §6). `npm run test:schema`.
// Sans navigateur ni fichier : cas nominal, chaque cas d'erreur du §5 (message exact), mode `draft`, fraîcheur du JSON Schema.
import assert from 'node:assert/strict';
import { bookSchema, builtSceneSchema, glbiConfigSchema, isReservedSourcePath, type Book, type EditLayer, type Layer3d } from '../src/schema/glbi';
import { mergeLayers, type MergeOptions } from '../src/schema/merge';
import { checkSchemaFresh } from './export-schema';

const L = (fr: string, en: string, es: string) => ({ fr, en, es });
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

/** Exemple complet de spec-atelier-glbi.md §3 et §4 (scène « trex »). */
const LAYER3D: Layer3d = {
  version: 2,
  scene: { id: 'trex' },
  modules: {
    camera: { target: 'start' },
    animations: {
      mode: 'buttons',
      idle: { object: 'Armature_Trex', clip: 'idle', loop: true },
      actions: ['walk', 'roar', 'eat'].map((id) => ({ id, object: 'Armature_Trex', type: 'armature' as const, clip: id, trigger: 'button' as const, loop: false })),
    },
  },
};
const EDIT: EditLayer = {
  version: 1,
  scene: { name: L('Tyrannosaure', 'Tyrannosaurus', 'Tiranosaurio'), loaderImage: 'images/trex-preview.webp' },
  modules: {
    camera: {
      zoom: 0.5, lookAxis: 'x', minDistance: 1, maxDistance: 20,
      minPolarAngle: 0, maxPolarAngle: 1.57, minAzimuthAngle: -3.14, maxAzimuthAngle: 3.14, enableZoom: true,
    },
    animations: {
      actions: {
        walk: { label: L('Marcher', 'Walk', 'Caminar'), icon: 'icons/walk.webp', sound: 'sounds/trex_steps.mp3' },
        roar: { label: L('Rugir', 'Roar', 'Rugir'), icon: 'icons/roar.webp', sound: 'sounds/trex_roar.mp3' },
        eat: { label: L('Manger', 'Eat', 'Comer'), icon: 'icons/eat.webp', sound: 'sounds/trex_eat.mp3' },
      },
    },
    audio: { ambientSound: 'sounds/jungle.mp3' },
    quiz: {
      question: L('Q ?', 'Q?', '¿Q?'),
      choices: [
        { text: L('a', 'a', 'a'), correct: false },
        { text: L('b', 'b', 'b'), correct: true },
        { text: L('c', 'c', 'c'), correct: false },
      ],
      explanation: L('E.', 'E.', 'E.'),
    },
    credits: { assets: [{ asset: 'sounds/trex_roar.mp3', title: 'Rugissement', author: 'X', license: 'CC0', source: 'https://example.org' }] },
  },
};
const OPTS: MergeOptions = { mode: 'strict', sceneId: 'trex', glbiVersion: 2 };
const BOOK: Book = {
  bookId: 'dino',
  title: L('Dinosaures', 'Dinosaurs', 'Dinosaurios'),
  languages: ['fr', 'en', 'es'],
  scenes: ['trex'],
  origin: 'https://dino.editions-liger.com',
  ogImage: 'images/og.png',
  legal: { year: 2026, text: L('© 2026 Éditions Liger', '© 2026 Éditions Liger', '© 2026 Éditions Liger') },
};

let n = 0;
function test(name: string, fn: () => void): void {
  fn();
  n++;
  console.log(`  ok  ${name}`);
}
/** Les erreurs contiennent exactement `msg` (parmi d'autres éventuelles). */
function hasError(r: { errors: string[] }, msg: string): void {
  assert.ok(r.errors.includes(msg), `message attendu :\n    ${msg}\nobtenus :\n    ${r.errors.join('\n    ')}`);
}

console.log('test:schema — fusion des couches (A1)');

test('exemple complet : objet fusionné valide, ordre du GLB, version 1', () => {
  const r = mergeLayers(clone(LAYER3D), clone(EDIT), OPTS);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.ok(r.config);
  assert.ok(glbiConfigSchema.safeParse(r.config).success);
  assert.equal(r.config.version, 1);
  assert.deepEqual(r.config.modules.animations?.actions.map((a) => a.id), ['walk', 'roar', 'eat']);
  assert.deepEqual(r.config.modules.camera, { target: 'start', ...EDIT.modules!.camera });
  assert.deepEqual(r.config.modules.animations?.actions[0], {
    id: 'walk', object: 'Armature_Trex', type: 'armature', clip: 'walk', trigger: 'button',
    label: L('Marcher', 'Walk', 'Caminar'), icon: 'icons/walk.webp', sound: 'sounds/trex_steps.mp3', loop: false,
  });
  assert.equal(r.draft, null);
});

test('ordre des boutons : celui du GLB, pas celui de edit.json', () => {
  const e = clone(EDIT);
  const a = e.modules!.animations!.actions;
  e.modules!.animations!.actions = { eat: a.eat, walk: a.walk, roar: a.roar };
  assert.deepEqual(mergeLayers(clone(LAYER3D), e, OPTS).config?.modules.animations?.actions.map((x) => x.id), ['walk', 'roar', 'eat']);
});

test('GLB de l’addon v0.1 (glbi_version 1) : message de rupture', () => {
  const r = mergeLayers({ version: 1 }, clone(EDIT), { ...OPTS, glbiVersion: 1 });
  assert.deepEqual(r.errors, ['scenes/trex.glb : glbi_version 1 (addon GLBGenerator v0.1, libellés dans le GLB) ; réexporter avec l\'addon v0.2, textes dans l\'atelier']);
});

test('glbi_version et version de la couche 3D différents', () => {
  hasError(mergeLayers({ ...clone(LAYER3D), version: 3 }, clone(EDIT), OPTS), 'scenes/trex.glb (couche 3D) : version vaut 3, glbi_version vaut 2 (doivent être égaux)');
  hasError(mergeLayers(clone(LAYER3D), clone(EDIT), { ...OPTS, glbiVersion: '2' }), 'scenes/trex.glb : glbi_version doit être l\'entier 2 (trouvé : "2")');
});

test('champ éditorial dans le GLB', () => {
  const g = clone(LAYER3D) as unknown as { modules: { animations: { actions: Record<string, unknown>[] } } };
  g.modules.animations.actions[0].label = L('Marcher', 'Walk', 'Caminar');
  hasError(mergeLayers(g, clone(EDIT), OPTS), 'scenes/trex.glb (couche 3D) : modules.animations.actions.0 : clé « label » non admise, elle appartient à scenes/trex.edit.json');
});

test('champ 3D dans edit.json', () => {
  const e = clone(EDIT) as unknown as { modules: { animations: { actions: Record<string, Record<string, unknown>> } } };
  e.modules.animations.actions.walk.clip = 'walk';
  hasError(mergeLayers(clone(LAYER3D), e, OPTS), 'scenes/trex.edit.json : modules.animations.actions.walk : clé « clip » non admise, elle appartient au GLB (addon)');
});

test('edit.json absent', () => {
  const r = mergeLayers(clone(LAYER3D), undefined, OPTS);
  assert.deepEqual(r.errors, ['scène « trex » : scenes/trex.edit.json absent ; ouvrir la scène dans l\'atelier (npm run atelier -- --source <dossier>)']);
  assert.equal(r.config, null);
});

test('action éditée inconnue du GLB (orpheline)', () => {
  const e = clone(EDIT);
  e.modules!.animations!.actions.marche = { label: L('Marcher', 'Walk', 'Caminar') };
  const r = mergeLayers(clone(LAYER3D), e, OPTS);
  hasError(r, 'scenes/trex.edit.json : action « marche » absente du GLB (actions du GLB : walk, roar, eat)');
  assert.deepEqual(r.orphans, ['marche']);
});

test('action du GLB sans entrée éditoriale, ou entrée sans libellé', () => {
  const e = clone(EDIT);
  delete e.modules!.animations!.actions.eat;
  hasError(mergeLayers(clone(LAYER3D), e, OPTS), 'scène « trex » : action « eat » sans libellé ; à renseigner dans l\'atelier');
  const e2 = clone(EDIT);
  delete e2.modules!.animations!.actions.roar.label;
  hasError(mergeLayers(clone(LAYER3D), e2, OPTS), 'scène « trex » : action « roar » sans libellé ; à renseigner dans l\'atelier');
});

test('nom de la scène absent', () => {
  const e = clone(EDIT);
  delete e.scene!.name;
  hasError(mergeLayers(clone(LAYER3D), e, OPTS), 'scène « trex » : nom de la scène (scene.name) absent de scenes/trex.edit.json ; à renseigner dans l\'atelier');
});

test('cadrage sans cible dans le GLB ; cible sans cadrage (avertissement)', () => {
  const g = clone(LAYER3D);
  delete g.modules.camera;
  hasError(mergeLayers(g, clone(EDIT), OPTS), 'scenes/trex.edit.json : modules.camera réglé mais pas de cible dans le GLB (camera.target, addon)');
  const e = clone(EDIT);
  delete e.modules!.camera;
  const r = mergeLayers(clone(LAYER3D), e, OPTS);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, ['scène « trex » : cadrage non réglé, valeurs par défaut du lecteur']);
  assert.deepEqual(r.config?.modules.camera, { target: 'start', enableZoom: true });
});

test('actions éditées sans module animations dans le GLB', () => {
  const g = clone(LAYER3D);
  delete g.modules.animations;
  hasError(mergeLayers(g, clone(EDIT), OPTS), 'scenes/trex.edit.json : actions éditées mais le GLB n\'a pas de module animations');
});

test('scene.id du GLB différent du nom du fichier', () => {
  hasError(mergeLayers(clone(LAYER3D), clone(EDIT), { ...OPTS, sceneId: 'raptor' }), 'scenes/raptor.glb (couche 3D) : scene.id vaut « trex », attendu « raptor » (nom du fichier et book.json)');
});

test('module réservé et règles de forme (V-09, bornes) signalés avec le bon fichier', () => {
  const e = clone(EDIT) as unknown as { modules: Record<string, unknown>; scene: { name: Record<string, string> } };
  e.modules.timeline = {};
  e.scene.name.es = '';
  const r = mergeLayers(clone(LAYER3D), e, OPTS);
  hasError(r, 'scenes/trex.edit.json : modules : module réservé « timeline », non activable en v1 (spec-extras-blender.md §6)');
  hasError(r, 'scenes/trex.edit.json : scene.name.es : traduction vide (V-09)');
  const e2 = clone(EDIT);
  e2.modules!.camera!.minDistance = 30;
  hasError(mergeLayers(clone(LAYER3D), e2, OPTS), 'scenes/trex.edit.json : modules.camera.minDistance : minDistance (30) > maxDistance (20)');
});

test('zoom borné à [0, 1] (C-08, Î10b) ; build.source retiré de scenes/<id>.json', () => {
  for (const zoom of [0, 0.5, 1]) {
    const e = clone(EDIT);
    e.modules!.camera!.zoom = zoom;
    const r = mergeLayers(clone(LAYER3D), e, OPTS);
    assert.deepEqual(r.errors, [], `zoom ${zoom} refusé`);
  }
  for (const zoom of [-0.1, 1.5]) {
    const e = clone(EDIT);
    e.modules!.camera!.zoom = zoom;
    const r = mergeLayers(clone(LAYER3D), e, OPTS);
    assert.ok(r.errors.some((m) => m.includes('modules.camera.zoom')), `zoom ${zoom} accepté : ${r.errors.join(' | ')}`);
  }
  const built = builtSceneSchema.safeParse({ ...mergeLayers(clone(LAYER3D), clone(EDIT), OPTS).config, build: { glb: 'scenes/trex.glb', source: 'glb', modelCredits: [] } });
  assert.equal(built.success, false, 'build.source encore admis');
});

test('mode draft : objet affichable malgré les erreurs (libellés et nom remplacés par les id)', () => {
  const r = mergeLayers(clone(LAYER3D), undefined, { ...OPTS, mode: 'draft' });
  assert.equal(r.config, null);
  assert.ok(r.draft);
  assert.deepEqual(r.draft.scene.name, L('trex', 'trex', 'trex'));
  assert.deepEqual(r.draft.modules.animations?.actions[2].label, L('eat', 'eat', 'eat'));
  const bad = clone(EDIT) as unknown as { modules: { animations: { actions: Record<string, unknown> } } };
  bad.modules.animations.actions.marche = { label: L('m', 'm', 'm'), clip: 'x' };
  const r2 = mergeLayers(clone(LAYER3D), bad, { ...OPTS, mode: 'draft' });
  assert.deepEqual(r2.orphans, ['marche']);
  assert.ok(r2.draft);
});

test('dossier réservé blender/ refusé dans les chemins d’assets, sans changer le reste (ST1, DP-2)', () => {
  const e = clone(EDIT);
  e.scene!.loaderImage = 'blender/trex-preview.webp';
  e.modules!.animations!.actions.walk.sound = 'Blender/textures/pas.mp3';
  e.modules!.credits!.assets[0].asset = 'blender/roar.mp3';
  const r = mergeLayers(clone(LAYER3D), e, OPTS);
  hasError(r, 'scenes/trex.edit.json : scene.loaderImage : image « blender/trex-preview.webp » : dossier blender/ réservé aux fichiers de travail, non publié');
  hasError(r, 'scenes/trex.edit.json : modules.animations.actions.walk.sound : son « Blender/textures/pas.mp3 » : dossier blender/ réservé aux fichiers de travail, non publié');
  hasError(r, 'scenes/trex.edit.json : modules.credits.assets.0.asset : asset « blender/roar.mp3 » : dossier blender/ réservé aux fichiers de travail, non publié');
  const ok = clone(EDIT);
  ok.scene!.loaderImage = 'images/blender/trex-preview.webp';
  ok.modules!.animations!.actions.walk.icon = 'blenders/walk.webp';
  assert.deepEqual(mergeLayers(clone(LAYER3D), ok, OPTS).errors, []);
  assert.ok(!bookSchema.safeParse({ ...BOOK, ogImage: 'blender/og.png' }).success, 'ogImage sous blender/ accepté');
  assert.ok(bookSchema.safeParse(BOOK).success);
  assert.equal(isReservedSourcePath('blender/trex.blend'), true);
  assert.equal(isReservedSourcePath('BLENDER/a/b.png'), true);
  assert.equal(isReservedSourcePath('scenes/blender.glb'), false);
  assert.equal(isReservedSourcePath('blender.png'), false);
});

test('JSON Schema de la couche 3D commité à jour', () => {
  assert.equal(checkSchemaFresh(), null);
});

console.log(`test:schema : ${n} test(s) réussi(s)`);
