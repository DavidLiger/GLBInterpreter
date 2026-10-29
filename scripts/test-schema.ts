// scripts/test-schema.ts — tests de la fusion des couches (A1, spec-atelier-glbi.md §5, §6). `npm run test:schema`.
// Sans navigateur : cas nominal, chaque cas d'erreur du §5 (message exact), mode `draft`, fraîcheur du JSON Schema ;
// actions combinées (AC1, spec-actions-combinees.md §7, §8) : événements, coupe au noir, instants hors durée (sur un GLB
// écrit dans un dossier temporaire, lu par `readScene` comme au build) ; empty de position de la caméra (AC2, DP-19, §16) ;
// carte de collection (CC1, spec-carte-collection.md §5, §6 : intitulés, paragraphe, longueurs, livres existants valides) ;
// types de cartes (CC3, §15.7, §15.8) ; mini-jeu (MJ1, spec-mini-jeu.md §5 à §8, §13 : couches du jeu, fusion, rôles de clip,
// bornes, clé `rewards` réservée, JSON Schema du jeu, book:check du jeu sur le livre de test et sur des cas faux).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { spawnSync } from 'node:child_process';
import { bookSchema, builtSceneSchema, editLayerSchema, game3dArenaSchema, game3dEntitySchema, gameConfigSchema, gameEditSchema, glbiConfigSchema, isReservedSourcePath, type Book, type EditLayer, type Layer3d } from '../src/schema/glbi';
import { mergeGame, mergeLayers, type MergeOptions } from '../src/schema/merge';
import { checkSchemaFresh, game3dSchemaText, layer3dSchemaText } from './export-schema';
import { checkBookSource, checkCards, readScene, Report, ROOT, type SceneResult } from './book-check';
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

console.log('test:schema — fusion des couches (A1), actions combinées (AC1), position de caméra (AC2), carte de collection (CC1), types de cartes (CC3) et mini-jeu (MJ1)');

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

// ---------------------------------------------------------------------------------------------------------
// Carte de collection (CC1, spec-carte-collection.md §5, §6)
// ---------------------------------------------------------------------------------------------------------

const CARD_FIELDS = [
  { id: 'taille', label: L('Taille', 'Length', 'Longitud') },
  { id: 'poids', label: L('Poids', 'Weight', 'Peso') },
  { id: 'epoque', label: L('Époque', 'Period', 'Época') },
  { id: 'regime', label: L('Régime', 'Diet', 'Dieta') },
];
const CARD = {
  subtitle: L('T. rex', 'T. rex', 'T. rex'),
  image: 'images/trex-card.webp',
  fields: { taille: L('12 m', '12 m', '12 m'), poids: L('8 t', '8 t', '8 t'), epoque: L('Crétacé', 'Cretaceous', 'Cretácico'), regime: L('Carnivore', 'Carnivore', 'Carnívoro') },
  text: L('Un grand carnivore.', 'A big carnivore.', 'Un gran carnívoro.'),
};
const editWithCard = (card: unknown): EditLayer => {
  const e = clone(EDIT) as unknown as { modules: Record<string, unknown> };
  e.modules.card = card;
  return e as unknown as EditLayer;
};
/** Résultat de `readScene` réduit à ce que lit `checkCards`. */
const sceneWith = (config: SceneResult['config']): SceneResult => ({ id: 'trex', config, modelCredits: [], assets: new Set(), protect: [] });

await test('CC1 : livre et edit.json sans carte toujours valides ; aucune version ne change ; JSON Schema de la couche 3D inchangé', () => {
  assert.ok(bookSchema.safeParse(BOOK).success);
  assert.ok(editLayerSchema.safeParse(EDIT).success);
  assert.ok(!('card' in (mergeLayers(clone(LAYER3D), clone(EDIT), OPTS).config!.modules)));
  assert.ok(!layer3dSchemaText().includes('card'), 'aucun champ de la carte dans la couche 3D');
});

