// scripts/test-engine.ts — tests du moteur sans navigateur (Î10b). `npm run test:engine`.
// Cadrage orbital (`lib/orbitFraming.ts`), mode `buttons` (`lib/buttonsPlayer.ts`), boucle unique (`lib/frameTasks.ts`),
// éclairage de secours (`lib/fallbackLights.ts`), lecture libre d'un clip (`lib/clipPreview.ts`), onglet Caméra de l'atelier (`src/atelier/cameraForm.ts`, A4),
// audio Web Audio (`lib/audioEngine.ts`, Î11 : AudioContext simulé, aucun son réel), progression du livre
// (`src/components/book/progress.ts`, Î13 : règles de déblocage, valeur illisible, stockage indisponible).
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
import {
  AudioEngine, audioSettingsKey, effectiveVolume, parseAudioSettings, withMuteToggled, withVolume, type AudioContextLike,
} from '../src/components/diorama/lib/audioEngine';
import {
  ProgressStore, emptyProgress, parseProgress, progressKey, sceneAccess, withCollected, withQuizPassed, withUnlocked, type StorageLike,
} from '../src/components/book/progress';

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

// ────────────── Audio (Î11) ──────────────
console.log('Audio Web Audio');

/** AudioContext simulé : sources jouées, gains, tampons « décodés » (le chemin du son). */
class FakeParam {
  value = 1;
  setTargetAtTime(v: number) { this.value = v; }
  setValueAtTime(v: number) { this.value = v; }
  linearRampToValueAtTime(v: number) { this.value = v; }
}
class FakeNode {
  gain = new FakeParam();
  connect() {}
  disconnect() {}
}
class FakeSource extends FakeNode {
  buffer: { path: string } | null = null;
  loop = false;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  constructor(private readonly ctx: FakeCtx) { super(); }
  start() { this.started = true; this.ctx.sources.push(this); }
  stop() { if (!this.stopped) { this.stopped = true; this.onended?.(); } }
}
class FakeCtx {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  gains: FakeNode[] = [];
  decoded: string[] = [];
  closed = false;
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() { this.state = 'closed'; this.closed = true; return Promise.resolve(); }
  createGain() { const g = new FakeNode(); this.gains.push(g); return g; }
  createBuffer() { return { path: '(muet)' }; }
  createBufferSource() { return new FakeSource(this); }
  decodeAudioData(data: ArrayBuffer) {
    const path = new TextDecoder().decode(data);
    if (path.endsWith('.bad')) return Promise.reject(new Error('EncodingError'));
    this.decoded.push(path);
    return Promise.resolve({ path });
  }
  /** Sons réellement joués (hors tampon muet du déblocage), encore actifs. */
  playing() { return this.sources.filter((s) => s.buffer?.path !== '(muet)' && !s.stopped).map((s) => `${s.buffer?.path}${s.loop ? ' (boucle)' : ''}`); }
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const asyncTests: Array<[string, () => Promise<void>]> = [];
const testAsync = (name: string, fn: () => Promise<void>) => asyncTests.push([name, fn]);

function memStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}
function audioRig(opts: { storage?: ReturnType<typeof memStorage>; loads?: string[] } = {}) {
  const ctx = new FakeCtx();
  const loads = opts.loads ?? [];
  const warnings: string[] = [];
  const engine = new AudioEngine({
    bookId: 'test-dino',
    createContext: () => ctx as unknown as AudioContextLike,
    loadBytes: async (p) => {
      loads.push(p);
      return p.includes('absent') ? null : (new TextEncoder().encode(p).buffer as ArrayBuffer);
    },
    storage: opts.storage ?? memStorage(),
    warn: (m) => warnings.push(m),
  });
  engine.setSounds({
    ambient: 'sounds/jungle.wav',
    actions: { walk: { sound: 'sounds/walk.wav', loop: true }, roar: { sound: 'sounds/roar.wav', loop: false }, eat: { sound: 'sounds/eat.wav', loop: false } },
  });
  return { ctx, engine, loads, warnings };
}

