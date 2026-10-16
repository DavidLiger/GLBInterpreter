// scripts/test-engine.ts — tests du moteur sans navigateur (Î10b). `npm run test:engine`.
// Cadrage orbital (`lib/orbitFraming.ts`), mode `buttons` (`lib/buttonsPlayer.ts`), boucle unique (`lib/frameTasks.ts`),
// éclairage de secours (`lib/fallbackLights.ts`), lecture libre d'un clip (`lib/clipPreview.ts`), onglet Caméra de l'atelier (`src/atelier/cameraForm.ts`, A4).
// Les mixers tournent sur une scène three minimale (un os animé), le temps est avancé à la main.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ORBIT_DEFAULTS, orbitPosition, resolveOrbit, sceneRadius } from '../src/components/diorama/lib/orbitFraming';
import { ButtonsPlayer, type ActionEvent } from '../src/components/diorama/lib/buttonsPlayer';
import { FrameTasks } from '../src/components/diorama/lib/frameTasks';
import { addFallbackLightsIfNone, FALLBACK_LIGHTS_NAME } from '../src/components/diorama/lib/fallbackLights';
import { ClipPreview } from '../src/components/diorama/lib/clipPreview';
import { applyFramingInPlace, cameraFormFromRaw, cameraLayerOf, framingOf, takeFromView, viewOf, withFields } from '../src/atelier/cameraForm';
import { editLayerSchema } from '../src/schema/glbi';