await test('CC1 : carte valide recopiée dans l’objet fusionné (après le quiz) ; cardFields de 1 à 8 (CC3), id uniques', () => {
  const r = mergeLayers(clone(LAYER3D), editWithCard(clone(CARD)), OPTS);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.config!.modules.card, CARD);
  assert.deepEqual(Object.keys(r.config!.modules), ['camera', 'animations', 'audio', 'quiz', 'card', 'credits']);
  assert.ok(builtSceneSchema.safeParse({ ...r.config, build: { glb: 'scenes/trex.glb', modelCredits: [] } }).success);
  assert.ok(bookSchema.safeParse({ ...BOOK, cardFields: CARD_FIELDS }).success);
  const fail = (cardFields: unknown) => {
    const p = bookSchema.safeParse({ ...BOOK, cardFields });
    assert.ok(!p.success);
    return p.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`);
  };
  assert.deepEqual(fail([]), ['cardFields : au moins un intitulé (sinon, retirer cardFields)']);
  // CC3 : 8 intitulés au plus (4 en CC1).
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `f${i}`, label: L(`F${i}`, `F${i}`, `F${i}`) }));
  assert.ok(bookSchema.safeParse({ ...BOOK, cardFields: many(8) }).success, 'cardFields à 8 intitulés : valide');
  assert.deepEqual(fail(many(9)), ['cardFields : 8 intitulés au plus']);
  assert.deepEqual(fail([CARD_FIELDS[0], CARD_FIELDS[0]]), ['cardFields : intitulé en double « taille »']);
  assert.deepEqual(fail([{ id: 'taille', label: L('Taille au garrot', 'Length', 'Longitud') }]), ['cardFields.0.label.fr : 16 caractères (14 au plus)']);
});

await test('CC1 : carte sans paragraphe (fusion strict) ; draft : carte omise, reste de la couche gardé', () => {
  const { text: _t, ...noText } = CARD;
  void _t;
  const e = editWithCard(noText);
  assert.ok(editLayerSchema.safeParse(e).success, 'paragraphe facultatif dans la couche (saisie en cours)');
  const r = mergeLayers(clone(LAYER3D), e, OPTS);
  assert.deepEqual(r.errors, ['scène « trex » : carte sans paragraphe (modules.card.text) ; à renseigner dans l\'atelier']);
  const d = mergeLayers(clone(LAYER3D), e, { ...OPTS, mode: 'draft' });
  assert.ok(d.draft && !('card' in d.draft.modules));
  assert.equal(d.draft.scene.name.fr, 'Tyrannosaure', 'couche éditoriale gardée');
});

await test('CC1 : longueurs (schéma, par langue) ; carte dans le GLB ; clé inconnue', () => {
  const card = clone(CARD);
  card.text.es = 'x'.repeat(263);
  card.subtitle.fr = 's'.repeat(41);
  card.fields.taille.en = 'v'.repeat(17);
  const r = mergeLayers(clone(LAYER3D), editWithCard(card), OPTS);
  hasError(r, 'scenes/trex.edit.json : modules.card.text.es : 263 caractères (250 au plus)');
  hasError(r, 'scenes/trex.edit.json : modules.card.subtitle.fr : 41 caractères (40 au plus)');
  hasError(r, 'scenes/trex.edit.json : modules.card.fields.taille.en : 17 caractères (16 au plus)');
  const ok = clone(CARD);
  ok.text.es = 'x'.repeat(250);
  ok.subtitle.fr = 's'.repeat(40);
  ok.fields.taille.en = 'v'.repeat(16);
  assert.deepEqual(mergeLayers(clone(LAYER3D), editWithCard(ok), OPTS).errors, [], 'longueurs maximales admises');
  const g = clone(LAYER3D) as unknown as { modules: Record<string, unknown> };
  g.modules.card = clone(CARD);
  hasError(mergeLayers(g, clone(EDIT), OPTS), 'scenes/trex.glb (couche 3D) : modules : clé « card » non admise, elle appartient à scenes/trex.edit.json');
  hasError(mergeLayers(clone(LAYER3D), editWithCard({ ...clone(CARD), title: L('a', 'b', 'c') }), OPTS), 'scenes/trex.edit.json : modules.card : clé « title » inconnue');
});

await test('CC1 : intitulé inconnu, cardFields absent (erreurs, edit.json) ; intitulé sans valeur (avertissement)', () => {
  const config = mergeLayers(clone(LAYER3D), editWithCard({ ...clone(CARD), fields: { taille: L('12 m', '12 m', '12 m'), poid: L('8 t', '8 t', '8 t') } }), OPTS).config!;
  const report = new Report();
  checkCards({ ...BOOK, cardFields: CARD_FIELDS }, [sceneWith(config)], report);
  assert.deepEqual(report.lines.map((l) => [l.level, l.origin, l.scene, l.message]), [
    ['error', 'edit', 'trex', 'scenes/trex.edit.json : modules.card.fields : intitulé « poid » absent de book.json (cardFields : taille, poids, epoque, regime)'],
    ['warning', 'fusion', 'trex', 'scène « trex » : carte : caractéristique « poids » sans valeur (affichée « — »)'],
    ['warning', 'fusion', 'trex', 'scène « trex » : carte : caractéristique « epoque » sans valeur (affichée « — »)'],
    ['warning', 'fusion', 'trex', 'scène « trex » : carte : caractéristique « regime » sans valeur (affichée « — »)'],
  ]);
  const none = new Report();
  checkCards(BOOK, [sceneWith(config)], none);
  assert.deepEqual(none.errors, [
    'scenes/trex.edit.json : modules.card.fields : intitulé « taille » absent de book.json (cardFields : aucun)',
    'scenes/trex.edit.json : modules.card.fields : intitulé « poid » absent de book.json (cardFields : aucun)',
  ]);
  const clean = new Report();
  checkCards({ ...BOOK, cardFields: CARD_FIELDS }, [sceneWith(mergeLayers(clone(LAYER3D), editWithCard(clone(CARD)), OPTS).config!)], clean);
  assert.deepEqual(clean.lines, []);
});

await test('CC1 : illustration copiée comme les autres assets (build) ; crédit facultatif, compté comme utilisé', async () => {
  const layer: Layer3d = {
    version: 2,
    scene: { id: 'duo' },
    modules: { animations: { mode: 'buttons', idle: { object: 'Armature_Duo', clip: 'idle', loop: true }, actions: [{ id: 'chasse', object: 'Armature_Duo', type: 'mesh', clip: 'chasse', trigger: 'button', loop: false }] } },
  };
  const edit: EditLayer = {
    version: 1,
    scene: { name: L('Duo', 'Duo', 'Dúo') },
    modules: {
      animations: { actions: { chasse: { label: L('Chasser', 'Chase', 'Perseguir') } } },
      card: { image: 'images/duo-card.webp', text: L('Deux.', 'Two.', 'Dos.') },
      credits: { assets: [{ asset: 'images/duo-card.webp', title: 'Carte', author: 'X', license: 'CC0' }] },
    },
  };
  const dir = await sourceWithGlb(layer, edit);
  try {
    const report = new Report();
    const r = await readScene(dir, 'duo', report);
    assert.ok(r && r.assets.has('images/duo-card.webp'), 'illustration copiée');
    assert.ok(!report.warnings.some((w) => w.includes('non utilisé')), 'crédit de l’illustration : utilisé');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------------------
// Types de cartes (CC3, DP-20, spec-carte-collection.md §15.7, §15.8)
// ---------------------------------------------------------------------------------------------------------

const CARD_TYPES = [
  { id: 'personnage', name: L('Personnage', 'Character', 'Personaje'), fields: CARD_FIELDS },
  { id: 'lieu', name: L('Lieu', 'Place', 'Lugar'), fields: [{ id: 'region', label: L('Région', 'Region', 'Región') }, { id: 'nom', label: L('Nom', 'Name', 'Nombre') }] },
];
const bookIssues = (extra: Record<string, unknown>) => {
  const p = bookSchema.safeParse({ ...BOOK, ...extra });
  return p.success ? [] : p.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`);
};