test('réglages : curseur à 0 = sourdine sans perdre le volume ; démuet rend le dernier volume non nul', () => {
  const s0 = parseAudioSettings(null);
  assert.deepEqual(s0, { volume: 0.7, muted: false });
  const s1 = withVolume(s0, 0.4);
  assert.deepEqual(s1, { volume: 0.4, muted: false });
  const s2 = withVolume(s1, 0);
  assert.deepEqual(s2, { volume: 0.4, muted: true });
  assert.equal(effectiveVolume(s2), 0);
  assert.deepEqual(withMuteToggled(s2), { volume: 0.4, muted: false });
  assert.deepEqual(withVolume(s1, 3), { volume: 1, muted: false });
  assert.deepEqual(parseAudioSettings('{"volume":0,"muted":true}'), { volume: 0.7, muted: true });
  assert.deepEqual(parseAudioSettings('illisible'), { volume: 0.7, muted: false });
});

testAsync('préchargement avant le geste, décodage et ambiance en boucle au déblocage, gain maître = volume', async () => {
  const { ctx, engine, loads } = audioRig();
  await flush();
  assert.deepEqual(loads.sort(), ['sounds/eat.wav', 'sounds/jungle.wav', 'sounds/roar.wav', 'sounds/walk.wav']);
  assert.equal(ctx.decoded.length, 0, 'rien de décodé avant le geste');
  engine.unlock();
  assert.equal(ctx.state, 'running');
  await flush(); await flush();
  assert.equal(ctx.decoded.length, 4);
  assert.deepEqual(ctx.playing(), ['sounds/jungle.wav (boucle)']);
  assert.ok(near(ctx.gains[0].gain.value, 0.7), 'gain maître au volume par défaut');
});

testAsync('son par action : start joue, interrupt coupe, relance de la même action, un seul son d’action à la fois', async () => {
  const { ctx, engine } = audioRig();
  engine.unlock();
  await flush(); await flush();
  engine.onAction('eat', 'start');
  await flush();
  assert.deepEqual(ctx.playing(), ['sounds/jungle.wav (boucle)', 'sounds/eat.wav']);
  engine.onAction('eat', 'interrupt');
  engine.onAction('roar', 'start');
  await flush();
  assert.deepEqual(ctx.playing(), ['sounds/jungle.wav (boucle)', 'sounds/roar.wav']);
  engine.onAction('roar', 'interrupt');
  engine.onAction('roar', 'start');
  await flush();
  assert.deepEqual(ctx.playing(), ['sounds/jungle.wav (boucle)', 'sounds/roar.wav'], 'relance : un seul roar');
  assert.equal(ctx.sources.filter((s) => s.buffer?.path === 'sounds/roar.wav').length, 2);
});

testAsync('end d’une action sans boucle : le son est coupé à la fin du clip (décision du 16/10)', async () => {
  const { ctx, engine } = audioRig();
  engine.unlock();
  await flush(); await flush();
  engine.onAction('roar', 'start');
  await flush();
  assert.deepEqual(ctx.playing(), ['sounds/jungle.wav (boucle)', 'sounds/roar.wav']);
  engine.onAction('roar', 'end');
  assert.deepEqual(ctx.playing(), ['sounds/jungle.wav (boucle)']);
});

testAsync('action en boucle : le son boucle avec elle et s’arrête quand son bouton l’arrête (end)', async () => {
  const { ctx, engine } = audioRig();
  engine.unlock();
  await flush(); await flush();
  engine.onAction('walk', 'start');
  await flush();
  assert.deepEqual(ctx.playing(), ['sounds/jungle.wav (boucle)', 'sounds/walk.wav (boucle)']);
  engine.onAction('walk', 'end');
  assert.deepEqual(ctx.playing(), ['sounds/jungle.wav (boucle)']);
});

testAsync('son pas encore décodé : part s’il est toujours en cours, pas si l’action a été interrompue entre-temps', async () => {
  const { ctx, engine } = audioRig();
  engine.unlock();
  engine.onAction('eat', 'start'); // décodage en cours
  engine.onAction('eat', 'interrupt');
  await flush(); await flush();
  assert.deepEqual(ctx.playing(), ['sounds/jungle.wav (boucle)']);
  engine.onAction('roar', 'start');
  await flush(); await flush();
  assert.deepEqual(ctx.playing(), ['sounds/jungle.wav (boucle)', 'sounds/roar.wav']);
});