let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${(e as Error).message}`);
  }
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const quiet = { warn: () => {} };

// ────────────── Cadrage ──────────────
console.log('Cadrage orbital');

test('valeurs par défaut (cible seule) : 1,5 r – 6 r, zoom 0,5, polaire 70° dans [0, 90°], azimut libre, face', () => {
  const f = resolveOrbit({}, 2);
  assert.ok(near(f.minDistance, 3) && near(f.maxDistance, 12));
  assert.ok(near(f.distance, 3 + 0.5 * 9));
  assert.ok(near(f.polarAngle, (70 * Math.PI) / 180));
  assert.ok(near(f.minPolarAngle, 0) && near(f.maxPolarAngle, Math.PI / 2));
  assert.equal(f.minAzimuthAngle, -Infinity);
  assert.equal(f.maxAzimuthAngle, Infinity);
  assert.equal(f.azimuthAngle, 0);
  assert.equal(f.enableZoom, true);
  assert.equal(f.enablePan, false);
  assert.equal(f.dampingFactor, ORBIT_DEFAULTS.dampingFactor);
});

test('zoom = position dans la plage : 0 → min, 1 → max (décision du 13/10)', () => {
  assert.ok(near(resolveOrbit({ zoom: 0, minDistance: 1, maxDistance: 20 }, 1).distance, 1));
  assert.ok(near(resolveOrbit({ zoom: 1, minDistance: 1, maxDistance: 20 }, 1).distance, 20));
  assert.ok(near(resolveOrbit({ zoom: 0.25, minDistance: 2, maxDistance: 10 }, 1).distance, 4));
  assert.ok(near(resolveOrbit({ zoom: 7, minDistance: 2, maxDistance: 10 }, 1).distance, 10), 'zoom hors [0, 1] borné');
});

test('milieu d’azimut sans normaliser la différence : [−3,14 ; 3,14] → 0 (P-18, P-19)', () => {
  assert.ok(near(resolveOrbit({ minAzimuthAngle: -3.14, maxAzimuthAngle: 3.14 }, 1).azimuthAngle, 0));
  assert.ok(near(resolveOrbit({ minAzimuthAngle: 1.14, maxAzimuthAngle: 2.14 }, 1).azimuthAngle, 1.64));
});

test('champ par champ : une distance déclarée garde la valeur par défaut de l’autre', () => {
  const f = resolveOrbit({ maxDistance: 2 }, 4); // min par défaut 6 > max déclaré 2 → ramené à 2
  assert.ok(near(f.minDistance, 2) && near(f.maxDistance, 2));
  const g = resolveOrbit({ minDistance: 1 }, 1);
  assert.ok(near(g.minDistance, 1) && near(g.maxDistance, 6));
});

test('bornes polaires déclarées : départ au milieu', () => {
  assert.ok(near(resolveOrbit({ minPolarAngle: 1, maxPolarAngle: 1.5 }, 1).polarAngle, 1.25));
});

test('convention d’OrbitControls : azimut 0 = caméra sur +Z (face Blender), π/2 = +X ; lookAxis x = profil', () => {
  const t = new THREE.Vector3(1, 2, 3);
  const face = orbitPosition(t, { distance: 5, polarAngle: Math.PI / 2, azimuthAngle: 0 });
  assert.ok(near(face.x, 1) && near(face.y, 2) && near(face.z, 8));
  const side = orbitPosition(t, { distance: 5, polarAngle: Math.PI / 2, azimuthAngle: Math.PI / 2 });
  assert.ok(near(side.x, 6) && near(side.z, 3));
  assert.ok(near(resolveOrbit({ lookAxis: 'x' }, 1).azimuthAngle, Math.PI / 2));
  assert.ok(near(resolveOrbit({ lookAxis: 'z' }, 1).azimuthAngle, 0));
  // Même convention que les contrôles : l'azimut se relit à l'identique dans un Spherical de three
  const s = new THREE.Spherical().setFromVector3(new THREE.Vector3().subVectors(side, t));
  assert.ok(near(s.theta, Math.PI / 2) && near(s.phi, Math.PI / 2));
});

test('rayon de la sphère englobante (positions monde)', () => {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  root.add(mesh);
  root.scale.setScalar(10);
  assert.ok(near(sceneRadius(root), Math.sqrt(3) * 10, 1e-4));
  assert.equal(sceneRadius(new THREE.Group()), 1);
});

test('rayon mesuré sur la pose courante d’un maillage skinné (boîte recalculée, pas celle du repos)', () => {
  const root = new THREE.Group();
  const arm = new THREE.Group();
  arm.scale.setScalar(0.018); // armature importée en centimètres
  root.add(arm);
  const geo = new THREE.BoxGeometry(100, 100, 100);
  const n = geo.attributes.position.count;
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: n * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0)), 4));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
  const bone = new THREE.Bone();
  arm.add(bone, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([bone]));
  const rest = sceneRadius(root); // cube de 1,8 m
  assert.ok(near(rest, Math.sqrt(3) * 0.9, 1e-3), `repos ${rest}`);
  bone.scale.setScalar(2 / 1.8); // pose : cube de 2 m
  assert.ok(near(sceneRadius(root), Math.sqrt(3), 1e-3), `pose ${sceneRadius(root)}`);
});

// ────────────── Mode buttons ──────────────
console.log('Mode buttons');

/** Scène minimale : un os animé par chaque clip (rotation), durées données. */
function rig(durations: Record<string, number>) {
  const root = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = 'tail';
  root.add(bone);
  const clips = Object.entries(durations).map(([name, d], i) =>
    new THREE.AnimationClip(name, d, [new THREE.NumberKeyframeTrack('tail.position[x]', [0, d], [i, i + 0.5])]),
  );
  const mixer = new THREE.AnimationMixer(root);
  return { root, clips, mixer };
}

function setup(loopRoar = false) {
  const { root, clips, mixer } = rig({ idle: 1, walk: 0.75, roar: 1, eat: 1.25 });
  const events: string[] = [];
  const changes: (string | null)[] = [];
  const player = new ButtonsPlayer(
    mixer,
    clips,
    {
      idle: { clip: 'idle', loop: true },
      actions: [
        { id: 'walk', clip: 'walk' },
        { id: 'roar', clip: 'roar', loop: loopRoar },
        { id: 'eat', clip: 'eat' },
      ],
    },
    { onAction: (e: ActionEvent) => events.push(`${e.id}:${e.phase}`), onChange: (c) => changes.push(c), ...quiet },
  );
  const step = (seconds: number, dt = 1 / 60) => {
    for (let t = 0; t < seconds - 1e-9; t += dt) {
      player.tick(dt);
      mixer.update(dt);
    }
  };
  const action = (name: string) => mixer.existingAction(clips.find((c) => c.name === name)!)!;
  const weightSum = () => ['idle', 'walk', 'roar', 'eat'].reduce((s, n) => s + (action(n)?.isRunning() || action(n)?.paused ? action(n).getEffectiveWeight() : 0), 0);
  return { root, mixer, player, events, changes, step, action, weightSum };
}

test('idle en boucle au chargement, aucun événement', () => {
  const s = setup();
  s.player.start();
  s.step(3);
  assert.ok(s.action('idle').isRunning());
  assert.ok(near(s.action('idle').getEffectiveWeight(), 1));
  assert.deepEqual(s.events, []);
  assert.equal(s.player.currentId, null);
});

test('clic sur une action : start, fondu 0,25 s, fin → end une seule fois, retour à idle', () => {
  const s = setup();
  s.player.start();
  s.step(0.2);
  s.player.trigger('walk');
  assert.deepEqual(s.events, ['walk:start']);
  s.step(0.125);
  const w = s.action('walk').getEffectiveWeight();
  assert.ok(w > 0.3 && w < 0.7, `poids au milieu du fondu : ${w}`);
  assert.ok(near(s.weightSum(), 1, 1e-3), `somme des poids ${s.weightSum()}`);
  s.step(2);
  assert.deepEqual(s.events, ['walk:start', 'walk:end']);
  assert.equal(s.player.currentId, null);
  assert.ok(s.action('idle').isRunning() && near(s.action('idle').getEffectiveWeight(), 1));
  assert.ok(!s.action('walk').isRunning(), 'walk arrêtée après le fondu');
  assert.deepEqual(s.changes, [null, 'walk', null]);
});

test('clic pendant une action : interrupt, nouvelle action, un seul retour à idle', () => {
  const s = setup();
  s.player.start();
  s.player.trigger('walk');
  s.step(0.4);
  s.player.trigger('eat');
  s.step(0.1);
  assert.ok(near(s.weightSum(), 1, 1e-3), `somme des poids ${s.weightSum()}`);
  s.player.trigger('roar'); // clic au milieu d'un fondu
  assert.ok(near(s.weightSum(), 1, 1e-3), `somme des poids après clic au milieu d'un fondu ${s.weightSum()}`);
  s.step(3);
  assert.deepEqual(s.events, ['walk:start', 'walk:interrupt', 'eat:start', 'eat:interrupt', 'roar:start', 'roar:end']);
  assert.equal(s.events.filter((e) => e.endsWith(':end')).length, 1);
  assert.equal(s.player.currentId, null);
});