await test('CC3 : cardTypes valide ; un seul type, les deux formes ensemble, doublons, nom trop long refusés ; aucune version, JSON Schema inchangé', () => {
  assert.deepEqual(bookIssues({ cardTypes: CARD_TYPES }), []);
  assert.deepEqual(bookIssues({ cardTypes: [CARD_TYPES[0]] }), ['cardTypes : au moins 2 types (un seul type : cardFields)']);
  assert.deepEqual(bookIssues({ cardTypes: CARD_TYPES, cardFields: CARD_FIELDS }), ['cardTypes : cardFields et cardTypes ensemble : en garder un (cardTypes pour plusieurs types)']);
  assert.deepEqual(bookIssues({ cardTypes: [...CARD_TYPES, CARD_TYPES[1]] }), ['cardTypes : type en double « lieu »']);
  const dupField = clone(CARD_TYPES);
  dupField[1].fields.push(clone(dupField[1].fields[1]));
  assert.deepEqual(bookIssues({ cardTypes: dupField }), ['cardTypes.1.fields : intitulé en double « nom »']);
  const longName = clone(CARD_TYPES);
  longName[1].name.fr = 'Lieu-dit du sud';
  assert.deepEqual(bookIssues({ cardTypes: longName }), ['cardTypes.1.name.fr : 15 caractères (14 au plus)']);
  const empty = clone(CARD_TYPES);
  empty[1].fields = [];
  assert.deepEqual(bookIssues({ cardTypes: empty }), ['cardTypes.1.fields : au moins un intitulé par type']);
  // Formes de message de book:check (formatIssues, préfixe « book.json : »).
  // Livre 1 (cardFields) toujours valide ; JSON Schema de la couche 3D sans champ de carte.
  assert.deepEqual(bookIssues({ cardFields: CARD_FIELDS }), []);
  assert.ok(!layer3dSchemaText().includes('card'));
});

await test('CC3 : modules.card.type dans edit.json valide, recopié en tête de la carte ; refusé dans la couche 3D', () => {
  const card = { type: 'lieu', ...clone(CARD) };
  const r = mergeLayers(clone(LAYER3D), editWithCard(card), OPTS);
  assert.deepEqual(r.errors, []);
  assert.equal(Object.keys(r.config!.modules.card!)[0], 'type');
  assert.equal(r.config!.modules.card!.type, 'lieu');
  hasError(mergeLayers(clone(LAYER3D), editWithCard({ ...clone(CARD), type: 'é' }), OPTS), 'scenes/trex.edit.json : modules.card.type : identifiant de type : lettres, chiffres, _ et -');
  const g = clone(LAYER3D) as unknown as { modules: Record<string, unknown> };
  g.modules.card = { type: 'lieu', text: L('a', 'b', 'c') };
  hasError(mergeLayers(g, clone(EDIT), OPTS), 'scenes/trex.glb (couche 3D) : modules : clé « card » non admise, elle appartient à scenes/trex.edit.json');
});