testAsync('avant le geste : aucun son ; action sans son : rien ; son absent ou format refusé : avertissement, pas d’erreur', async () => {
  const { ctx, engine, warnings } = audioRig();
  engine.onAction('roar', 'start');
  await flush();
  assert.equal(ctx.sources.length, 0);
  engine.onAction('roar', 'end');
  engine.setSounds({ ambient: 'sounds/absent.wav', actions: { roar: { sound: 'sounds/roar.bad', loop: false } } });
  engine.unlock();
  engine.onAction('jump', 'start');
  engine.onAction('roar', 'start');
  await flush(); await flush(); await flush();
  assert.deepEqual(ctx.playing(), []);
  assert.ok(warnings.some((w) => w.includes('décodage impossible de « sounds/roar.bad »')), warnings.join(' | '));
});

testAsync('génération : sons changés (atelier), anciens oubliés, ambiance relancée ; dispose ferme le contexte', async () => {
  const { ctx, engine, loads } = audioRig();
  engine.unlock();
  await flush(); await flush();
  engine.setSounds({ ambient: 'sounds/river.wav', actions: { roar: { sound: 'sounds/roar.wav', loop: false } } });
  await flush(); await flush();
  assert.deepEqual(ctx.playing(), ['sounds/river.wav (boucle)']);
  assert.equal(loads.filter((p) => p === 'sounds/roar.wav').length, 1, 'son déjà décodé : pas relu');
  engine.dispose();
  assert.deepEqual(ctx.playing(), []);
  assert.ok(ctx.closed);
  engine.onAction('roar', 'start');
  engine.unlock();
  assert.equal(ctx.sources.filter((s) => s.buffer?.path === 'sounds/roar.wav').length, 0);
});

testAsync('volume et sourdine : gain maître, persistance par livre, relus par un nouveau moteur', async () => {
  const storage = memStorage();
  const { ctx, engine } = audioRig({ storage });
  engine.unlock();
  const seen: unknown[] = [];
  engine.subscribe((s) => seen.push(s));
  engine.setVolume(0.25);
  assert.ok(near(ctx.gains[0].gain.value, 0.25));
  engine.setVolume(0);
  assert.equal(ctx.gains[0].gain.value, 0);
  assert.equal(storage.m.get(audioSettingsKey('test-dino')), '{"volume":0.25,"muted":true}');
  engine.toggleMute();
  assert.ok(near(ctx.gains[0].gain.value, 0.25));
  assert.equal(seen.length, 3);
  engine.dispose();
  const again = audioRig({ storage });
  assert.deepEqual(again.engine.getSettings(), { volume: 0.25, muted: false });
  again.engine.unlock();
  assert.ok(near(again.ctx.gains[0].gain.value, 0.25));
});

// ────────────── Progression (Î13) ──────────────
console.log('Progression du livre');

const BOOK = ['trex', 'raptor', 'ptero'];

/** Stockage simulé : `fail` = lecture, écriture ou effacement qui lèvent (stockage refusé ou plein). */
function progressStorage(init: Record<string, string> = {}, fail: { get?: boolean; set?: boolean; remove?: boolean } = {}) {
  const m = new Map(Object.entries(init));
  const s: StorageLike & { m: Map<string, string> } = {
    m,
    getItem: (k) => {
      if (fail.get) throw new Error('SecurityError');
      return m.get(k) ?? null;
    },
    setItem: (k, v) => {
      if (fail.set) throw new Error('QuotaExceededError');
      m.set(k, v);
    },
    removeItem: (k) => {
      if (fail.remove) throw new Error('SecurityError');
      m.delete(k);
    },
  };
  return s;
}

test('clé glbinterpreter:progress:<bookId> (bookId de book.json)', () => {
  assert.equal(progressKey('test-dino'), 'glbinterpreter:progress:test-dino');
});

test('déblocage dans l’ordre du livre : première accessible d’office, suivante accessible si la précédente est débloquée', () => {
  let p = emptyProgress();
  assert.deepEqual(BOOK.map((id) => sceneAccess(p, BOOK, id)), ['accessible', 'locked', 'locked']);
  assert.equal(sceneAccess(p, BOOK, 'inconnue'), 'unknown');
  p = withQuizPassed(p, 'trex');
  assert.deepEqual(p, { unlockedScenes: ['trex'], quizPassed: { trex: true }, collected: {} });
  assert.deepEqual(BOOK.map((id) => sceneAccess(p, BOOK, id)), ['unlocked', 'accessible', 'locked']);
  p = withUnlocked(p, 'raptor'); // scène sans quiz : débloquée à son ouverture
  assert.deepEqual(BOOK.map((id) => sceneAccess(p, BOOK, id)), ['unlocked', 'unlocked', 'accessible']);
  assert.equal(withUnlocked(p, 'raptor'), p, 'déjà débloquée : même objet, rien à écrire');
  const c = withCollected(p, 'trex');
  assert.deepEqual(c.collected, { trex: true });
  assert.equal(withCollected(c, 'trex'), c);
});