test('clic sur l’action en cours : relance depuis le début, sans fondu', () => {
  const s = setup();
  s.player.start();
  s.player.trigger('roar');
  s.step(0.6);
  const before = s.action('roar').time;
  s.player.trigger('roar');
  assert.ok(s.action('roar').time < before, 'relancée au début');
  s.step(0.6); // 1,2 s après le premier clic : la première lecture serait finie
  assert.deepEqual(s.events, ['roar:start', 'roar:interrupt', 'roar:start']);
  s.step(1);
  assert.deepEqual(s.events, ['roar:start', 'roar:interrupt', 'roar:start', 'roar:end']);
});

test('action loop: true : tourne jusqu’au prochain clic ; son propre bouton l’arrête (end)', () => {
  const s = setup(true);
  s.player.start();
  s.player.trigger('roar');
  s.step(5);
  assert.deepEqual(s.events, ['roar:start']);
  s.player.trigger('roar');
  s.step(1);
  assert.deepEqual(s.events, ['roar:start', 'roar:end']);
  assert.ok(near(s.action('idle').getEffectiveWeight(), 1));
});

test('pose finale tenue pendant le fondu vers idle (clampWhenFinished)', () => {
  const s = setup();
  s.player.start();
  s.player.trigger('walk');
  s.step(0.8); // walk (0,75 s) vient de finir
  const walk = s.action('walk');
  assert.ok(walk.clampWhenFinished);
  assert.ok(near(walk.time, 0.75, 1e-6), `temps tenu ${walk.time}`);
});

test('suspend / resume (lecture libre de l’atelier) : interrupt, puis idle', () => {
  const s = setup();
  s.player.start();
  s.player.trigger('walk');
  s.player.suspend();
  assert.deepEqual(s.events, ['walk:start', 'walk:interrupt']);
  s.player.trigger('eat'); // ignoré pendant la pause
  assert.deepEqual(s.events, ['walk:start', 'walk:interrupt']);
  s.player.resume();
  s.step(0.5);
  assert.ok(s.action('idle').isRunning());
  s.player.dispose();
});

test('clip absent du GLB : avertissement, bouton sans effet', () => {
  const { clips, mixer } = rig({ idle: 1 });
  const warnings: string[] = [];
  const p = new ButtonsPlayer(mixer, clips, { idle: { clip: 'idle' }, actions: [{ id: 'walk', clip: 'walk' }] }, { warn: (m) => warnings.push(m) });
  p.start();
  p.trigger('walk');
  assert.equal(warnings.length, 2);
  assert.deepEqual(p.actionIds, []);
});