await test('CC3 : checkCards : type inconnu (deux formes, une seule erreur) ; personnage admis avec cardFields ; intitulé absent du type ; messages de cardFields inchangés', () => {
  const sceneOf = (card: Record<string, unknown>) => sceneWith(mergeLayers(clone(LAYER3D), editWithCard(card), OPTS).config!);
  const lines = (book: Book, card: Record<string, unknown>) => {
    const report = new Report();
    checkCards(book, [sceneOf(card)], report);
    return report.lines.map((l) => [l.level, l.origin, l.message]);
  };
  const typed = { ...BOOK, cardTypes: CARD_TYPES } as Book;
  assert.deepEqual(lines(typed, { ...clone(CARD), type: 'arme' }), [
    ['error', 'edit', 'scenes/trex.edit.json : modules.card.type : type « arme » absent de book.json (cardTypes : personnage, lieu)'],
  ], 'type inconnu : cette seule erreur, sans les messages d’intitulés');
  assert.deepEqual(lines({ ...BOOK, cardFields: CARD_FIELDS }, { ...clone(CARD), type: 'arme' }), [
    ['error', 'edit', "scenes/trex.edit.json : modules.card.type : type « arme » absent de book.json (book.json n'a qu'un type, « personnage » : cardFields)"],
  ]);
  assert.deepEqual(lines({ ...BOOK, cardFields: CARD_FIELDS }, { ...clone(CARD), type: 'personnage' }), [], 'type « personnage » admis avec cardFields');
  assert.deepEqual(lines(typed, clone(CARD)), [], 'carte sans type : premier type (personnage)');
  assert.deepEqual(lines(typed, { ...clone(CARD), type: 'lieu', fields: { region: L('Ouest', 'West', 'Oeste'), poid: L('1', '1', '1') } }), [
    ['error', 'edit', 'scenes/trex.edit.json : modules.card.fields : intitulé « poid » absent du type « lieu » (intitulés : region, nom)'],
    ['warning', 'fusion', 'scène « trex » : carte : caractéristique « nom » sans valeur (affichée « — »)'],
  ]);
  // Avec cardFields, messages de CC1 mot pour mot (test CC1 ci-dessus) : intitulé absent et caractéristique sans valeur.
  assert.deepEqual(lines({ ...BOOK, cardFields: CARD_FIELDS }, { ...clone(CARD), fields: { poid: L('8 t', '8 t', '8 t') } })[0], [
    'error', 'edit', 'scenes/trex.edit.json : modules.card.fields : intitulé « poid » absent de book.json (cardFields : taille, poids, epoque, regime)',
  ]);
});

// ---------------------------------------------------------------------------------------------------------
// Mini-jeu (MJ1, spec-mini-jeu.md §5 à §8, §13 ; DP-21)
// ---------------------------------------------------------------------------------------------------------

const ARENA3D = { version: 1, kind: 'arena', id: 'arena' };
const PLAYER3D = {
  version: 1, kind: 'entity', id: 'dino', role: 'player', object: 'Armature_Dino',
  clips: { idle: 'dino_idle', walk: 'dino_walk', run: 'dino_run', attack: 'dino_attack' }, capsule: { radius: 0.5, height: 1.8 },
};
const PREY3D = {
  version: 1, kind: 'entity', id: 'compso', role: 'prey', object: 'Armature_Compso',
  clips: { idle: 'c_idle', walk: 'c_walk', flee: 'c_flee', caught: 'c_caught' }, capsule: { radius: 0.3, height: 0.8 },
};
const GAME_EDIT = {
  version: 1,
  rules: { duration: 300, preys: [{ entity: 'compso', count: 8 }] },
  texts: { title: L('La chasse', 'The hunt', 'La caza'), instructions: L('Attrape-les !', 'Catch them!', '¡Atrápalos!') },
  sounds: { capture: 'sounds/hop.mp3' },
  credits: { assets: [{ asset: 'sounds/hop.mp3', title: 'Hop', author: 'X', license: 'CC0' }] },
};
const GAME_BOOK: Book = { ...BOOK, game: { template: 'poursuite' } };
type GameIn = { arena?: unknown; entities?: unknown[]; edit?: unknown; book?: Book; versions?: Record<string, unknown> };
const layerIn = (raw: unknown, versions: Record<string, unknown> = {}) => {
  const id = (raw as { id: string }).id;
  return { id, raw: clone(raw), version: id in versions ? versions[id] : 1 };
};
const game = (g: GameIn = {}, mode: 'strict' | 'draft' = 'strict') =>
  mergeGame(
    {
      book: g.book ?? GAME_BOOK,
      cards: [{ card: 'trex', type: 'personnage' }],
      arena: g.arena === null ? null : layerIn(g.arena ?? ARENA3D, g.versions),
      entities: (g.entities ?? [PLAYER3D, PREY3D]).map((e) => layerIn(e, g.versions)),
      edit: 'edit' in g ? g.edit : clone(GAME_EDIT),
    },
    { mode },
  );