test('scène retirée du livre : conservée dans la valeur, sans effet sur les règles ; scène ajoutée au milieu ne bloque pas la suite débloquée', () => {
  const p = { unlockedScenes: ['trex', 'ancienne', 'ptero'], quizPassed: { ancienne: true }, collected: {} };
  assert.equal(sceneAccess(p, BOOK, 'ptero'), 'unlocked');
  assert.equal(sceneAccess(p, BOOK, 'raptor'), 'accessible');
  const s = progressStorage();
  const store = new ProgressStore('b', s, quiet);
  store.update(() => p);
  store.update((q) => withQuizPassed(q, 'raptor'));
  assert.deepEqual(JSON.parse(s.m.get(progressKey('b'))!).unlockedScenes, ['trex', 'ancienne', 'ptero', 'raptor']);
});

test('valeur illisible : JSON invalide ou forme fausse → vide ; champs valides gardés ; annoncée une fois', () => {
  assert.deepEqual(parseProgress(null), { progress: emptyProgress(), ok: true });
  assert.deepEqual(parseProgress('{pas du json'), { progress: emptyProgress(), ok: false });
  assert.deepEqual(parseProgress('[1,2]'), { progress: emptyProgress(), ok: false });
  const r = parseProgress(JSON.stringify({ unlockedScenes: ['trex', 3, 'trex'], quizPassed: { trex: true, raptor: 'oui' }, collected: 'x' }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.progress, { unlockedScenes: ['trex'], quizPassed: { trex: true }, collected: {} });
  const warns: string[] = [];
  const store = new ProgressStore('b', progressStorage({ [progressKey('b')]: '{pas du json' }), { warn: (m: unknown) => warns.push(String(m)) });
  store.get();
  store.get();
  assert.equal(warns.length, 1);
  assert.ok(/illisible/.test(warns[0]));
  // Première progression : la valeur illisible est remplacée
  store.update((p) => withQuizPassed(p, 'trex'));
  assert.equal(sceneAccess(store.get(), BOOK, 'trex'), 'unlocked');
  assert.equal(warns.length, 1);
});

test('écriture et lecture dans le stockage ; rien n’est écrit sans changement ; remise à zéro', () => {
  const s = progressStorage();
  const store = new ProgressStore('test-dino', s, quiet);
  store.update((p) => p);
  assert.equal(s.m.size, 0);
  store.update((p) => withQuizPassed(p, 'trex'));
  assert.equal(s.m.get('glbinterpreter:progress:test-dino'), '{"unlockedScenes":["trex"],"quizPassed":{"trex":true},"collected":{}}');
  assert.equal(new ProgressStore('test-dino', s, quiet).get().unlockedScenes[0], 'trex', 'relu au rechargement');
  store.reset();
  assert.equal(s.m.size, 0);
  assert.deepEqual(store.get(), emptyProgress());
});

test('localStorage absent, lecture refusée ou plein : progression en mémoire pour la session, annoncée une fois', () => {
  for (const [label, storage] of [
    ['absent', null],
    ['lecture refusée', progressStorage({}, { get: true, set: true })],
    ['plein', progressStorage({}, { set: true })],
  ] as const) {
    const warns: string[] = [];
    const store = new ProgressStore('b', storage, { warn: (m: unknown) => warns.push(String(m)) });
    assert.deepEqual(store.get(), emptyProgress(), label);
    store.update((p) => withQuizPassed(p, 'trex'));
    store.update((p) => withUnlocked(p, 'raptor'));
    assert.deepEqual(store.get().unlockedScenes, ['trex', 'raptor'], label);
    assert.ok(store.inMemory, label);
    assert.equal(warns.length, 1, `${label} : ${warns.join(' | ')}`);
    assert.ok(/mémoire/.test(warns[0]), label);
    store.reset();
    assert.deepEqual(store.get(), emptyProgress(), label);
  }
});

for (const [name, fn] of asyncTests) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${(e as Error).message}`);
  }
}

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests du moteur passent.');