// ────────────── Boucle unique ──────────────
console.log('Boucle unique et outils');

test('FrameTasks : exécution, retrait par false ou par la fonction rendue', () => {
  const ft = new FrameTasks();
  let a = 0;
  let b = 0;
  ft.add(() => {
    a++;
    return a < 3;
  });
  const removeB = ft.add(() => {
    b++;
  });
  for (let i = 0; i < 5; i++) ft.run(0.016, i);
  assert.equal(a, 3);
  assert.equal(b, 5);
  removeB();
  ft.run(0.016, 6);
  assert.equal(b, 5);
  assert.equal(ft.size, 0);
});

test('éclairage de secours seulement sans lumière (D-8.10)', () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    const lit = new THREE.Scene();
    lit.add(new THREE.PointLight());
    assert.equal(addFallbackLightsIfNone(lit, 1), null);
    const dark = new THREE.Scene();
    const g = addFallbackLightsIfNone(dark, 2);
    assert.ok(g && g.name === FALLBACK_LIGHTS_NAME);
    assert.equal(addFallbackLightsIfNone(dark, 2), null, 'pas deux fois');
  } finally {
    console.warn = warn;
  }
});

test('lecture libre d’un clip : suspend le mode buttons, boucle, vitesse, reprise à idle', () => {
  const s = setup();
  s.player.start();
  const tasks = new FrameTasks();
  const clips = ['idle', 'walk', 'roar', 'eat'].map((n) => s.action(n).getClip());
  const preview = new ClipPreview({ root: s.root, clips, frameTasks: tasks, buttons: s.player });
  assert.equal(preview.play('absent'), false);
  assert.ok(preview.play('eat', { speed: 5 }));
  assert.ok(s.player.isSuspended);
  for (let i = 0; i < 60; i++) tasks.run(1 / 60, i);
  const t = preview.time!;
  assert.ok(near(t.duration, 1.25));
  assert.ok(t.current > 0, 'le clip avance par la boucle unique');
  preview.stop();
  assert.equal(tasks.size, 0);
  assert.ok(!s.player.isSuspended && s.action('idle').isRunning());
  preview.dispose();
});

// ────────────── Atelier, onglet Caméra (A4) ──────────────
console.log('Atelier : onglet Caméra (A4)');

const validLayer = (camera: unknown) => editLayerSchema.safeParse({ version: 1, modules: camera ? { camera } : {} }).success;

test('cadrage non touché : relu et écrit tel quel, au bit près', () => {
  const raw = { zoom: 0.5, lookAxis: 'x', minDistance: 1, maxDistance: 20, minPolarAngle: 0, maxPolarAngle: 1.57, minAzimuthAngle: -3.14, maxAzimuthAngle: 3.14, enableZoom: true };
  const f = cameraFormFromRaw(raw);
  assert.equal(f.text.maxPolarAngle, '89.9544');
  const { camera, issues } = cameraLayerOf(f);
  assert.equal(issues.length, 0);
  assert.equal(camera, raw);
});

test('champ modifié : degrés écrits en radians (6 décimales) ; les autres gardent la valeur du fichier', () => {
  const f = withFields(cameraFormFromRaw({ maxPolarAngle: 1.57, minAzimuthAngle: -3.14 }), { text: { maxPolarAngle: '80' } });
  const { camera, issues } = cameraLayerOf(f);
  assert.equal(issues.length, 0);
  assert.deepEqual(camera, { maxPolarAngle: 1.396263, minAzimuthAngle: -3.14 });
  assert.ok(validLayer(camera));
});

test('180° et ±360° restent dans les bornes du contrat après arrondi', () => {
  const f = withFields(cameraFormFromRaw(undefined), { text: { minPolarAngle: '0', maxPolarAngle: '180', minAzimuthAngle: '-360', maxAzimuthAngle: '360' } });
  const { camera, issues } = cameraLayerOf(f);
  assert.equal(issues.length, 0);
  assert.ok(validLayer(camera), JSON.stringify(camera));
});