await test('MJ1 : jeu nominal : objet fusionné valide, gabarit de book.json, valeurs par défaut du §6, aucune copie des cartes', () => {
  const r = game();
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.ok(r.config && gameConfigSchema.safeParse(r.config).success);
  assert.equal(r.config.version, 1);
  assert.equal(r.config.template, 'poursuite');
  assert.deepEqual(r.config.entities.map((e) => e.id), ['dino', 'compso']);
  assert.ok(!('kind' in r.config.entities[0]) && !('version' in r.config.entities[0]), 'entités sans version ni kind');
  assert.deepEqual(r.config.rules, { duration: 300, preys: [{ entity: 'compso', count: 8 }], playerSpeed: 6, preySpeed: 5, detectionRadius: 6, points: 1, respawn: true });
  assert.deepEqual(r.config.camera, { distance: 14 });
  assert.ok(!JSON.stringify(r.config).includes('trex'), 'cartes reçues, rien de copié (DP-21)');
  // Une seule sorte de proie, règles absentes : 8 proies par défaut (décision du 28/10).
  const bare = game({ edit: { version: 1, texts: GAME_EDIT.texts } });
  assert.deepEqual(bare.errors, []);
  assert.deepEqual(bare.config!.rules.preys, [{ entity: 'compso', count: 8 }]);
  assert.equal(bare.config!.rules.duration, 300);
  // Builds existants : un livre sans `game` reste valide, `game` n'admet que « poursuite ».
  assert.ok(bookSchema.safeParse(BOOK).success);
  assert.ok(bookSchema.safeParse(GAME_BOOK).success);
  assert.equal(bookSchema.safeParse({ ...BOOK, game: { template: 'baston' } }).success, false);
  assert.equal(bookSchema.safeParse({ ...BOOK, game: { template: 'poursuite', seuil: 2 } }).success, false);
});

await test('MJ1 : couche 3D du jeu : version, kind, id, rôles de clip obligatoires, capsule, joueur unique (messages exacts)', () => {
  hasError(game({ versions: { arena: 2 } }), "game/arena.glb : glbi_game_version doit être l'entier 1 (trouvé : 2)");
  hasError(game({ entities: [{ ...PLAYER3D, version: 2 }, PREY3D] }), 'game/dino.glb (couche 3D du jeu) : version vaut 2, glbi_game_version vaut 1 (doivent être égaux)');
  hasError(game({ arena: { ...ARENA3D, kind: 'entity' } }), "game/arena.glb (couche 3D du jeu) : kind vaut « entity », attendu « arena » (exporter en mode « Arène » de l'addon)");
  hasError(game({ entities: [{ ...PLAYER3D, kind: 'arena' }, PREY3D] }), "game/dino.glb (couche 3D du jeu) : kind vaut « arena », attendu « entity » (exporter en mode « Entité de jeu » de l'addon)");
  hasError(game({ arena: null }), "game/arena.glb absent du dossier source : exporter l'arène avec l'addon (mode « Arène »)");
  const noAttack = { ...PLAYER3D, clips: { idle: 'a', walk: 'b', run: 'c' } };
  hasError(game({ entities: [noAttack, PREY3D] }), 'game/dino.glb (couche 3D du jeu) : clips.attack : rôle de clip « attack » obligatoire pour le joueur');
  const noFlee = { ...PREY3D, clips: { idle: 'a', walk: 'b', caught: 'c' } };
  hasError(game({ entities: [PLAYER3D, noFlee] }), 'game/compso.glb (couche 3D du jeu) : clips : rôle de clip « run » ou « flee » obligatoire pour une proie (fuite)');
  const noCaught = { ...PREY3D, clips: { idle: 'a', walk: 'b', run: 'c' } };
  hasError(game({ entities: [PLAYER3D, noCaught] }), 'game/compso.glb (couche 3D du jeu) : clips.caught : rôle de clip « caught » obligatoire pour une proie');
  hasError(game({ entities: [{ ...PLAYER3D, capsule: { radius: 1, height: 1.5 } }, PREY3D] }), 'game/dino.glb (couche 3D du jeu) : capsule.height : hauteur de la capsule (1.5 m) inférieure à son diamètre (2 m)');
  hasError(game({ entities: [{ ...PLAYER3D, id: 'arena' }, PREY3D] }), "game/arena.glb (couche 3D du jeu) : id : « arena » est réservé à l'arène (game/arena.glb)");
  const renamed = mergeGame({ book: GAME_BOOK, cards: [], arena: layerIn(ARENA3D), entities: [{ id: 'rex', raw: clone(PLAYER3D), version: 1 }, layerIn(PREY3D)], edit: clone(GAME_EDIT) }, { mode: 'strict' });
  hasError(renamed, 'game/rex.glb (couche 3D du jeu) : id vaut « dino », attendu « rex » (nom du fichier)');
  hasError(game({ entities: [{ ...PLAYER3D, rules: {} }, PREY3D] }), 'game/dino.glb (couche 3D du jeu) : (racine) : clé « rules » non admise, elle appartient à game/game.edit.json');
  hasError(game({ entities: [PLAYER3D, { ...PLAYER3D, id: 'rex2' }, PREY3D] }), 'jeu : 2 entités joueur (dino, rex2) : une seule attendue');
  hasError(game({ entities: [PREY3D] }), 'jeu : aucune entité joueur (role « player ») dans game/');
  hasError(game({ entities: [PLAYER3D] }), 'jeu : aucune entité proie (role « prey ») dans game/');
  hasError(game({ entities: [] }), "jeu : aucune entité dans game/ (game/<entité>.glb, addon en mode « Entité de jeu »)");
});

