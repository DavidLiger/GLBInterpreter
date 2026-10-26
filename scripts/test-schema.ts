// scripts/test-schema.ts — tests de la fusion des couches (A1, spec-atelier-glbi.md §5, §6). `npm run test:schema`.
// Sans navigateur : cas nominal, chaque cas d'erreur du §5 (message exact), mode `draft`, fraîcheur du JSON Schema ;
// actions combinées (AC1, spec-actions-combinees.md §7, §8) : événements, coupe au noir, instants hors durée (sur un GLB
// écrit dans un dossier temporaire, lu par `readScene` comme au build) ; empty de position de la caméra (AC2, DP-19, §16).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { bookSchema, builtSceneSchema, glbiConfigSchema, isReservedSourcePath, type Book, type EditLayer, type Layer3d } from '../src/schema/glbi';
import { mergeLayers, type MergeOptions } from '../src/schema/merge';
import { checkSchemaFresh, layer3dSchemaText } from './export-schema';
import { readScene, Report } from './book-check';
import { referencedNodeNames } from './glb-pipeline';

const L = (fr: string, en: string, es: string) => ({ fr, en, es });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lecture d'un JSON Schema en test
const layer3dSchemaJson = (): any => JSON.parse(layer3dSchemaText());
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
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  await fn();
  n++;
  console.log(`  ok  ${name}`);
}
/** Les erreurs contiennent exactement `msg` (parmi d'autres éventuelles). */
function hasError(r: { errors: string[] }, msg: string): void {
  assert.ok(r.errors.includes(msg), `message attendu :\n    ${msg}\nobtenus :\n    ${r.errors.join('\n    ')}`);
}

console.log('test:schema — fusion des couches (A1), actions combinées (AC1) et position de caméra (AC2)');