test('champ illisible ou hors bornes : non écrit, signalé ; les champs valides sont écrits', () => {
  const f = withFields(cameraFormFromRaw(undefined), { text: { zoom: '1.5', minDistance: 'abc', maxDistance: '8' } });
  const { camera, issues } = cameraLayerOf(f);
  assert.deepEqual(camera, { maxDistance: 8 });
  assert.deepEqual(issues.map((i) => i.field), ['zoom', 'minDistance']);
  assert.ok(validLayer(camera));
});

test('paire incohérente (min > max) : aucune des deux bornes écrite, signalée sur la borne min', () => {
  const f = withFields(cameraFormFromRaw({ minDistance: 1, maxDistance: 5, zoom: 0.25 }), { text: { minDistance: '6' } });
  const { camera, issues } = cameraLayerOf(f);
  assert.deepEqual(camera, { zoom: 0.25 });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].field, 'minDistance');
  assert.ok(validLayer(camera));
});

test('virgule décimale acceptée ; enableZoom écrit seulement s’il passe à faux ; tout vidé → pas de cadrage', () => {
  let f = withFields(cameraFormFromRaw(undefined), { text: { minDistance: '1,5' }, enableZoom: false });
  assert.deepEqual(cameraLayerOf(f).camera, { minDistance: 1.5, enableZoom: false });
  f = withFields(cameraFormFromRaw({ minDistance: 2 }), { text: { minDistance: '' } });
  assert.equal(cameraLayerOf(f).camera, undefined);
});

test('vue actuelle : distance, polaire, azimut (convention d’OrbitControls) et zoom pris dans la vue', () => {
  const target = new THREE.Vector3(0, 1, 0);
  const cam = new THREE.Vector3(3, 1, 0); // sur +X, à l'horizontale
  const v = viewOf(cam, target);
  assert.ok(near(v.distance, 3) && near(v.polarAngle, Math.PI / 2) && near(v.azimuthAngle, Math.PI / 2));
  assert.equal(takeFromView('maxPolarAngle', v, { minDistance: 1, maxDistance: 5 }), '90');
  assert.equal(takeFromView('minAzimuthAngle', v, { minDistance: 1, maxDistance: 5 }), '90');
  assert.equal(takeFromView('zoom', v, { minDistance: 1, maxDistance: 5 }), '0.5');
  assert.equal(takeFromView('zoom', v, { minDistance: 4, maxDistance: 5 }), '0', 'borné à [0, 1]');
});

test('zoom pris dans la vue puis relu : distance de départ = distance prise (resolveOrbit)', () => {
  const f = withFields(cameraFormFromRaw(undefined), { text: { minDistance: '2', maxDistance: '10' } });
  const z = takeFromView('zoom', { distance: 4.5, polarAngle: 1, azimuthAngle: 0 }, { minDistance: 2, maxDistance: 10 });
  const frame = resolveOrbit(framingOf(withFields(f, { text: { zoom: z } })), 1);
  assert.ok(near(frame.distance, 4.5, 1e-3));
});

test('cadrage posé en place : bornes sur les contrôles, caméra à la vue de départ, bornes levées sur demande', () => {
  const controls = {
    target: new THREE.Vector3(0, 0, 0),
    update: () => true,
    minDistance: 0, maxDistance: 0, minPolarAngle: 0, maxPolarAngle: 0, minAzimuthAngle: 0, maxAzimuthAngle: 0,
    enableZoom: false, enablePan: true, dampingFactor: 0,
  };
  const live = { camera: { position: new THREE.Vector3() }, controls, radius: 1 };
  const framing = { minDistance: 2, maxDistance: 4, zoom: 0.5, minPolarAngle: Math.PI / 4, maxPolarAngle: Math.PI / 4, minAzimuthAngle: 0, maxAzimuthAngle: 0 };
  applyFramingInPlace(live, framing, { bounds: true, moveToStart: true });
  assert.ok(near(live.camera.position.length(), 3));
  assert.ok(near(controls.minDistance, 2) && near(controls.maxDistance, 4) && near(controls.maxPolarAngle, Math.PI / 4));
  const before = live.camera.position.clone();
  applyFramingInPlace(live, framing, { bounds: false, moveToStart: false });
  assert.ok(live.camera.position.equals(before), 'caméra non déplacée');
  assert.equal(controls.maxDistance, Infinity);
  assert.equal(controls.minAzimuthAngle, -Infinity);
  assert.equal(controls.enableZoom, true);
});

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests du moteur passent.');