await test('MJ1 : couche éditoriale du jeu : bornes du §6, 12 proies au plus, proie inconnue ou joueur, textes, clés mal placées', () => {
  const withRules = (rules: Record<string, unknown>) => game({ edit: { ...clone(GAME_EDIT), rules: { ...GAME_EDIT.rules, ...rules } } });
  hasError(withRules({ duration: 200 }), 'game/game.edit.json : rules.duration : durée (s) : 300 au moins');
  hasError(withRules({ duration: 700 }), 'game/game.edit.json : rules.duration : durée (s) : 600 au plus');
  hasError(withRules({ preys: [{ entity: 'compso', count: 13 }] }), 'game/game.edit.json : rules.preys.0.count : nombre de proies : 12 au plus');
  const two = { ...PREY3D, id: 'ptero' };
  const many = game({ entities: [PLAYER3D, PREY3D, two], edit: { ...clone(GAME_EDIT), rules: { preys: [{ entity: 'compso', count: 8 }, { entity: 'ptero', count: 5 }] } } });
  hasError(many, 'game/game.edit.json : rules.preys : 13 proies en même temps (12 au plus)');
  assert.deepEqual(game({ entities: [PLAYER3D, PREY3D, two], edit: { ...clone(GAME_EDIT), rules: { preys: [{ entity: 'compso', count: 8 }, { entity: 'ptero', count: 4 }] } } }).errors, [], '12 au total admis');
  hasError(withRules({ playerSpeed: 25 }), 'game/game.edit.json : rules.playerSpeed : vitesse du joueur (m/s) : 20 au plus');
  hasError(withRules({ detectionRadius: 0.5 }), 'game/game.edit.json : rules.detectionRadius : rayon de détection (m) : 1 au moins');
  hasError(withRules({ points: 11 }), 'game/game.edit.json : rules.points : points par capture : 10 au plus');
  hasError(game({ edit: { ...clone(GAME_EDIT), camera: { distance: 3 } } }), 'game/game.edit.json : camera.distance : distance de la caméra (m) : 4 au moins');
  hasError(withRules({ preys: [{ entity: 'tricera', count: 2 }] }), 'game/game.edit.json : rules.preys.0.entity : entité « tricera » absente de game/ (proies : compso)');
  hasError(withRules({ preys: [{ entity: 'dino', count: 2 }] }), 'game/game.edit.json : rules.preys.0.entity : « dino » est le joueur, pas une proie (proies : compso)');
  const several = game({ entities: [PLAYER3D, PREY3D, two], edit: { version: 1, texts: GAME_EDIT.texts } });
  hasError(several, "jeu : rules.preys absent de game/game.edit.json : plusieurs sortes de proies (compso, ptero), à choisir dans l'atelier");
  const unused = game({ entities: [PLAYER3D, PREY3D, two] });
  assert.deepEqual(unused.errors, []);
  assert.deepEqual(unused.warnings, ['jeu : proie « ptero » non citée par rules.preys (game/game.edit.json) : jamais en jeu']);
  hasError(game({ edit: { version: 1, rules: GAME_EDIT.rules } }), "jeu : titre du jeu (texts.title) absent de game/game.edit.json ; à renseigner dans l'atelier");
  hasError(game({ edit: { version: 1, rules: GAME_EDIT.rules } }), "jeu : consigne du jeu (texts.instructions) absente de game/game.edit.json ; à renseigner dans l'atelier");
  hasError(game({ edit: undefined }), "jeu : game/game.edit.json absent ; à renseigner dans l'atelier (entrée « Jeu ») ou à la main");
  hasError(game({ edit: { ...clone(GAME_EDIT), capsule: { radius: 1 } } }), 'game/game.edit.json : (racine) : clé « capsule » non admise, elle appartient aux GLB du jeu (addon)');
  hasError(game({ edit: { ...clone(GAME_EDIT), version: 2 } }), 'game/game.edit.json : version : Entrée invalide : 1 attendu');
  // Mode `draft` (atelier, MJ3) : objet affichable malgré un titre absent.
  const d = game({ edit: { version: 1 } }, 'draft');
  assert.equal(d.config, null);
  assert.ok(d.draft && d.draft.texts.title.fr === 'Mini-jeu' && d.draft.rules.preys[0].entity === 'compso');
});