await test('exemple complet : objet fusionné valide, ordre du GLB, version 1', () => {
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

await test('ordre des boutons : celui du GLB, pas celui de edit.json', () => {
  const e = clone(EDIT);
  const a = e.modules!.animations!.actions;
  e.modules!.animations!.actions = { eat: a.eat, walk: a.walk, roar: a.roar };
  assert.deepEqual(mergeLayers(clone(LAYER3D), e, OPTS).config?.modules.animations?.actions.map((x) => x.id), ['walk', 'roar', 'eat']);
});

await test('GLB de l’addon v0.1 (glbi_version 1) : message de rupture', () => {
  const r = mergeLayers({ version: 1 }, clone(EDIT), { ...OPTS, glbiVersion: 1 });
  assert.deepEqual(r.errors, ['scenes/trex.glb : glbi_version 1 (addon GLBGenerator v0.1, libellés dans le GLB) ; réexporter avec l\'addon v0.2, textes dans l\'atelier']);
});

await test('glbi_version et version de la couche 3D différents', () => {
  hasError(mergeLayers({ ...clone(LAYER3D), version: 3 }, clone(EDIT), OPTS), 'scenes/trex.glb (couche 3D) : version vaut 3, glbi_version vaut 2 (doivent être égaux)');
  hasError(mergeLayers(clone(LAYER3D), clone(EDIT), { ...OPTS, glbiVersion: '2' }), 'scenes/trex.glb : glbi_version doit être l\'entier 2 (trouvé : "2")');
});

await test('champ éditorial dans le GLB', () => {
  const g = clone(LAYER3D) as unknown as { modules: { animations: { actions: Record<string, unknown>[] } } };
  g.modules.animations.actions[0].label = L('Marcher', 'Walk', 'Caminar');
  hasError(mergeLayers(g, clone(EDIT), OPTS), 'scenes/trex.glb (couche 3D) : modules.animations.actions.0 : clé « label » non admise, elle appartient à scenes/trex.edit.json');
});

await test('champ 3D dans edit.json', () => {
  const e = clone(EDIT) as unknown as { modules: { animations: { actions: Record<string, Record<string, unknown>> } } };
  e.modules.animations.actions.walk.clip = 'walk';
  hasError(mergeLayers(clone(LAYER3D), e, OPTS), 'scenes/trex.edit.json : modules.animations.actions.walk : clé « clip » non admise, elle appartient au GLB (addon)');
});

await test('edit.json absent', () => {
  const r = mergeLayers(clone(LAYER3D), undefined, OPTS);
  assert.deepEqual(r.errors, ['scène « trex » : scenes/trex.edit.json absent ; ouvrir la scène dans l\'atelier (npm run atelier -- --source <dossier>)']);
  assert.equal(r.config, null);
});

await test('action éditée inconnue du GLB (orpheline)', () => {
  const e = clone(EDIT);
  e.modules!.animations!.actions.marche = { label: L('Marcher', 'Walk', 'Caminar') };
  const r = mergeLayers(clone(LAYER3D), e, OPTS);
  hasError(r, 'scenes/trex.edit.json : action « marche » absente du GLB (actions du GLB : walk, roar, eat)');
  assert.deepEqual(r.orphans, ['marche']);
});

await test('action du GLB sans entrée éditoriale, ou entrée sans libellé', () => {
  const e = clone(EDIT);
  delete e.modules!.animations!.actions.eat;
  hasError(mergeLayers(clone(LAYER3D), e, OPTS), 'scène « trex » : action « eat » sans libellé ; à renseigner dans l\'atelier');
  const e2 = clone(EDIT);
  delete e2.modules!.animations!.actions.roar.label;
  hasError(mergeLayers(clone(LAYER3D), e2, OPTS), 'scène « trex » : action « roar » sans libellé ; à renseigner dans l\'atelier');
});

await test('nom de la scène absent', () => {
  const e = clone(EDIT);
  delete e.scene!.name;
  hasError(mergeLayers(clone(LAYER3D), e, OPTS), 'scène « trex » : nom de la scène (scene.name) absent de scenes/trex.edit.json ; à renseigner dans l\'atelier');
});

await test('cadrage sans cible dans le GLB ; cible sans cadrage (avertissement)', () => {
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

await test('actions éditées sans module animations dans le GLB', () => {
  const g = clone(LAYER3D);
  delete g.modules.animations;
  hasError(mergeLayers(g, clone(EDIT), OPTS), 'scenes/trex.edit.json : actions éditées mais le GLB n\'a pas de module animations');
});

await test('scene.id du GLB différent du nom du fichier', () => {
  hasError(mergeLayers(clone(LAYER3D), clone(EDIT), { ...OPTS, sceneId: 'raptor' }), 'scenes/raptor.glb (couche 3D) : scene.id vaut « trex », attendu « raptor » (nom du fichier et book.json)');
});

await test('module réservé et règles de forme (V-09, bornes) signalés avec le bon fichier', () => {
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

await test('zoom borné à [0, 1] (C-08, Î10b) ; build.source retiré de scenes/<id>.json', () => {
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

await test('mode draft : objet affichable malgré les erreurs (libellés et nom remplacés par les id)', () => {
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

await test('dossier réservé blender/ refusé dans les chemins d’assets, sans changer le reste (ST1, DP-2)', () => {
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


// ---------------------------------------------------------------------------------------------------------
// Actions combinées (AC1) : événements, coupe au noir
// ---------------------------------------------------------------------------------------------------------

/** Couche 3D de LAYER3D avec des événements sur « walk » et une coupe au noir sur « roar ». */
function layer3dAc1(): Layer3d {
  const g = clone(LAYER3D);
  const acts = g.modules.animations!.actions;
  acts[0].events = [{ id: 'pas', time: 0.25 }, { id: 'souffle', time: 0.5 }];
  acts[1].transition = 'cut';
  acts[1].events = [{ id: 'cri', time: 0 }];
  return g;
}
function editAc1(): EditLayer {
  const e = clone(EDIT);
  e.modules!.animations!.actions.walk.events = { pas: { sound: 'sounds/trex_pas.mp3' } };
  e.modules!.animations!.actions.roar.events = { cri: { sound: 'sounds/trex_cri.mp3' } };
  return e;
}

await test('AC1 : fusion complète (événements avec et sans son, transition « cut »), ordre du GLB', () => {
  const r = mergeLayers(layer3dAc1(), editAc1(), OPTS);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, ['scène « trex » : événement « souffle » de l\'action « walk » sans son (ignoré) ; à renseigner dans l\'atelier']);
  const [walk, roar, eat] = r.config!.modules.animations!.actions;
  assert.deepEqual(walk.events, [{ id: 'pas', time: 0.25, sound: 'sounds/trex_pas.mp3' }, { id: 'souffle', time: 0.5 }]);
  assert.equal(walk.transition, undefined, 'transition absente = fondu, rien d’écrit');
  assert.equal(roar.transition, 'cut');
  assert.deepEqual(roar.events, [{ id: 'cri', time: 0, sound: 'sounds/trex_cri.mp3' }]);
  assert.ok(!('events' in eat) && !('transition' in eat), 'action sans événements : objet fusionné inchangé');
  assert.deepEqual(Object.keys(roar), ['id', 'object', 'type', 'clip', 'trigger', 'label', 'icon', 'sound', 'loop', 'transition', 'events']);
  assert.ok(glbiConfigSchema.safeParse(r.config).success);
  assert.deepEqual(r.eventOrphans, []);
});

await test('AC1 : couches existantes (sans events ni transition) toujours valides, objet fusionné identique', () => {
  const r = mergeLayers(clone(LAYER3D), clone(EDIT), OPTS);
  assert.deepEqual(r.errors, []);
  for (const a of r.config!.modules.animations!.actions) assert.ok(!('events' in a) && !('transition' in a));
  assert.deepEqual(r.eventOrphans, []);
});

await test('AC1 : événement édité inconnu du GLB (orphelin, gardé en draft) ; events édités pour une action sans événements', () => {
  const e = editAc1();
  e.modules!.animations!.actions.walk.events!.pa = { sound: 'sounds/trex_pas.mp3' };
  e.modules!.animations!.actions.eat.events = { croc: { sound: 'sounds/trex_eat.mp3' } };
  const r = mergeLayers(layer3dAc1(), e, OPTS);
  hasError(r, 'scenes/trex.edit.json : action « walk » : événement « pa » absent du GLB (événements du GLB : pas, souffle)');
  hasError(r, 'scenes/trex.edit.json : action « eat » : événement « croc » absent du GLB (événements du GLB : aucun)');
  assert.equal(r.config, null);
  assert.deepEqual(r.eventOrphans, [{ action: 'walk', event: 'pa' }, { action: 'eat', event: 'croc' }]);
  const d = mergeLayers(layer3dAc1(), e, { ...OPTS, mode: 'draft' });
  assert.ok(d.draft, 'objet affichable malgré l’orphelin');
  assert.deepEqual(d.eventOrphans, r.eventOrphans);
  assert.deepEqual(d.draft.modules.animations!.actions[0].events?.map((x) => x.id), ['pas', 'souffle'], 'draft : événements du GLB seulement');
});

await test('AC1 : events ou transition à la mauvaise couche (message existant), pas sur idle', () => {
  const e = editAc1() as unknown as { modules: { animations: { actions: Record<string, Record<string, unknown>> } } };
  e.modules.animations.actions.roar.transition = 'cut';
  (e.modules.animations.actions.walk.events as Record<string, Record<string, unknown>>).pas.time = 0.25;
  const r = mergeLayers(layer3dAc1(), e, OPTS);
  hasError(r, 'scenes/trex.edit.json : modules.animations.actions.roar : clé « transition » non admise, elle appartient au GLB (addon)');
  hasError(r, 'scenes/trex.edit.json : modules.animations.actions.walk.events.pas : clé « time » non admise, elle appartient au GLB (addon)');
  const g = layer3dAc1() as unknown as { modules: { animations: { idle: Record<string, unknown>; actions: { events?: Record<string, unknown>[] }[] } } };
  g.modules.animations.actions[0].events![0].sound = 'sounds/trex_pas.mp3';
  g.modules.animations.idle.events = [{ id: 'x', time: 0 }];
  g.modules.animations.idle.transition = 'cut';
  const r2 = mergeLayers(g, editAc1(), OPTS);
  hasError(r2, 'scenes/trex.glb (couche 3D) : modules.animations.actions.0.events.0 : clé « sound » non admise, elle appartient à scenes/trex.edit.json');
  hasError(r2, 'scenes/trex.glb (couche 3D) : modules.animations.idle : clé « events » non admise : pas de marqueurs sur idle (spec-actions-combinees.md §4, §6)');
  hasError(r2, 'scenes/trex.glb (couche 3D) : modules.animations.idle : clé « transition » non admise : pas de coupe au noir sur idle (spec-actions-combinees.md §4, §6)');
});

await test('AC1 : id d’événement en double, instant négatif, transition inconnue (couche 3D)', () => {
  const g = layer3dAc1();
  g.modules.animations!.actions[0].events!.push({ id: 'pas', time: 0.6 });
  g.modules.animations!.actions[2].events = [{ id: 'croc', time: -0.1 }];
  (g.modules.animations!.actions[2] as { transition?: string }).transition = 'volet';
  const r = mergeLayers(g, editAc1(), OPTS);
  hasError(r, 'scenes/trex.glb (couche 3D) : modules.animations.actions.0.events.2.id : id d\'événement en double « pas »');
  hasError(r, 'scenes/trex.glb (couche 3D) : modules.animations.actions.2.events.0.time : instant négatif (secondes depuis le début du clip, ≥ 0)');
  assert.ok(r.errors.some((m) => m.startsWith('scenes/trex.glb (couche 3D) : modules.animations.actions.2.transition : ')), r.errors.join(' | '));
  // Même règle sur l'objet fusionné (contrat du lecteur)
  const merged = mergeLayers(layer3dAc1(), editAc1(), OPTS).config!;
  const dup = clone(merged);
  dup.modules.animations!.actions[1].events!.push({ id: 'cri', time: 0.1 });
  assert.equal(glbiConfigSchema.safeParse(dup).success, false);
});

/** Dossier source minimal : un GLB (armature animée par « chasse », 2 s) dont la couche 3D est `layer`, et son edit.json. */
async function sourceWithGlb(layer: Layer3d, edit: EditLayer): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glbi-ac1-'));
  fs.mkdirSync(path.join(dir, 'scenes'));
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Scene');
  const arm = doc.createNode('Armature_Duo');
  scene.addChild(arm).addChild(doc.createNode('start'));
  for (const [clip, d] of [['idle', 1], ['chasse', 2]] as const) {
    const sampler = doc.createAnimationSampler().setInterpolation('LINEAR')
      .setInput(doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Float32Array([0, d])))
      .setOutput(doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(new Float32Array([0, 0, 0, 1, 0, 0])));
    doc.createAnimation(clip).addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(arm).setTargetPath('translation').setSampler(sampler));
  }
  scene.addChild(doc.createNode('GLBI_ROOT').setExtras({ glbi_version: 2, glbi_config: JSON.stringify(layer) }));
  await new NodeIO().write(path.join(dir, 'scenes/duo.glb'), doc);
  fs.writeFileSync(path.join(dir, 'scenes/duo.edit.json'), JSON.stringify(edit));
  return dir;
}

await test('AC1 : instant au-delà de la durée du clip (build) ; sons d’événement comptés pour V-10 et la copie', async () => {
  const layer: Layer3d = {
    version: 2,
    scene: { id: 'duo' },
    modules: {
      camera: { target: 'start' },
      animations: {
        mode: 'buttons',
        idle: { object: 'Armature_Duo', clip: 'idle', loop: true },
        actions: [{
          id: 'chasse', object: 'Armature_Duo', type: 'mesh', clip: 'chasse', trigger: 'button', loop: false, transition: 'cut',
          // 2,0004 s : dans la tolérance (arrondi de l'addon à la milliseconde) ; 9,2 s : au-delà du clip de 2 s.
          events: [{ id: 'morsure', time: 1 }, { id: 'fin', time: 2.0004 }, { id: 'chute', time: 9.2 }],
        }],
      },
    },
  };
  const edit: EditLayer = {
    version: 1,
    scene: { name: L('Duo', 'Duo', 'Dúo') },
    modules: {
      animations: { actions: { chasse: { label: L('Chasser', 'Chase', 'Perseguir'), events: { morsure: { sound: 'sounds/morsure.wav' }, fin: { sound: 'sounds/fin.wav' }, chute: { sound: 'sounds/chute.wav' } } } } },
      credits: { assets: [{ asset: 'sounds/morsure.wav', title: 'Morsure', author: 'X', license: 'CC0' }, { asset: 'sounds/chute.wav', title: 'Chute', author: 'X', license: 'CC0' }] },
    },
  };
  const dir = await sourceWithGlb(layer, edit);
  try {
    const report = new Report();
    const r = await readScene(dir, 'duo', report);
    const errors = report.lines.filter((l) => l.level === 'error');
    assert.deepEqual(errors.map((l) => [l.origin, l.message]), [
      ['glb', 'scenes/duo.glb (couche 3D) : action « chasse » : événement « chute » à 9,200 s, clip de 2,000 s'],
      ['build', 'scène « duo » : son « sounds/fin.wav » sans entrée dans modules.credits.assets (V-10)'],
    ]);
    assert.ok(r, 'scène lue');
    for (const f of ['sounds/morsure.wav', 'sounds/fin.wav', 'sounds/chute.wav']) assert.ok(r.assets.has(f), `${f} non copié`);
    assert.equal(r.config.modules.animations!.actions[0].transition, 'cut');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


// ---------------------------------------------------------------------------------------------------------
// Position de la caméra pendant une action (AC2, DP-19, spec-actions-combinees.md §16)
// ---------------------------------------------------------------------------------------------------------

await test('AC2 : cameraPosition valide (couche 3D) : recopié dans l’objet fusionné après transition ; versions et schéma inchangés', () => {
  const g = layer3dAc1();
  g.modules.animations!.actions[1].cameraPosition = 'CamRugir';
  const r = mergeLayers(g, editAc1(), OPTS);
  assert.deepEqual(r.errors, []);
  const roar = r.config!.modules.animations!.actions[1];
  assert.equal(roar.cameraPosition, 'CamRugir');
  assert.deepEqual(Object.keys(roar), ['id', 'object', 'type', 'clip', 'trigger', 'label', 'icon', 'sound', 'loop', 'transition', 'cameraPosition', 'events']);
  assert.ok(!('cameraPosition' in r.config!.modules.animations!.actions[0]), 'action sans le champ : objet fusionné inchangé');
  assert.equal(r.config!.version, 1);
  assert.deepEqual(referencedNodeNames(r.config).sort(), ['Armature_Trex', 'CamRugir', 'start'], 'empty protégé de prune au build');
  const text = layer3dSchemaJson();
  assert.equal(text.$id, 'urn:glbinterpreter:schema:layer3d/2');
  assert.deepEqual(text.properties.modules.properties.animations.properties.actions.items.properties.cameraPosition, { type: 'string', pattern: '^[A-Za-z0-9_]+$' });
});

await test('AC2 : cameraPosition sans cible de caméra, égal à la cible, nom invalide (couche 3D)', () => {
  const g = layer3dAc1();
  g.modules.animations!.actions[1].cameraPosition = 'CamRugir';
  delete g.modules.camera;
  const e = editAc1();
  delete e.modules!.camera;
  hasError(mergeLayers(g, e, OPTS), 'scenes/trex.glb (couche 3D) : action « roar » : position de caméra « CamRugir » sans cible de caméra (camera.target, addon)');
  const g2 = layer3dAc1();
  g2.modules.animations!.actions[0].cameraPosition = 'start';
  hasError(mergeLayers(g2, editAc1(), OPTS), 'scenes/trex.glb (couche 3D) : action « walk » : position de caméra « start » identique à la cible de caméra (deux empties distincts attendus)');
  const g3 = layer3dAc1();
  g3.modules.animations!.actions[0].cameraPosition = 'Cam.001';
  hasError(mergeLayers(g3, editAc1(), OPTS), 'scenes/trex.glb (couche 3D) : modules.animations.actions.0.cameraPosition : nom Blender : lettres, chiffres et _ uniquement');
});

await test('AC2 : cameraPosition sur idle (message dédié) ou dans edit.json (appartient au GLB)', () => {
  const g = layer3dAc1() as unknown as { modules: { animations: { idle: Record<string, unknown> } } };
  g.modules.animations.idle.cameraPosition = 'CamRepos';
  hasError(mergeLayers(g, editAc1(), OPTS), 'scenes/trex.glb (couche 3D) : modules.animations.idle : clé « cameraPosition » non admise : pas de position de caméra sur idle (spec-actions-combinees.md §16)');
  const e = editAc1() as unknown as { modules: { animations: { actions: Record<string, Record<string, unknown>> } } };
  e.modules.animations.actions.roar.cameraPosition = 'CamRugir';
  hasError(mergeLayers(layer3dAc1(), e, OPTS), 'scenes/trex.edit.json : modules.animations.actions.roar : clé « cameraPosition » non admise, elle appartient au GLB (addon)');
});

await test('AC2 : empty de position absent du GLB (book:check, V-08) ; présent : accepté', async () => {
  const layer = (cam: string): Layer3d => ({
    version: 2,
    scene: { id: 'duo' },
    modules: {
      camera: { target: 'start' },
      animations: {
        mode: 'buttons',
        idle: { object: 'Armature_Duo', clip: 'idle', loop: true },
        actions: [{ id: 'chasse', object: 'Armature_Duo', type: 'mesh', clip: 'chasse', trigger: 'button', loop: false, cameraPosition: cam }],
      },
    },
  });
  const edit: EditLayer = { version: 1, scene: { name: L('Duo', 'Duo', 'Dúo') }, modules: { animations: { actions: { chasse: { label: L('Chasser', 'Chase', 'Perseguir') } } } } };
  const dir = await sourceWithGlb(layer('CamAbsente'), edit);
  const dir2 = await sourceWithGlb(layer('Armature_Duo'), edit);
  try {
    const report = new Report();
    await readScene(dir, 'duo', report);
    assert.deepEqual(report.lines.filter((l) => l.level === 'error').map((l) => [l.origin, l.message]), [
      ['build', 'scène « duo » : action « chasse » : cameraPosition « CamAbsente » introuvable dans le GLB (V-08)'],
    ]);
    const report2 = new Report();
    assert.ok(await readScene(dir2, 'duo', report2), 'nœud présent : scène lue');
    assert.deepEqual(report2.errors, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(dir2, { recursive: true, force: true });
  }
});

await test('JSON Schema de la couche 3D commité à jour', () => {
  assert.equal(checkSchemaFresh(), null);
});

console.log(`test:schema : ${n} test(s) réussi(s)`);