await test('MJ1 (DP-21) : clé « rewards » réservée, refusée dans game.edit.json et l’objet fusionné avec le message réservé', () => {
  hasError(game({ edit: { ...clone(GAME_EDIT), rewards: [] } }), 'game/game.edit.json : (racine) : clé « rewards » réservée (éléments du jeu apportés par les cartes), non activable en v1');
  const r = gameConfigSchema.safeParse({ ...game().config, rewards: {} });
  assert.equal(r.success, false);
  assert.deepEqual(r.success ? [] : r.error.issues.map((i) => i.message), ['clé « rewards » réservée (éléments du jeu apportés par les cartes), non activable en v1']);
  const e = gameEditSchema.safeParse({ ...clone(GAME_EDIT), rewards: [], extra: 1 });
  assert.equal(e.success, false);
  assert.ok(!e.success && e.error.issues[0].message.includes('clé « extra » inconnue'));
  // Signature : book.json et cartes des scènes reçus, sans contrôle en v1 (une carte inexistante ne gêne pas).
  const withCards = mergeGame({ book: GAME_BOOK, cards: [{ card: 'inconnue', type: 'arme' }], arena: layerIn(ARENA3D), entities: [layerIn(PLAYER3D), layerIn(PREY3D)], edit: clone(GAME_EDIT) }, { mode: 'strict' });
  assert.deepEqual(withCards.errors, []);
});

await test('MJ1 : JSON Schema de la couche 3D du jeu : entité et arène sous $defs, mots-clés de schema_check.py, à jour', () => {
  const doc = JSON.parse(game3dSchemaText());
  assert.equal(doc.$id, 'urn:glbinterpreter:schema:game3d/1');
  assert.deepEqual(Object.keys(doc.$defs), ['entity', 'arena']);
  const allowed = new Set(['type', 'properties', 'required', 'additionalProperties', 'pattern', 'enum', 'const', 'minimum', 'maximum', 'minItems', 'items', 'default']);
  const used = new Set<string>();
  const walk = (s: unknown, inProps = false) => {
    if (!s || typeof s !== 'object') return;
    for (const [k, v] of Object.entries(s)) {
      if (!inProps) used.add(k);
      if (k === 'properties') for (const sub of Object.values(v as object)) walk(sub);
      else if (k === 'items' || (k === 'additionalProperties' && typeof v === 'object')) walk(v);
    }
  };
  walk(doc.$defs.entity);
  walk(doc.$defs.arena);
  assert.deepEqual([...used].filter((k) => !allowed.has(k)), [], 'mots-clés hors du sous-ensemble de schema_check.py');
  assert.deepEqual(doc.$defs.entity.properties.role.enum, ['player', 'prey']);
  assert.equal(doc.$defs.arena.properties.kind.const, 'arena');
  assert.ok(game3dArenaSchema.safeParse(ARENA3D).success && game3dEntitySchema.safeParse(PLAYER3D).success);
  assert.equal(checkSchemaFresh(), null);
});

/** Dossier source avec un jeu écrit par make-test-book (MJ1), options passées au script. */
function testBookWithGame(...opts: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glbi-mj1-'));
  const r = spawnSync(process.execPath, [...process.execArgv, path.join(ROOT, 'scripts/make-test-book.ts'), dir, ...opts], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return dir;
}

/** Arène écrite dans `dir` avec seulement les nœuds `names` (maillage plaque pour COL_ et FADE_, empty sinon). */
async function writeArena(dir: string, names: string[], triangles = 2): Promise<void> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Scene');
  for (const name of names) {
    const node = doc.createNode(name);
    if (/^(COL_|FADE_)/.test(name) && !name.endsWith('_vide')) {
      const pos = new Float32Array(triangles * 9).map((_, i) => (i % 9) / 9 + Math.floor(i / 9));
      node.setMesh(doc.createMesh(`${name}_mesh`).addPrimitive(doc.createPrimitive().setAttribute('POSITION', doc.createAccessor().setType('VEC3').setBuffer(buffer).setArray(pos))));
    }
    scene.addChild(node);
  }
  scene.addChild(doc.createNode('GLBI_ROOT').setExtras({ glbi_game_version: 1, glbi_game_config: JSON.stringify(ARENA3D) }));
  await new NodeIO().write(path.join(dir, 'game/arena.glb'), doc);
}

const gameLines = (r: Report) => r.lines.filter((l) => l.scene === null && !l.message.startsWith('book.json') && !l.message.startsWith('fichier(s)')).map((l) => [l.level, l.origin, l.message]);

await test('MJ1 : book:check du jeu (livre de test) : sans erreur ; capsule de plus de 1,2 m : avertissement ; livre sans game : jeu ignoré', async () => {
  const dir = testBookWithGame();
  const ok = new Report();
  const checked = await checkBookSource(dir, ok, undefined, { textures: 'keep' });
  assert.deepEqual(ok.errors, []);
  assert.ok(checked?.game);
  assert.deepEqual(checked.game.glbs.map((g) => g.rel), ['game/arena.glb', 'game/compso.glb', 'game/dino.glb']);
  assert.ok(checked.assets.has('sounds/jeu_capture.wav') && checked.assets.has('sounds/jeu_musique.wav'), 'sons du jeu copiés');
  assert.deepEqual(gameLines(ok), []);
  const big = testBookWithGame('--capsule', '1.5');
  const w = new Report();
  await checkBookSource(big, w, undefined, { textures: 'keep' });
  assert.deepEqual(w.errors, []);
  assert.deepEqual(gameLines(w), [
    ['warning', 'glb', "game/dino.glb : capsule de 1,5 m de rayon (1,2 m au plus, cas mesuré au spike MJ0) : coût du pas physique non mesuré au-delà ; réduire la capsule ou l'échelle de l'entité dans Blender"],
  ]);
  // Jeu présent dans game/ mais book.json sans game : ignoré (avertissement), aucun GLB du jeu lu.
  const book = JSON.parse(fs.readFileSync(path.join(dir, 'book.json'), 'utf8'));
  delete book.game;
  fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify(book));
  const none = new Report();
  const c2 = await checkBookSource(dir, none, undefined, { textures: 'keep' });
  assert.equal(c2?.game, null);
  assert.ok(none.warnings.includes("game/ : fichiers du jeu présents mais book.json n'a pas de game : jeu ignoré, non publié"));
});

await test('MJ1 : contrôles croisés des GLB du jeu : points d’apparition, sol, collisionneurs, triangles, clips, objet, COLLIDER', async () => {
  const dir = testBookWithGame();
  const lines = async () => {
    const r = new Report();
    await checkBookSource(dir, r, undefined, { textures: 'keep' });
    return gameLines(r);
  };
  await writeArena(dir, ['COL_mur', 'FADE_vide']);
  assert.deepEqual(await lines(), [
    ['error', 'glb', "game/arena.glb : pas de point d'apparition du joueur (empty « SPAWN_player »)"],
    ['error', 'glb', "game/arena.glb : pas de point d'apparition des proies (empties « SPAWN_prey_1 », « SPAWN_prey_2 »…)"],
    ['error', 'glb', 'game/arena.glb : pas de sol (maillage « COL_sol »)'],
    ['warning', 'glb', 'game/arena.glb : décor « FADE_vide » (FADE_) sans maillage : rien à rendre transparent'],
  ]);
  await writeArena(dir, ['SPAWN_player', 'SPAWN_player', 'SPAWN_prey_1', 'COL_sol', 'COL_vide'], 2600);
  assert.deepEqual(await lines(), [
    ['warning', 'glb', 'game/arena.glb : 2 nœuds « SPAWN_player » : un seul sera utilisé'],
    ['warning', 'glb', "game/arena.glb : 1 point(s) d'apparition des proies pour 4 proies en même temps : plusieurs apparaîtront au même endroit"],
    ['error', 'glb', 'game/arena.glb : collisionneur « COL_vide » sans maillage'],
  ]);
  await writeArena(dir, ['SPAWN_player', 'SPAWN_prey_1', 'SPAWN_prey_2', 'SPAWN_prey_3', 'SPAWN_prey_4', 'COL_sol', 'COL_mur'], 2600);
  assert.deepEqual(await lines(), [
    ['warning', 'glb', 'game/arena.glb : collisionneurs COL_* de 5200 triangles (5000 au plus, budget du gabarit « poursuite ») : simplifier les maillages COL_* dans Blender'],
  ]);
  // Entité : clip et objet absents du GLB, COLLIDER déclaré absent (couche 3D réécrite dans le GLB du joueur).
  const file = path.join(dir, 'game/dino.glb');
  const io = new NodeIO();
  const doc = await io.read(file);
  const root = doc.getRoot().listNodes().find((n) => n.getName() === 'GLBI_ROOT')!;
  const cfg = JSON.parse(root.getExtras().glbi_game_config as string);
  root.setExtras({ glbi_game_version: 1, glbi_game_config: JSON.stringify({ ...cfg, object: 'Armature_Rex', clips: { ...cfg.clips, attack: 'dino_bond' }, collider: 'COLLIDER' }) });
  await io.write(file, doc);
  await writeArena(dir, ['SPAWN_player', 'SPAWN_prey_1', 'SPAWN_prey_2', 'SPAWN_prey_3', 'SPAWN_prey_4', 'COL_sol']);
  assert.deepEqual(await lines(), [
    ['error', 'glb', 'game/dino.glb : object « Armature_Rex » introuvable dans le GLB (V-08)'],
    ['error', 'glb', 'game/dino.glb : clips.attack : clip « dino_bond » absent du GLB'],
    ['warning', 'glb', 'game/dino.glb : clip(s) du GLB non déclaré(s) : dino_attack'],
    ['error', 'glb', 'game/dino.glb : collider « COLLIDER » introuvable dans le GLB (V-08)'],
  ]);
});

await test('JSON Schema de la couche 3D (et de la couche 3D du jeu) commité à jour', () => {
  assert.equal(checkSchemaFresh(), null);
});

console.log(`test:schema : ${n} test(s) réussi(s)`);
