// scripts/test-engine.ts — tests du moteur sans navigateur (Î10b). `npm run test:engine`.
// Cadrage orbital (`lib/orbitFraming.ts`), mode `buttons` (`lib/buttonsPlayer.ts`), boucle unique (`lib/frameTasks.ts`),
// éclairage de secours (`lib/fallbackLights.ts`), lecture libre d'un clip (`lib/clipPreview.ts`), onglet Caméra de l'atelier (`src/atelier/cameraForm.ts`, A4),
// couche éditoriale des actions combinées dans l'atelier (`src/atelier/editModel.ts`, `editLayerFile.ts`, `reportLinks.ts`, AC3),
// audio Web Audio (`lib/audioEngine.ts`, Î11 : AudioContext simulé, aucun son réel), actions combinées (AC2 : événements,
// coupe au noir, caméra `lib/cameraRig.ts`, sons d'événement, os de même nom lus par GLTFLoader), progression du livre
// (`src/components/book/progress.ts`, Î13 : règles de déblocage, valeur illisible, stockage indisponible), lecture d'un
// QR par le scanner interne (`src/components/book/scanTarget.ts`, Î14 : adresse du livre, miroir, autre livre), carte de
// collection (`src/components/card/cardModel.ts`, CC1 : bandeau une seule fois, compte, cartes gagnées, lecture tolérante ;
// atelier : onglet Carte, CC2 : aller-retour sans perte, règle d'A3, aperçu, liens du Rapport) ; mini-jeu (MJ1 : déblocage,
// QR `/jeu`, meilleur score et réglages des commandes sous des clés à part, `book.json.game`, `game/game.json`) ; moteur du
// mini-jeu (MJ2 : Rapier sous Node, pas fixe et rattrapage limité, joueur, bond, états des proies, capture, réapparition,
// chrono, déterminisme ; entrées : joystick, réglages des commandes, clavier, manette sur un état Gamepad simulé ; arène
// lue d'une scène three ; sons du jeu sur le moteur d'Î11) ; entrée « Jeu » de l'atelier (MJ3 : formulaire de
// `game/game.edit.json`, aller-retour sans perte, bornes, insécables, liens du Rapport, jeu monté sur l'objet fusionné,
// stockage en mémoire).
// Les mixers tournent sur une scène three minimale (un os animé), le temps est avancé à la main.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ORBIT_DEFAULTS, orbitPosition, resolveOrbit, sceneRadius } from '../src/components/diorama/lib/orbitFraming';
import { ButtonsPlayer, CUT_FADE, type ActionEvent, type ButtonsPlayerConfig, type CameraOwner, type CutState } from '../src/components/diorama/lib/buttonsPlayer';
import { CAMERA_ENTER_S, CAMERA_RETURN_S, CameraRig, type CameraMode, type RigControls } from '../src/components/diorama/lib/cameraRig';
import { Document as GDocument, NodeIO } from '@gltf-transform/core';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FrameTasks } from '../src/components/diorama/lib/frameTasks';
import { addFallbackLightsIfNone, FALLBACK_LIGHTS_NAME } from '../src/components/diorama/lib/fallbackLights';
import { ClipPreview } from '../src/components/diorama/lib/clipPreview';
import { applyFramingInPlace, cameraFormFromRaw, cameraLayerOf, framingOf, takeFromView, viewOf, withFields } from '../src/atelier/cameraForm';
import { cardPreviewOf, formFromEdit, layerFromForm, usedAssets, withCardType } from '../src/atelier/editModel';
import { formatEditLayer, formatGameEdit, glbActionIds, glbActionsOf, glbEventIds } from '../src/atelier/editLayerFile';
import {
  fixFrenchSpacing, frenchSpacingIssues, gameFieldOfMessage, gameFormFromEdit, gameLayerFromForm, gameUsedSounds, isGameLine, MemoryStorage, readerGameOf,
} from '../src/atelier/gameModel';
import { editLayerSchema, gameEditSchema, type GameConfig } from '../src/schema/glbi';
import { fieldOfMessage } from '../src/atelier/reportLinks';
import {
  AudioEngine, audioSettingsKey, effectiveVolume, parseAudioSettings, withMuteToggled, withVolume, type AudioContextLike,
} from '../src/components/diorama/lib/audioEngine';
import {
  ProgressStore, emptyProgress, parseProgress, progressKey, sceneAccess, withCollected, withQuizPassed, withUnlocked, type StorageLike,
} from '../src/components/book/progress';
import { sceneFromScan } from '../src/components/book/scanTarget';
import { collectedCount, gameAccess, gameThreshold } from '../src/components/book/gameAccess';
import { controlsKey, DEFAULT_CONTROLS, GameStore, gameKey, parseBest, parseControls } from '../src/components/game/gameStorage';
import { parseReaderGame } from '../src/components/game/gameSource';
import RAPIER from '@dimforge/rapier3d-compat';
import { GameWorld, MAX_STEPS_PER_FRAME, STEP, planSteps, type ArenaDesc } from '../src/components/game/world';
import { BOND_S, PoursuiteGame, WALK_FACTOR, type EntitySpec, type PoursuiteOptions, type PoursuiteRules, type StepInput } from '../src/components/game/poursuite';
import { CONTROL_SIZES, InputCollector, controlZones, inJoystickZone, isGameKey, joystickVector, keyButtonIndex, keyboardVector, readGamepad, type GamepadLike } from '../src/components/game/input';
import { capsuleOf, fadeableClone, readArena } from '../src/components/game/scene';
import { parseReaderBook } from '../src/components/book/readerScene';
import { BOOK_ICON, cardCount, cardScale, cardTypeCounts, earnedCards, isCompactType, isNewCard, parseCardFields, parseCardTypes, readerCardOf, resolveCardType, showCardType } from '../src/components/card/cardModel';

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

// ────────────── Actions combinées (AC2) ──────────────
console.log('Actions combinées : événements, coupe au noir, caméra (AC2)');

/** Mode buttons sur un rig de clips donnés ; journal commun des phases, événements, coupes et caméra. */
function ac2(actions: ButtonsPlayerConfig['actions'], durations: Record<string, number>) {
  const { root, clips, mixer } = rig({ idle: 1, ...durations });
  const log: string[] = [];
  const cuts: CutState[] = [];
  const cams: CameraOwner[] = [];
  const player = new ButtonsPlayer(mixer, clips, { idle: { clip: 'idle', loop: true }, actions }, {
    onAction: (e: ActionEvent) => log.push(`${e.id}:${e.phase}`),
    onEvent: (e) => log.push(`${e.action}@${e.event}`),
    onCut: (c) => {
      cuts.push(c);
      if (c.black) log.push('NOIR');
    },
    onCamera: (c) => cams.push(c),
    ...quiet,
  });
  /** Une image de la boucle unique : tick, mixer, postUpdate (ordre de WebDioramaLoader). */
  const frame = (dt: number) => {
    player.tick(dt);
    mixer.update(dt);
    player.postUpdate();
  };
  const step = (seconds: number, dt = 1 / 60) => {
    for (let t = 0; t < seconds - 1e-9; t += dt) frame(dt);
  };
  const action = (name: string) => mixer.existingAction(clips.find((c) => c.name === name)!)!;
  player.start();
  log.length = 0;
  cams.length = 0;
  return { root, mixer, player, log, cuts, cams, frame, step, action };
}

test('événements : franchis après le mixer, triés par instant, même quand une image en saute plusieurs ; instant 0 à la première image', () => {
  const s = ac2([{ id: 'chasse', clip: 'chasse', events: [{ id: 'b', time: 0.5 }, { id: 'a', time: 0.1 }, { id: 'z', time: 0 }] }], { chasse: 1 });
  s.player.trigger('chasse');
  assert.deepEqual(s.log, ['chasse:start'], 'rien avant la première image');
  s.frame(0.25); // franchit 0 et 0,1 d'un coup
  assert.deepEqual(s.log, ['chasse:start', 'chasse@z', 'chasse@a']);
  s.frame(0.25); // 0,5 : instant atteint exactement
  assert.deepEqual(s.log.slice(3), ['chasse@b']);
  s.step(1);
  assert.deepEqual(s.log, ['chasse:start', 'chasse@z', 'chasse@a', 'chasse@b', 'chasse:end'], 'chaque événement une fois, avant end');
});

test('événement à l’instant de fin du clip (à l’arrondi près) : part avant end', () => {
  const s = ac2([{ id: 'chute', clip: 'chute', events: [{ id: 'impact', time: 0.75 }, { id: 'fin', time: 0.7504 }] }], { chute: 0.75 });
  s.player.trigger('chute');
  s.step(0.74, 0.1); // 0,8 > 0,75 : le clip finit dans cette image
  assert.deepEqual(s.log, ['chute:start', 'chute@impact', 'chute@fin', 'chute:end']);
});

test('action en boucle : événements redéclenchés à chaque tour, même plusieurs tours dans une image', () => {
  const s = ac2([{ id: 'course', clip: 'course', loop: true, events: [{ id: 'pas1', time: 0.1 }, { id: 'pas2', time: 0.3 }] }], { course: 0.4 });
  s.player.trigger('course');
  s.step(1, 0.05); // 2,5 tours : 2 × (pas1, pas2) puis pas1
  assert.deepEqual(s.log, ['course:start', 'course@pas1', 'course@pas2', 'course@pas1', 'course@pas2', 'course@pas1']);
  const t = ac2([{ id: 'vite', clip: 'vite', loop: true, events: [{ id: 'x', time: 0.01 }, { id: 'y', time: 0.03 }] }], { vite: 0.04 });
  t.player.trigger('vite');
  t.frame(0.1); // 2,5 tours dans une seule image (pas plafonné à 0,1 s)
  assert.deepEqual(t.log, ['vite:start', 'vite@x', 'vite@y', 'vite@x', 'vite@y', 'vite@x']);
});

test('relance : les événements repartent du début ; interruption : ceux qui restent sont annulés', () => {
  const s = ac2([
    { id: 'chasse', clip: 'chasse', events: [{ id: 'm', time: 0.2 }, { id: 'f', time: 0.8 }] },
    { id: 'regard', clip: 'regard', events: [{ id: 'r', time: 0.1 }] },
  ], { chasse: 1, regard: 0.5 });
  s.player.trigger('chasse');
  s.step(0.5);
  s.player.trigger('chasse'); // relance
  s.step(0.5);
  assert.deepEqual(s.log, ['chasse:start', 'chasse@m', 'chasse:interrupt', 'chasse:start', 'chasse@m']);
  s.player.trigger('regard'); // interruption : « f » ne part pas
  s.step(1.5);
  assert.deepEqual(s.log.slice(5), ['chasse:interrupt', 'regard:start', 'regard@r', 'regard:end']);
});

test('coupe au noir : 0,3 s vers le noir, entrante au noir (temps 0, poids 1), puis 0,3 s vers la scène', () => {
  const s = ac2([{ id: 'chute', clip: 'chute', transition: 'cut', events: [{ id: 'impact', time: 0 }] }], { chute: 2 });
  s.player.trigger('chute');
  assert.deepEqual(s.log, [], 'start émis au noir, pas au clic');
  assert.equal(s.player.cutPhase, 'out');
  s.step(CUT_FADE * 0.5);
  assert.ok(near(s.cuts.at(-1)!.opacity, 0.5, 0.05), `opacité à mi-montée ${s.cuts.at(-1)!.opacity}`);
  assert.ok(near(s.action('idle').getEffectiveWeight(), 1), 'idle joue jusqu’au noir');
  s.step(CUT_FADE * 0.5 + 0.01);
  assert.deepEqual(s.log, ['NOIR', 'chute:start', 'chute@impact']);
  assert.ok(near(s.action('chute').getEffectiveWeight(), 1), 'poids 1 dès le noir, sans fondu de poses');
  assert.ok(s.action('chute').time < 0.05, 'entrante au temps 0');
  assert.ok(!s.action('idle').isRunning(), 'sortante arrêtée au noir');
  assert.equal(s.player.currentId, 'chute');
  s.step(CUT_FADE + 0.02);
  assert.equal(s.player.cutPhase, null);
  assert.equal(s.cuts.at(-1)!.opacity, 0);
});

test('coupe au noir : fin naturelle (end à la fin du clip, idle au noir) ; d’une action à une autre (interrupt puis start au noir)', () => {
  const s = ac2([
    { id: 'chute', clip: 'chute', transition: 'cut' },
    { id: 'walk', clip: 'walk' },
  ], { chute: 1, walk: 2 });
  s.player.trigger('chute');
  s.step(0.7); // noir à 0,3 s, scène à 0,6 s
  s.step(0.65); // fin du clip (≈ 1,3 s) : end, puis montée vers le noir (atteint vers 1,6 s)
  assert.deepEqual(s.log, ['NOIR', 'chute:start', 'chute:end']);
  assert.equal(s.player.cutPhase, 'out', 'retour à idle par le noir');
  assert.equal(s.player.currentId, null);
  s.step(0.3);
  assert.deepEqual(s.log, ['NOIR', 'chute:start', 'chute:end', 'NOIR']);
  assert.ok(s.action('idle').isRunning() && near(s.action('idle').getEffectiveWeight(), 1));
  s.step(0.4);
  s.log.length = 0;
  // Action marquée interrompue par une action en fondu : la coupe vaut aussi
  s.player.trigger('chute');
  s.step(0.7);
  s.player.trigger('walk');
  assert.deepEqual(s.log, ['NOIR', 'chute:start'], 'walk attend le noir');
  s.step(0.31);
  assert.deepEqual(s.log, ['NOIR', 'chute:start', 'NOIR', 'chute:interrupt', 'walk:start'], 'interrupt puis start, au noir');
});

test('coupe au noir : le dernier clic pendant la montée est retenu et exécuté au noir ; ambiance hors du mode buttons', () => {
  const s = ac2([
    { id: 'chute', clip: 'chute', transition: 'cut' },
    { id: 'walk', clip: 'walk' },
    { id: 'roar', clip: 'roar' },
  ], { chute: 1, walk: 2, roar: 2 });
  s.player.trigger('chute');
  s.step(0.1);
  s.player.trigger('walk');
  s.player.trigger('roar');
  s.step(0.25);
  assert.deepEqual(s.log, ['NOIR', 'roar:start'], 'seul le dernier clic est exécuté, au noir');
  assert.equal(s.player.currentId, 'roar');
});

test('caméra (DP-19) : action à empty de position annoncée au lancement, libérée au retour à idle ; au noir pour une coupe', () => {
  const s = ac2([
    { id: 'regard', clip: 'regard', cameraPosition: 'CamRegard' },
    { id: 'walk', clip: 'walk' },
    { id: 'chute', clip: 'chute', transition: 'cut', cameraPosition: 'CamChute' },
  ], { regard: 0.5, walk: 0.5, chute: 0.5 });
  s.player.trigger('regard');
  assert.deepEqual(s.cams, [{ id: 'regard', snap: false }]);
  s.step(1);
  assert.deepEqual(s.cams.at(-1), { id: null, snap: false }, 'fin : retour en douceur');
  s.player.trigger('regard');
  s.step(0.1);
  s.player.trigger('walk'); // interruption par une action sans empty
  assert.deepEqual(s.cams.at(-1), { id: null, snap: false });
  s.player.trigger('chute');
  s.step(0.31);
  assert.deepEqual(s.cams.at(-1), { id: 'chute', snap: true }, 'coupe : au noir, d’un coup');
  s.step(0.6 + 0.5);
  assert.deepEqual(s.cams.at(-1), { id: null, snap: true }, 'fin d’une action marquée : retour au noir');
});

test('sans transition ni événements : déroulé identique à Î10b (aucune coupe, aucun événement, caméra jamais prise)', () => {
  const s = ac2([{ id: 'walk', clip: 'walk' }, { id: 'eat', clip: 'eat' }], { walk: 0.75, eat: 1.25 });
  s.player.trigger('walk');
  s.step(0.3);
  s.player.trigger('eat');
  s.step(2);
  assert.deepEqual(s.log, ['walk:start', 'walk:interrupt', 'eat:start', 'eat:end']);
  assert.deepEqual(s.cuts, []);
  assert.deepEqual(s.cams, []);
});

/** Caméra et contrôles minimaux : cible `start` en (0, 1, 0), caméra en (0, 1, 5), empties de position. */
function camRig() {
  const scene = new THREE.Group();
  const target = new THREE.Object3D();
  target.position.set(0, 1, 0);
  const camA = new THREE.Object3D();
  camA.position.set(4, 2, 0);
  const camB = new THREE.Object3D();
  camB.position.set(-4, 3, 0);
  scene.add(target, camA, camB);
  scene.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1, 5);
  const controls: RigControls = {
    target: new THREE.Vector3(0, 1, 0), enabled: true, enableDamping: true,
    minDistance: 2, maxDistance: 9, minPolarAngle: 0.2, maxPolarAngle: 1.5, minAzimuthAngle: -1, maxAzimuthAngle: 1,
  };
  const modes: CameraMode[] = [];
  const warnings: string[] = [];
  const rigc = new CameraRig(camera, controls, target, { regard: camA, autre: camB }, { onModeChange: (m) => modes.push(m), warn: (m) => warnings.push(m) });
  const run = (seconds: number, dt = 1 / 60) => {
    for (let t = 0; t < seconds - 1e-9; t += dt) rigc.update(dt);
  };
  const lookDir = () => camera.getWorldDirection(new THREE.Vector3());
  return { scene, target, camA, camB, camera, controls, rig: rigc, modes, warnings, run, lookDir };
}
const vnear = (a: THREE.Vector3, b: THREE.Vector3, eps = 1e-6) => a.distanceTo(b) < eps;

test('cible suivie (DP-7) : caméra et cible des contrôles décalées du déplacement de l’empty ; cible immobile : rien ne change', () => {
  const c = camRig();
  c.run(0.5);
  assert.ok(vnear(c.camera.position, new THREE.Vector3(0, 1, 5)) && vnear(c.controls.target, new THREE.Vector3(0, 1, 0)), 'immobile : inchangé');
  c.target.position.set(1.5, 1, -0.5);
  c.rig.update(1 / 60);
  assert.ok(vnear(c.controls.target, new THREE.Vector3(1.5, 1, -0.5)));
  assert.ok(vnear(c.camera.position, new THREE.Vector3(1.5, 1, 4.5)), 'même vecteur : distance et angles gardés');
  assert.equal(c.rig.mode, 'free');
  assert.equal(c.controls.enabled, true);
});

test('empty de position (DP-19) : vue mémorisée, contrôles verrouillés, caméra sur l’empty, regard sur la cible ; retour en 0,5 s', () => {
  const c = camRig();
  c.rig.setOwner('regard', false);
  assert.equal(c.controls.enabled, false, 'verrouillé dès le lancement');
  assert.equal(c.controls.enableDamping, false);
  c.run(CAMERA_ENTER_S * 0.5);
  assert.equal(c.rig.mode, 'enter');
  assert.ok(c.camera.position.distanceTo(c.camA.position) > 0.1, 'pas de saut : en route vers l’empty');
  c.run(CAMERA_ENTER_S * 0.5 + 0.02);
  assert.equal(c.rig.mode, 'locked');
  // L'empty bouge (animé par le clip) : la caméra le suit exactement et regarde la cible
  c.camA.position.set(3, 2.5, 2);
  c.target.position.set(0.5, 1, 0);
  c.scene.updateMatrixWorld(true);
  c.rig.update(1 / 60);
  assert.ok(vnear(c.camera.position, new THREE.Vector3(3, 2.5, 2)));
  assert.ok(vnear(c.controls.target, new THREE.Vector3(0.5, 1, 0)));
  const expected = new THREE.Vector3(0.5, 1, 0).sub(new THREE.Vector3(3, 2.5, 2)).normalize();
  assert.ok(vnear(c.lookDir(), expected, 1e-5), 'regard sur la cible');
  // Fin de l'action : retour à la vue d'avant (même écart à la cible, recalé sur sa position actuelle)
  c.rig.setOwner(null, false);
  c.run(CAMERA_RETURN_S * 0.5);
  assert.equal(c.rig.mode, 'return');
  assert.equal(c.controls.enabled, false, 'contrôles rendus seulement à la fin du retour');
  c.run(CAMERA_RETURN_S * 0.5 + 0.02);
  assert.equal(c.rig.mode, 'free');
  assert.ok(vnear(c.camera.position, new THREE.Vector3(0.5, 1, 5), 1e-5), `vue d’avant : ${c.camera.position.toArray()}`);
  assert.deepEqual(
    [c.controls.enabled, c.controls.enableDamping, c.controls.minDistance, c.controls.maxDistance, c.controls.minPolarAngle, c.controls.maxPolarAngle, c.controls.minAzimuthAngle, c.controls.maxAzimuthAngle],
    [true, true, 2, 9, 0.2, 1.5, -1, 1],
    'réglages des contrôles rendus',
  );
  assert.deepEqual(c.modes, ['enter', 'locked', 'return', 'free']);
});

test('empty de position : d’un coup au noir ; passage direct d’un empty à l’autre ; empty introuvable : caméra libre', () => {
  const c = camRig();
  c.rig.setOwner('regard', true);
  c.rig.update(1 / 60);
  assert.equal(c.rig.mode, 'locked');
  assert.ok(vnear(c.camera.position, c.camA.position), 'au noir : sur l’empty d’un coup');
  c.rig.setOwner('autre', false); // interruption par une autre action à empty : pas de retour intermédiaire
  assert.equal(c.rig.mode, 'enter');
  c.run(CAMERA_ENTER_S + 0.02);
  assert.ok(vnear(c.camera.position, c.camB.position));
  assert.deepEqual(c.modes, ['locked', 'enter', 'locked']);
  c.rig.setOwner(null, true);
  c.rig.update(1 / 60);
  assert.equal(c.rig.mode, 'free');
  assert.ok(vnear(c.camera.position, new THREE.Vector3(0, 1, 5)), 'vue d’avant la première action, d’un coup');
  assert.equal(c.controls.enabled, true);
  c.rig.setOwner('inconnue', false);
  assert.equal(c.rig.mode, 'free');
  assert.equal(c.warnings.length, 1);
});

test('os de même nom dans deux personnages (GLB lu par GLTFLoader) : le clip commun anime les deux', async () => {
  // Personnages tirés du même squelette (v0.3) : GLTFLoader rend les noms uniques (Os_queue, Os_queue_1) et nomme les
  // pistes avec ces noms ; le mixer racine du mode buttons anime donc chaque os, sans recherche par nom brut.
  const doc = new GDocument();
  const buf = doc.createBuffer();
  const scene = doc.createScene('Scene');
  const anim = doc.createAnimation('chasse');
  for (const [name, dy] of [['Armature_Chasseur', -1], ['Armature_Proie', 1]] as const) {
    const arm = doc.createNode(name);
    const tail = doc.createNode('Os_queue');
    arm.addChild(tail);
    scene.addChild(arm);
    const sampler = doc.createAnimationSampler().setInterpolation('LINEAR')
      .setInput(doc.createAccessor().setBuffer(buf).setType('SCALAR').setArray(new Float32Array([0, 1])))
      .setOutput(doc.createAccessor().setBuffer(buf).setType('VEC3').setArray(new Float32Array([0, 0, 0, 0, 2 * dy, 0])));
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(tail).setTargetPath('translation').setSampler(sampler));
  }
  const idle = doc.createAnimation('idle');
  const s0 = doc.createAnimationSampler().setInput(doc.createAccessor().setBuffer(buf).setType('SCALAR').setArray(new Float32Array([0, 1])))
    .setOutput(doc.createAccessor().setBuffer(buf).setType('VEC3').setArray(new Float32Array([0, 0, 0, 0, 0, 0])));
  idle.addSampler(s0).addChannel(doc.createAnimationChannel().setTargetNode(doc.getRoot().listNodes()[1]).setTargetPath('translation').setSampler(s0));
  const glb = await new NodeIO().writeBinary(doc);
  const gltf = await new Promise<GLTF>((ok, ko) => new GLTFLoader().parse(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer, '', ok, ko));
  const player = new ButtonsPlayer(new THREE.AnimationMixer(gltf.scene), gltf.animations, { idle: { clip: 'idle' }, actions: [{ id: 'chasse', clip: 'chasse' }] }, quiet);
  player.start();
  player.trigger('chasse');
  for (let i = 0; i < 30; i++) {
    player.tick(1 / 60);
    player.mixer.update(1 / 60);
  }
  const bones: [string, number][] = [];
  gltf.scene.traverse((o) => {
    if (o.userData.name === 'Os_queue') bones.push([o.parent!.name, o.position.y]);
  });
  assert.equal(bones.length, 2);
  const byArm = Object.fromEntries(bones);
  assert.ok(byArm.Armature_Chasseur < -0.5 && byArm.Armature_Proie > 0.5, `os animés : ${JSON.stringify(byArm)}`);
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

// ────────────── Atelier, actions combinées (AC3) ──────────────
console.log('Atelier : actions combinées (AC3)');
{
  const L = (fr: string, en: string, es: string) => ({ fr, en, es });
  const layer3d = {
    version: 2,
    scene: { id: 'duo' },
    modules: {
      camera: { target: 'start' },
      animations: {
        mode: 'buttons',
        idle: { object: 'A', clip: 'idle', loop: true },
        actions: [
          { id: 'chasse', object: 'A', type: 'armature', clip: 'chasse', trigger: 'button', loop: false, events: [{ id: 'morsure', time: 2 }, { id: 'souffle', time: 2.5 }, { id: 'fuite', time: 3.2 }] },
          { id: 'chute', object: 'A', type: 'armature', clip: 'chute', trigger: 'button', loop: false, transition: 'cut', events: [{ id: 'impact', time: 1.5 }] },
          { id: 'regard', object: 'A', type: 'armature', clip: 'regard', trigger: 'button', loop: false, cameraPosition: 'CamRegard' },
        ],
      },
    },
  };
  const edit = {
    version: 1,
    scene: { name: L('La poursuite', 'The chase', 'La persecución') },
    modules: {
      animations: {
        actions: {
          chasse: { label: L('Chasser', 'Chase', 'Perseguir'), sound: 'sounds/chasse.wav', events: { morsure: { sound: 'sounds/morsure.wav' }, fuite: { sound: 'sounds/fuite.wav' } } },
          chute: { label: L('Tomber', 'Fall', 'Caer'), events: { impact: { sound: 'sounds/impact.wav' } } },
          regard: { label: L('Regarder', 'Look', 'Mirar') },
        },
      },
    },
  };
  const ids = glbActionIds(layer3d);
  const evs = glbEventIds(layer3d);

  test('edit.json relu puis réécrit sans modification : identique, événements gardés (défaut d’AC1 corrigé)', () => {
    const text = formatEditLayer(edit, ids, evs);
    const again = formatEditLayer(layerFromForm(formFromEdit(JSON.parse(text))).layer, ids, evs);
    assert.equal(again, text);
    assert.ok(again.includes('"morsure"') && again.includes('"impact"'));
    assert.ok(editLayerSchema.safeParse(JSON.parse(again)).success);
  });

  test('événements écrits dans l’ordre du GLB, orphelins ensuite ; événement sans son omis', () => {
    const e = structuredClone(edit) as typeof edit & { modules: { animations: { actions: { chasse: { events: Record<string, { sound?: string }> } } } } };
    e.modules.animations.actions.chasse.events = { vieux: { sound: 'sounds/x.wav' }, fuite: { sound: 'sounds/fuite.wav' }, souffle: {}, morsure: { sound: 'sounds/morsure.wav' } };
    const out = JSON.parse(formatEditLayer(layerFromForm(formFromEdit(e)).layer, ids, evs));
    assert.deepEqual(Object.keys(out.modules.animations.actions.chasse.events), ['morsure', 'fuite', 'vieux']);
  });

  test('actions du GLB lues : transition, position de caméra, événements et instants', () => {
    const a = glbActionsOf(layer3d);
    assert.deepEqual(a.map((x) => [x.id, x.transition, x.cameraPosition, x.events.length]), [['chasse', null, null, 3], ['chute', 'cut', null, 1], ['regard', null, 'CamRegard', 0]]);
    assert.equal(a[0].events[2].time, 3.2);
  });

  test('sons d’événement comptés dans les sons de la scène (Crédits, V-10) ; événements orphelins non comptés', () => {
    const f = formFromEdit({ ...edit, modules: { animations: { actions: { ...edit.modules.animations.actions, chute: { label: L('a', 'b', 'c'), events: { impact: { sound: 'sounds/impact.wav' }, perdu: { sound: 'sounds/perdu.wav' } } } } } } });
    const sounds = usedAssets(f, ids, evs).filter((u) => u.kind === 'son').map((u) => u.asset);
    assert.deepEqual(sounds, ['sounds/chasse.wav', 'sounds/morsure.wav', 'sounds/fuite.wav', 'sounds/impact.wav']);
  });

  test('Rapport → champ : événement sans son, orphelin, instant hors du clip, position de caméra, chemins', () => {
    const f = formFromEdit(edit);
    const at = (m: string) => fieldOfMessage(m, 'duo', f, ids, evs)?.field ?? null;
    assert.equal(at('scène « duo » : événement « souffle » de l\'action « chasse » sans son (ignoré) ; à renseigner dans l\'atelier'), 'event.chasse.souffle');
    assert.equal(at('scenes/duo.edit.json : action « chasse » : événement « morsur » absent du GLB (événements du GLB : morsure, souffle, fuite)'), 'eventOrphan.chasse.morsur');
    assert.equal(at('scenes/duo.glb (couche 3D) : action « chute » : événement « impact » à 9,200 s, clip de 2,000 s'), 'event.chute.impact');
    assert.equal(at('scène « duo » : action « regard » : cameraPosition « CamRegard » introuvable dans le GLB (V-08)'), 'action.regard.cameraPosition');
    assert.equal(at('scenes/duo.glb (couche 3D) : action « regard » : position de caméra « CamRegard » sans cible de caméra (camera.target, addon)'), 'action.regard.cameraPosition');
    assert.equal(at('scenes/duo.edit.json : modules.animations.actions.chasse.events.fuite.sound : son « x » : extension manquante'), 'event.chasse.fuite');
    assert.equal(at('scène « duo » (objet fusionné) : modules.animations.actions.1.events.0.sound : son « x » : extension manquante'), 'event.chute.impact');
    assert.equal(at('asset « sounds/impact.wav » introuvable dans le dossier source'), 'event.chute.impact');
    // Motifs existants inchangés
    assert.equal(at('scène « duo » : action « regard » sans libellé ; à renseigner dans l\'atelier'), 'action.regard.label');
    assert.equal(at('scenes/duo.edit.json : action « marche » absente du GLB (actions du GLB : chasse, chute, regard)'), 'orphan.marche');
  });
}

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
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
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

testAsync('AC2 : sons d’événement en plus du son de l’action ; interruption : coupés et annulés ; fin naturelle : au bout', async () => {
  const { ctx, engine } = audioRig();
  engine.setSounds({
    ambient: 'sounds/jungle.wav',
    actions: { chasse: { sound: 'sounds/chasse.wav', loop: false } },
    events: { chasse: { morsure: 'sounds/morsure.wav', fuite: 'sounds/fuite.wav' } },
  });
  engine.unlock();
  await flush(); await flush();
  assert.ok(ctx.decoded.includes('sounds/morsure.wav') && ctx.decoded.includes('sounds/fuite.wav'), 'préchargés et décodés avec la scène');
  engine.onAction('chasse', 'start');
  engine.onEvent('chasse', 'morsure');
  engine.onEvent('chasse', 'fuite');
  engine.onEvent('chasse', 'souffle'); // sans son : rien
  await flush();
  assert.deepEqual(ctx.playing().sort(), ['sounds/chasse.wav', 'sounds/fuite.wav', 'sounds/jungle.wav (boucle)', 'sounds/morsure.wav']);
  engine.onAction('chasse', 'interrupt');
  assert.deepEqual(ctx.playing(), ['sounds/jungle.wav (boucle)'], 'interruption : son de l’action et sons d’événement coupés');
  // Son d'événement pas encore décodé : annulé par l'interruption
  engine.setSounds({ actions: {}, events: { chasse: { morsure: 'sounds/morsure2.wav' } } });
  engine.onAction('chasse', 'start');
  engine.onEvent('chasse', 'morsure');
  engine.onAction('chasse', 'interrupt');
  await flush(); await flush();
  assert.deepEqual(ctx.playing(), []);
  // Fin naturelle : les sons d'événement vont au bout
  engine.onAction('chasse', 'start');
  engine.onEvent('chasse', 'morsure');
  await flush();
  engine.onAction('chasse', 'end');
  assert.deepEqual(ctx.playing(), ['sounds/morsure2.wav']);
  engine.dispose();
  assert.deepEqual(ctx.playing(), []);
});

testAsync('Î13bis : contexte créé sans geste et resté suspendu (blocked), puis repris au premier geste', async () => {
  const { ctx, engine } = audioRig();
  // Navigateur sans activation de la page : resume() ne démarre rien
  let allowed = false;
  ctx.resume = () => {
    if (allowed) ctx.state = 'running';
    return Promise.resolve();
  };
  const seen: boolean[] = [];
  engine.onBlockedChange((b) => seen.push(b));
  assert.equal(engine.blocked, false, 'pas de contexte : rien de bloqué');
  engine.unlock(); // lancement de la scène, hors geste
  await flush(); await flush();
  assert.equal(engine.blocked, true);
  assert.deepEqual(seen, [true]);
  assert.deepEqual(ctx.playing(), ['sounds/jungle.wav (boucle)'], 'ambiance programmée, partira au démarrage du contexte');
  const silentBefore = ctx.sources.filter((s) => s.buffer?.path === '(muet)').length;
  allowed = true; // premier geste de la page
  engine.unlock();
  await flush();
  assert.equal(ctx.state, 'running');
  assert.equal(engine.blocked, false);
  assert.deepEqual(seen, [true, false]);
  assert.equal(ctx.sources.filter((s) => s.buffer?.path === '(muet)').length, silentBefore + 1, 'tampon muet rejoué dans le geste');
  assert.equal(ctx.decoded.length, 4, 'sons décodés une seule fois');
  engine.unlock(); // gestes suivants : sans effet
  assert.deepEqual(seen, [true, false]);
  engine.dispose();
  assert.equal(engine.blocked, false);
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

// ────────────── Scanner QR interne (Î14) ──────────────
console.log('Scanner QR interne');
{
  const scenes = ['trex', 'raptor', 'ptero'];
  const book = { origin: 'https://dino.editions-liger.com', pageRoot: 'https://compte.github.io/dino/', scenes };
  const scene = (sceneId: string) => ({ kind: 'scene', sceneId });
  const foreign = { kind: 'foreign' };

  test('QR imprimé du livre : scène, quels que soient la casse de l’hôte, le / final, index.html, requête et fragment', () => {
    for (const text of [
      'https://dino.editions-liger.com/s/trex',
      'https://DINO.Editions-Liger.com/s/trex/',
      'https://dino.editions-liger.com/s/trex/index.html',
      'https://dino.editions-liger.com/s/trex?utm=x#a',
      '  https://dino.editions-liger.com/s/trex  ',
    ]) assert.deepEqual(sceneFromScan(text, book), scene('trex'), text);
  });

  test('livre servi ailleurs (miroir, domaine mort) : le QR imprimé reste lu, sans réseau', () => {
    assert.deepEqual(sceneFromScan('https://dino.editions-liger.com/s/ptero', { ...book, pageRoot: 'http://192.168.1.20:8001/' }), scene('ptero'));
    // QR refait pour le miroir (racine de la page courante, sous-chemin compris)
    assert.deepEqual(sceneFromScan('https://compte.github.io/dino/s/raptor', book), scene('raptor'));
  });

  test('origin avec chemin : le préfixe doit correspondre exactement', () => {
    const b = { origin: 'https://editions-liger.com/dino', pageRoot: 'https://x.test/', scenes };
    assert.deepEqual(sceneFromScan('https://editions-liger.com/dino/s/trex', b), scene('trex'));
    assert.deepEqual(sceneFromScan('https://editions-liger.com/dinosaures/s/trex', b), foreign);
    assert.deepEqual(sceneFromScan('https://editions-liger.com/s/trex', b), foreign);
  });

  test('refusés : autre livre (même id), autre site, autre protocole, texte libre, scène inconnue, chemin hors /s/<scène>', () => {
    for (const text of [
      'https://dinos-tome2.editions-liger.com/s/trex',
      'https://editions-liger.com/s/trex',
      'http://dino.editions-liger.com/s/trex',
      'https://dino.editions-liger.com:8443/s/trex',
      'ftp://dino.editions-liger.com/s/trex',
      'trex',
      '/s/trex',
      '',
      'https://dino.editions-liger.com/s/stego',
      'https://dino.editions-liger.com/',
      'https://dino.editions-liger.com/s/trex/autre',
      'https://dino.editions-liger.com/x/s/trex',
      'https://dino.editions-liger.com/s/..%2Ftrex',
    ]) assert.deepEqual(sceneFromScan(text, book), foreign, text);
  });

  test('livre sans origin (cartouche fixture) : seule la racine de la page compte', () => {
    const b = { pageRoot: 'http://localhost:3000/', scenes };
    assert.deepEqual(sceneFromScan('http://localhost:3000/s/trex', b), scene('trex'));
    assert.deepEqual(sceneFromScan('https://dino.editions-liger.com/s/trex', b), foreign);
  });
}

for (const [name, fn] of asyncTests) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${(e as Error).message}`);
  }
}

// ────────────── Carte de collection (CC1) ──────────────
console.log('Carte de collection (CC1)');

const T = (fr: string, en = fr, es = fr) => ({ fr, en, es });

test('passage de collected à vrai : bandeau une seule fois (première action), jamais sur une scène sans carte', () => {
  const store = new ProgressStore('cartes', progressStorage(), quiet);
  let banners = 0;
  const onStart = (sceneId: string, hasCard: boolean) => {
    if (isNewCard(store.get(), sceneId, hasCard)) banners++;
    store.update((p) => withCollected(p, sceneId));
  };
  onStart('trex', true);
  onStart('trex', true);
  onStart('trex', true);
  assert.equal(banners, 1, 'une seule fois dans la session');
  onStart('ptero', false);
  assert.equal(banners, 1, 'scène sans carte : pas de bandeau');
  assert.equal(store.get().collected.ptero, true, 'collected reste écrit');
  // Rechargement : la nouveauté n'est pas enregistrée, la carte est déjà gagnée.
  assert.equal(isNewCard(store.get(), 'trex', true), false);
  // Valeur de progression inchangée (clé et forme d'Î13).
  assert.deepEqual(Object.keys(store.get()).sort(), ['collected', 'quizPassed', 'unlockedScenes']);
  // Scène manipulée avant l'arrivée des cartes : carte gagnée d'emblée, pas de bandeau.
  assert.equal(isNewCard({ collected: { raptor: true } }, 'raptor', true), false);
});

test('compte « n cartes sur N » (N = scènes avec carte) ; cartes gagnées dans l’ordre du livre ; livre sans carte : null', () => {
  const scenes = ['trex', 'raptor', 'ptero', 'duo'];
  const withCard = (id: string) => id === 'trex' || id === 'raptor';
  const p = { collected: { raptor: true, ptero: true, trex: false } };
  assert.deepEqual(cardCount(p, scenes, withCard), { n: 1, total: 2 });
  assert.deepEqual(earnedCards({ collected: { raptor: true, trex: true } }, scenes, withCard), ['trex', 'raptor']);
  assert.equal(cardCount(p, scenes, () => false), null);
});

test('lecture tolérante de la carte et des intitulés ; illustration : image, sinon image de chargement, sinon icône', () => {
  const at = (x: string) => `dev-book/${x}`;
  const card = readerCardOf({ subtitle: T('s'), image: 'images/c.webp', fields: { taille: T('12 m'), bad: 3 }, text: T('t') }, 'images/l.png', at)!;
  assert.equal(card.image, 'dev-book/images/c.webp');
  assert.deepEqual(Object.keys(card.fields), ['taille']);
  assert.equal(readerCardOf({ text: T('t') }, 'images/l.png', at)!.image, 'dev-book/images/l.png');
  assert.equal(readerCardOf({ text: T('t') }, undefined, at)!.image, BOOK_ICON);
  assert.equal(readerCardOf({ subtitle: T('s') }, undefined, at), undefined, 'sans paragraphe : pas de carte');
  assert.equal(readerCardOf(undefined, undefined, at), undefined);
  assert.deepEqual(parseCardFields([{ id: 'a', label: T('A') }, { id: 'a', label: T('A2') }, { id: 'b' }, 'x']).map((f) => f.id), ['a']);
  assert.deepEqual(parseCardFields(undefined), []);
});

test('échelle de la carte : 1 sur l’iPhone SE en portrait (375 × 667), bornée à [0,6 ; 1,4]', () => {
  // 375 × 667 moins les zones sûres (8 px de côté, 8 px en haut, 12 px en bas), boutons de 44 px.
  assert.ok(near(cardScale(359, 647, 44), (359 - 8) / 350));
  assert.ok(cardScale(359, 647, 44) >= 1 && cardScale(359, 647, 44) < 1.01);
  assert.equal(cardScale(3000, 3000, 44), 1.4);
  assert.equal(cardScale(100, 100, 44), 0.6);
});

test('atelier (CC2) : carte lue dans le formulaire puis réécrite à l’identique ; illustration comptée dans les assets', () => {
  const raw = {
    version: 1,
    scene: { name: T('Tyrannosaure', 'Tyrannosaurus', 'Tiranosaurio') },
    modules: {
      animations: { actions: { walk: { label: T('Marcher', 'Walk', 'Caminar') } } },
      quiz: undefined,
      card: { subtitle: T('T. rex'), image: 'images/trex-card.png', fields: { poids: T('8 t'), taille: T('12 m') }, text: T('Un grand carnivore.') },
      credits: { assets: [{ asset: 'images/trex-card.png', title: 'Carte', author: 'X', license: 'CC0' }] },
    },
  };
  const text = `${JSON.stringify(raw, null, 2)}\n`;
  const form = formFromEdit(JSON.parse(text));
  assert.deepEqual(form.card.fields.map(([id]) => id), ['poids', 'taille'], 'valeurs dans l’ordre du fichier');
  const { layer, incomplete } = layerFromForm(form);
  assert.deepEqual(incomplete, []);
  assert.equal(formatEditLayer(layer, ['walk']), text, 'relu puis enregistré sans modification : identique octet pour octet');
  assert.ok(editLayerSchema.safeParse(layer).success);
  assert.deepEqual(usedAssets(form, ['walk']).map((a) => a.asset), ['images/trex-card.png']);
  // Valeur saisie pour un intitulé absent du fichier : ajoutée à la fin.
  const more = { ...form, card: { ...form.card, fields: [...form.card.fields, ['regime', T('Carnivore', 'Carnivore', 'Carnívoro')]] as typeof form.card.fields } };
  assert.deepEqual(Object.keys((layerFromForm(more).layer.modules as { card: { fields: object } }).card.fields), ['poids', 'taille', 'regime']);
  // Fichier sans carte : rien n'est ajouté.
  assert.equal(formatEditLayer(layerFromForm(formFromEdit({ version: 1 })).layer, []), '{\n  "version": 1\n}\n');
});

test('atelier (CC2) : règle d’A3 : texte trop long ou incomplet non écrit, le reste de la scène enregistré', () => {
  const long = 'x'.repeat(263);
  const form = formFromEdit({
    version: 1,
    scene: { name: T('Raptor') },
    modules: {
      animations: { actions: { walk: { label: T('Courir', 'Run', 'Correr') } } },
      card: { subtitle: T('Velociraptor'), fields: { taille: T('2 m'), poids: { fr: '15 kg', en: '', es: '' } }, text: { fr: 'Court.', en: 'Short.', es: long } },
    },
  });
  form.actions[0][1].label = T('Bondir', 'Leap', 'Saltar');
  const { layer, incomplete } = layerFromForm(form);
  const card = JSON.parse(formatEditLayer(layer, ['walk'])).modules.card as Record<string, unknown>;
  assert.equal(card.text, undefined, 'paragraphe trop long en espagnol : non écrit');
  assert.deepEqual(Object.keys(card.fields as object), ['taille'], 'valeur traduite en partie : non écrite');
  assert.ok(editLayerSchema.safeParse(JSON.parse(formatEditLayer(layer, ['walk']))).success, 'la couche écrite reste valide : la scène s’enregistre');
  assert.deepEqual(((layer.modules as { animations: { actions: Record<string, { label: unknown }> } }).animations.actions.walk.label), T('Bondir', 'Leap', 'Saltar'));
  const msgs = incomplete.map((i) => `${i.tab}|${i.field}|${i.message}`);
  assert.ok(msgs.includes('card|card.text|carte : paragraphe trop long, non enregistré : ES 263 caractères (250 au plus)'), msgs.join('\n'));
  assert.ok(msgs.includes('card|card.field.poids|carte : valeur « poids » : traduction(s) manquante(s) : EN, ES'), msgs.join('\n'));
  // Illustration refusée par le contrat (saisie à la main) et identifiant d'intitulé invalide : non écrits.
  const odd = formFromEdit({ version: 1, modules: { card: { image: 'Images/ma carte.png', fields: { 'é': T('1') }, text: T('Texte.') } } });
  const r = layerFromForm(odd);
  assert.ok(editLayerSchema.safeParse(JSON.parse(formatEditLayer(r.layer, []))).success);
  assert.deepEqual(r.incomplete.map((i) => i.field), ['card.field.é', 'card.image']);
});

test('atelier (CC2) : aperçu de la carte (règle d’A5) et liens du Rapport', () => {
  const card = { type: '', subtitle: T('', 'Sub', ''), image: '', fields: [['taille', T('2 m')], ['poids', { fr: '15 kg', en: '', es: '' }]] as [string, ReturnType<typeof T>][], text: { fr: 'Un paragraphe.', en: '', es: '' } };
  const fr = cardPreviewOf(card, 'fr', 'images/raptor.webp');
  assert.ok(fr.card && fr.card.text.fr === 'Un paragraphe.' && !fr.card.subtitle, 'sous-titre absent en FR : non montré');
  assert.equal(fr.card?.image, 'images/raptor.webp', 'illustration : image de chargement à défaut');
  assert.deepEqual(Object.keys(fr.card?.fields ?? {}), ['taille', 'poids']);
  assert.deepEqual(fr.otherLangs, ['EN', 'ES']);
  const en = cardPreviewOf(card, 'en', '');
  assert.equal(en.card, null, 'pas de paragraphe en EN : pas d’aperçu');
  assert.ok(en.started);
  assert.equal(cardPreviewOf({ type: '', subtitle: T(''), image: '', fields: [], text: T('') }, 'fr', '').started, false);
  // Liens du Rapport vers l'onglet Carte.
  const form = formFromEdit({ version: 1, modules: { card: { image: 'images/x.png', fields: { poid: T('1') }, text: T('a') } } });
  const at = (m: string) => fieldOfMessage(m, 'trex', form, [], {})?.field ?? null;
  assert.equal(at('scenes/trex.edit.json : modules.card.fields : intitulé « poid » absent de book.json (cardFields : taille, poids)'), 'card.field.poid');
  assert.equal(at('scène « trex » : carte : caractéristique « regime » sans valeur (affichée « — »)'), 'card.field.regime');
  assert.equal(at('scène « trex » : carte sans paragraphe (modules.card.text) ; à renseigner dans l\'atelier'), 'card.text');
  assert.equal(at('scenes/trex.edit.json : modules.card.text.es : 263 caractères (250 au plus)'), 'card.text');
  assert.equal(at('scenes/trex.edit.json : modules.card.fields.taille.fr : 17 caractères (16 au plus)'), 'card.field.taille');
  assert.equal(at('asset « images/x.png » introuvable dans le dossier source (V-03)'), 'card.image');
});

// ---------------------------------------------------------------------------------------------------------
// Types de cartes (CC3, DP-20, spec-carte-collection.md §15)
// ---------------------------------------------------------------------------------------------------------

const F = (...ids: string[]) => ids.map((id) => ({ id, label: T(id) }));

test('types (CC3) : cardFields → type implicite « personnage » sans nom ; cardTypes lisible d’abord ; illisible ignoré ; 8 intitulés au plus', () => {
  const single = parseCardTypes(F('taille', 'poids'), undefined);
  assert.deepEqual(single.map((t) => [t.id, t.name, t.fields.map((f) => f.id)]), [['personnage', undefined, ['taille', 'poids']]]);
  assert.equal(showCardType(single), false, 'un seul type : aucune pastille (livre 1)');
  assert.deepEqual(parseCardTypes(undefined, undefined).map((t) => [t.id, t.fields.length]), [['personnage', 0]], 'livre sans intitulés : un type vide');
  const types = parseCardTypes(undefined, [
    { id: 'personnage', name: T('Personnage', 'Character', 'Personaje'), fields: F('taille') },
    { id: 'lieu', name: T('Lieu', 'Place', 'Lugar'), fields: F('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i') },
    { id: 'lieu', name: T('Doublon'), fields: [] },
    { id: 'sans-nom', fields: [] },
    'x',
  ]);
  assert.deepEqual(types.map((t) => t.id), ['personnage', 'lieu'], 'doublon, type sans nom, entrée illisible ignorés');
  assert.equal(types[1].fields.length, 8, '8 intitulés au plus (au lieu de 4)');
  assert.equal(showCardType(types), true);
  assert.equal(parseCardFields(F('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i')).length, 8, 'cardFields : 8 intitulés au plus');
  // cardTypes illisible (un seul type lisible) : repli sur cardFields.
  assert.deepEqual(parseCardTypes(F('x'), [{ id: 'lieu', name: T('Lieu'), fields: F('a') }]).map((t) => t.id), ['personnage']);
});

test('types (CC3) : type de la carte (absent ou inconnu → premier) ; mise en page compacte de 5 à 8 intitulés du type ; ligne de compte par type', () => {
  const types = parseCardTypes(undefined, [
    { id: 'personnage', name: T('Personnage'), fields: F('a', 'b', 'c', 'd') },
    { id: 'rencontre', name: T('Rencontre'), fields: F('lien') },
    { id: 'lieu', name: T('Lieu'), fields: F('a', 'b', 'c', 'd', 'e') },
    { id: 'arme', name: T('Arme'), fields: F('a') },
  ]);
  assert.equal(resolveCardType(types, undefined).id, 'personnage');
  assert.equal(resolveCardType(types, 'lieu').id, 'lieu');
  assert.equal(resolveCardType(types, 'inconnu').id, 'personnage', 'type inconnu : premier (le build signale l’erreur)');
  assert.equal(isCompactType(types[0]), false, '4 intitulés : mise en page normale');
  assert.equal(isCompactType(types[2]), true, '5 intitulés : mise en page compacte');
  // Carte lue avec son type.
  assert.equal(readerCardOf({ type: 'lieu', text: T('x') }, undefined, (p) => p)?.type, 'lieu');
  assert.equal(readerCardOf({ text: T('x') }, undefined, (p) => p)?.type, undefined);
  // Ligne de compte par type : ordre de déclaration, types sans carte omis (« arme »), carte sans type = premier type.
  const scenes = ['trex', 'raptor', 'ptero', 'duo', 'vallee'];
  const typeOf: Record<string, string | undefined> = { trex: undefined, raptor: 'personnage', duo: 'rencontre', vallee: 'lieu' };
  const withCard = (id: string) => id in typeOf;
  const p = { unlockedScenes: [], quizPassed: {}, collected: { trex: true, vallee: true } };
  const line = cardTypeCounts(p, scenes, types, withCard, (id) => typeOf[id]).map((c) => `${c.type.id} ${c.n}/${c.total}`);
  assert.deepEqual(line, ['personnage 1/2', 'rencontre 0/1', 'lieu 1/1']);
  assert.deepEqual(cardTypeCounts(p, scenes, parseCardTypes(F('a'), undefined), withCard, (id) => typeOf[id]), [], 'livre à cardFields : pas de ligne');
  assert.deepEqual(cardCount(p, scenes, withCard), { n: 2, total: 4 }, 'compte total inchangé');
});

const EDIT_TYPED = (type?: string) => ({
  version: 1,
  scene: { name: T('Vallée', 'Valley', 'Valle') },
  modules: { card: { ...(type ? { type } : {}), fields: { region: T('Ouest') }, text: T('Texte.', 'Text.', 'Texto.') } },
});

test('atelier (CC3) : aller-retour avec et sans type identique ; type écrit en tête ; un type seul ne crée pas de carte', () => {
  for (const type of [undefined, 'lieu', 'arme']) {
    const text = formatEditLayer(EDIT_TYPED(type), []);
    const form = formFromEdit(JSON.parse(text));
    assert.equal(form.card.type, type ?? '');
    const { layer } = layerFromForm(form);
    assert.equal(formatEditLayer(layer, []), text, `type ${type ?? 'absent'} : relu puis enregistré sans modification, identique octet pour octet`);
  }
  assert.ok(formatEditLayer(EDIT_TYPED('lieu'), []).includes('"card": {\n      "type": "lieu",\n      "fields"'), 'type premier champ de la carte');
  // Type seul : pas de carte.
  const only = formFromEdit({ version: 1 });
  only.card.type = 'lieu';
  assert.equal(formatEditLayer(layerFromForm(only).layer, []), '{\n  "version": 1\n}\n');
  // Champ incomplet seulement : rien de la carte n'est écrit, pas même le type.
  only.card.text = { fr: 'Texte', en: '', es: '' };
  assert.equal(formatEditLayer(layerFromForm(only).layer, []), '{\n  "version": 1\n}\n');
});

test('atelier (CC3, décision du 28/10, option 1) : type ajouté à l’enregistrement avec cardTypes seulement, jamais à la seule ouverture', () => {
  const form = formFromEdit(JSON.parse(formatEditLayer(EDIT_TYPED(), [])));
  const { layer } = layerFromForm(form);
  // Ouverture : la couche comparée au fichier n'a pas de type (indicateur « enregistré »).
  assert.equal(formatEditLayer(layer, []), formatEditLayer(EDIT_TYPED(), []));
  // Avec cardFields (pas de type par défaut) : rien n'est ajouté.
  assert.equal(withCardType(layer, undefined).type, null);
  // Avec cardTypes : premier type écrit en tête de la carte.
  const typed = withCardType(layer, 'personnage');
  assert.equal(typed.type, 'personnage');
  assert.equal(formatEditLayer(typed.layer, []), formatEditLayer(EDIT_TYPED('personnage'), []));
  assert.ok(editLayerSchema.safeParse(typed.layer).success);
  // Type déjà choisi : gardé ; scène sans carte : rien.
  assert.equal(withCardType(layerFromForm(formFromEdit(EDIT_TYPED('lieu'))).layer, 'personnage').type, null);
  assert.equal(withCardType(layerFromForm(formFromEdit({ version: 1 })).layer, 'personnage').type, null);
});

test('atelier (CC3) : changement de type : valeurs gardées (orphelines écrites) ; retour au type d’avant sans perte ; liens du Rapport', () => {
  const form = formFromEdit({ version: 1, modules: { card: { type: 'personnage', fields: { taille: T('2 m'), epoque: T('Crétacé') }, text: T('a') } } });
  // « Garder » : type changé, valeurs d'un autre type gardées et écrites (signalées par la vérification).
  const kept = { ...form, card: { ...form.card, type: 'lieu' } };
  const card = JSON.parse(formatEditLayer(layerFromForm(kept).layer, [])).modules.card;
  assert.equal(card.type, 'lieu');
  assert.deepEqual(Object.keys(card.fields), ['taille', 'epoque']);
  // Retour au type d'avant : aucune perte.
  const back = { ...kept, card: { ...kept.card, type: 'personnage' } };
  assert.equal(formatEditLayer(layerFromForm(back).layer, []), formatEditLayer(layerFromForm(form).layer, []));
  // Liens du Rapport.
  const at = (m: string) => fieldOfMessage(m, 'duo', form, [], {})?.field ?? null;
  assert.equal(at('scenes/duo.edit.json : modules.card.type : type « arme » absent de book.json (cardTypes : personnage, lieu)'), 'card.type');
  assert.equal(at("scenes/duo.edit.json : modules.card.type : type « arme » absent de book.json (book.json n'a qu'un type, « personnage » : cardFields)"), 'card.type');
  assert.equal(at('scenes/duo.edit.json : modules.card.fields : intitulé « taille » absent du type « lieu » (intitulés : region, epoque)'), 'card.field.taille');
});

// ────────────── Mini-jeu (MJ1) ──────────────
console.log('Mini-jeu : déblocage, QR /jeu, meilleur score et réglages des commandes, book.json.game, game.json');

test('mini-jeu (DP-13) : débloqué à unlockThreshold scènes collected, toutes sans seuil ; seuil invalide ; scènes inconnues ignorées', () => {
  const scenes = ['trex', 'raptor', 'ptero', 'duo', 'vallee'];
  const p = (ids: string[]) => ({ collected: Object.fromEntries(ids.map((id) => [id, true])) });
  assert.deepEqual(gameAccess(p([]), scenes, 3), { unlocked: false, remaining: 3, threshold: 3 });
  assert.deepEqual(gameAccess(p(['trex', 'raptor']), scenes, 3), { unlocked: false, remaining: 1, threshold: 3 });
  assert.deepEqual(gameAccess(p(['trex', 'raptor', 'duo']), scenes, 3), { unlocked: true, remaining: 0, threshold: 3 });
  assert.equal(gameAccess(p(['trex', 'raptor', 'duo']), scenes, undefined).remaining, 2, 'sans seuil : toutes les scènes');
  assert.equal(gameThreshold(scenes, 9), 5, 'seuil supérieur au nombre de scènes : toutes');
  assert.equal(gameThreshold(scenes, 0), 5);
  assert.equal(gameThreshold(scenes, 2.5), 5);
  assert.equal(collectedCount({ collected: { trex: true, ancienne: true, raptor: false } }, scenes), 1, 'scène inconnue et faux ignorés');
});

test('scanner (MJ1) : QR /jeu accepté si le livre a un jeu, même règle d’adresse que les scènes ; refusé sinon', () => {
  const book = { origin: 'https://dino.editions-liger.com', pageRoot: 'https://miroir.github.io/dino/', scenes: ['trex'], game: true };
  for (const text of ['https://dino.editions-liger.com/jeu', 'https://dino.editions-liger.com/jeu/', 'https://DINO.editions-liger.com/jeu/index.html?x=1', 'https://miroir.github.io/dino/jeu']) {
    assert.deepEqual(sceneFromScan(text, book), { kind: 'game' }, text);
  }
  assert.deepEqual(sceneFromScan('https://dino.editions-liger.com/jeu', { ...book, game: false }), { kind: 'foreign' }, 'livre sans jeu');
  assert.deepEqual(sceneFromScan('https://autre.editions-liger.com/jeu', book), { kind: 'foreign' }, 'autre livre');
  assert.deepEqual(sceneFromScan('https://dino.editions-liger.com/jeux', book), { kind: 'foreign' });
  assert.deepEqual(sceneFromScan('https://dino.editions-liger.com/s/jeu', book), { kind: 'foreign' }, 'pas une scène');
  assert.deepEqual(sceneFromScan('https://dino.editions-liger.com/s/trex', book), { kind: 'scene', sceneId: 'trex' });
});

test('mini-jeu : clés à part (DP-25) : meilleur score et réglages, lecture tolérante, mémoire de session, progression intacte', () => {
  assert.equal(gameKey('test-dino'), 'glbinterpreter:game:test-dino');
  assert.equal(controlsKey('test-dino'), 'glbinterpreter:controls:test-dino');
  assert.equal(parseBest(null), null);
  assert.equal(parseBest('{"best":12}'), 12);
  for (const bad of ['{', '[]', '{"best":"12"}', '{"best":-1}', 'null']) assert.equal(parseBest(bad), null, bad);
  assert.deepEqual(parseControls(null), { settings: DEFAULT_CONTROLS, ok: true });
  assert.deepEqual(parseControls('{"side":"left","size":"large"}'), { settings: { side: 'left', size: 'large' }, ok: true });
  assert.deepEqual(parseControls('{"side":"gauche","size":"large"}'), { settings: { side: 'right', size: 'large' }, ok: false });
  assert.deepEqual(parseControls('{'), { settings: DEFAULT_CONTROLS, ok: false });
  const data = new Map<string, string>([[progressKey('test-dino'), '{"unlockedScenes":["trex"],"quizPassed":{},"collected":{"trex":true}}']]);
  const storage: StorageLike = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
  const store = new GameStore('test-dino', storage, quiet);
  assert.equal(store.best(), null);
  assert.deepEqual(store.recordScore(5), { best: 5, record: true });
  assert.deepEqual(store.recordScore(3), { best: 5, record: false });
  assert.deepEqual(store.recordScore(9), { best: 9, record: true });
  assert.equal(data.get('glbinterpreter:game:test-dino'), '{"best":9}');
  store.setControls({ side: 'left', size: 'large' });
  assert.deepEqual(new GameStore('test-dino', storage, quiet).controls(), { side: 'left', size: 'large' });
  assert.equal(data.get(progressKey('test-dino')), '{"unlockedScenes":["trex"],"quizPassed":{},"collected":{"trex":true}}', 'progression inchangée');
  // Stockage refusé : en mémoire pour la session, annoncé une fois.
  const warns: unknown[] = [];
  const refusing: StorageLike = { getItem: () => null, setItem: () => { throw new Error('plein'); }, removeItem: () => {} };
  const mem = new GameStore('test-dino', refusing, { warn: (...a) => warns.push(a) });
  assert.deepEqual(mem.recordScore(4), { best: 4, record: true });
  assert.equal(mem.best(), 4);
  mem.setControls({ side: 'left', size: 'normal' });
  assert.deepEqual(mem.controls(), { side: 'left', size: 'normal' });
  assert.equal(warns.length, 1);
  const none = new GameStore('test-dino', null, quiet);
  none.recordScore(2);
  assert.equal(none.best(), 2);
});

test('lecteur (MJ1) : book.json.game et unlockThreshold lus ; game/game.json lu (textes) ; forme fausse refusée', () => {
  const base = { bookId: 'b', scenes: ['a'] };
  assert.equal(parseReaderBook(base).game, undefined);
  assert.deepEqual(parseReaderBook({ ...base, game: { template: 'poursuite' }, unlockThreshold: 3 }).game, { template: 'poursuite' });
  assert.equal(parseReaderBook({ ...base, unlockThreshold: 3 }).unlockThreshold, 3);
  assert.equal(parseReaderBook({ ...base, unlockThreshold: '3', game: 'poursuite' }).unlockThreshold, undefined);
  assert.equal(parseReaderBook({ ...base, game: 'poursuite' }).game, undefined);
  const g = {
    version: 1, template: 'poursuite', texts: { title: T('Jeu'), instructions: T('Attrape !') },
    entities: [
      { id: 'dino', role: 'player', object: 'Armature_Dino', clips: { idle: 'i', walk: 'w', run: 'r', attack: 'a' }, capsule: { radius: 0.5, height: 1.8 } },
      { id: 'compso', role: 'prey', object: 'Armature_Compso', clips: { idle: 'i', walk: 'w', flee: 'f', caught: 'c' }, capsule: { radius: 0.3, height: 0.8 }, collider: 'COLLIDER' },
    ],
    rules: { duration: 300, preys: [{ entity: 'compso', count: 4 }], playerSpeed: 6, preySpeed: 5, detectionRadius: 6, points: 1, respawn: true },
    camera: { distance: 14 },
    sounds: { capture: 'sounds/hop.wav', music: 'sounds/jeu.wav' },
    build: { arena: 'game/arena.glb', entities: { dino: 'game/dino.glb', compso: 'game/compso.glb' }, modelCredits: [] },
  };
  const read = parseReaderGame(g, 'dev-book/');
  assert.deepEqual([read.template, read.title, read.instructions, read.end], ['poursuite', T('Jeu'), T('Attrape !'), undefined]);
  assert.deepEqual(read.entities[1], { id: 'compso', role: 'prey', object: 'Armature_Compso', clips: { idle: 'i', walk: 'w', flee: 'f', caught: 'c' }, capsule: { radius: 0.3, height: 0.8 }, collider: 'COLLIDER' });
  assert.deepEqual(read.rules.preys, [{ entity: 'compso', count: 4 }]);
  assert.deepEqual(read.files, { arena: 'dev-book/game/arena.glb', entities: { dino: 'dev-book/game/dino.glb', compso: 'dev-book/game/compso.glb' } });
  assert.deepEqual(read.sounds, { capture: 'dev-book/sounds/hop.wav', music: 'dev-book/sounds/jeu.wav' }, 'chemins résolus, sons absents omis');
  assert.equal(read.camera.distance, 14);
  assert.throws(() => parseReaderGame({ ...g, version: 2 }), /version 1/);
  assert.throws(() => parseReaderGame({ ...g, texts: { title: T('Jeu') } }), /texts\.title et texts\.instructions/);
  assert.throws(() => parseReaderGame({ ...g, build: { arena: 'game/arena.glb', entities: { dino: 'game/dino.glb' } } }), /build\.entities\.compso/);
});

// ────────────── Mini-jeu, moteur (MJ2) : Rapier sous Node, pas fixe, hasard à graine ──────────────
console.log('Mini-jeu : moteur (MJ2)');
await RAPIER.init();

/** Arène de test : sol de 30 m (COL_sol), un mur au nord (COL_mur), quatre points d'apparition aux coins. */
function testArena(extra: ArenaDesc['colliders'] = []): ArenaDesc {
  const h = 15;
  const box = (name: string, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) => {
    const v: number[] = [];
    for (const [x, y, z] of [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) v.push(cx + x * hx, cy + y * hy, cz + z * hz);
    return { name, vertices: new Float32Array(v), indices: new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]) };
  };
  return {
    colliders: [
      { name: 'COL_sol', vertices: new Float32Array([-h, 0, -h, h, 0, -h, h, 0, h, -h, 0, h]), indices: new Uint32Array([0, 2, 1, 0, 3, 2]) },
      box('COL_mur', 0, 1, -8, 5, 1, 0.25),
      ...extra,
    ],
    floor: { min: { x: -h, y: 0, z: -h }, max: { x: h, y: 0, z: h } },
    spawnPlayer: { x: 0, y: 0, z: 0, yaw: 0 },
    spawnPreys: [{ x: 10, y: 0, z: 10 }, { x: -10, y: 0, z: 10 }, { x: 10, y: 0, z: -10 }, { x: -10, y: 0, z: -10 }],
  };
}
const capsule = (radius: number, height: number) => ({ radius, height, center: { x: 0, y: height / 2, z: 0 } });
const SPECS: EntitySpec[] = [
  { id: 'dino', role: 'player', capsule: capsule(0.5, 1.8) },
  { id: 'compso', role: 'prey', capsule: capsule(0.3, 0.8) },
];
const RULES: PoursuiteRules = { duration: 300, preys: [{ entity: 'compso', count: 4 }], playerSpeed: 6, preySpeed: 5, detectionRadius: 6, points: 1, respawn: true };
const IDLE: StepInput = { move: { x: 0, y: 0 }, buttons: [] };
const newPoursuite = (opts: PoursuiteOptions = {}, rules: Partial<PoursuiteRules> = {}, arena = testArena()) =>
  new PoursuiteGame(new GameWorld(RAPIER, arena), SPECS, { ...RULES, ...rules }, { seed: 7, ...opts });
const run = (g: PoursuiteGame, n: number, input: StepInput = IDLE) => {
  for (let i = 0; i < n; i++) g.step(input);
};

test('pas fixe : 1/60 s par pas, rattrapage limité à 3 pas par image, temps en trop abandonné, reste gardé', () => {
  assert.deepEqual(planSteps(0, 1 / 60), { steps: 1, acc: 0, dropped: 0 });
  const half = planSteps(0, 1 / 120);
  assert.equal(half.steps, 0);
  assert.ok(near(planSteps(half.acc, 1 / 120).acc, 0, 1e-9), 'deux demi-pas font un pas');
  assert.equal(planSteps(half.acc, 1 / 120).steps, 1);
  // À-coup de 100 ms (6 pas) : 3 pas, 50 ms abandonnées.
  const jolt = planSteps(0, 0.1);
  assert.equal(jolt.steps, MAX_STEPS_PER_FRAME);
  assert.ok(near(jolt.dropped, 0.05, 1e-9) && near(jolt.acc, 0, 1e-9));
  // Reste d'un pas gardé même quand le plafond est atteint ; image figée (> 0,25 s) bornée.
  const frozen = planSteps(0.005, 3);
  assert.equal(frozen.steps, 3);
  assert.ok(frozen.acc < STEP && near(frozen.dropped, 3 - 0.25 + (0.255 - 3 * STEP - frozen.acc), 1e-9));
  assert.equal(planSteps(0, -1).steps, 0);
  // 60 images à 60 Hz : 60 pas exactement (marge des flottants).
  let acc = 0;
  let steps = 0;
  for (let i = 0; i < 60; i++) {
    const p = planSteps(acc, 1 / 60);
    acc = p.acc;
    steps += p.steps;
  }
  assert.equal(steps, 60);
});

test('monde : joueur posé sur COL_sol, murs de l’arène et limites de l’aire de jeu (COL_sol) arrêtent le contrôleur', () => {
  const g = newPoursuite({}, {}, { ...testArena(), spawnPlayer: { x: 0, y: 1, z: 0, yaw: 0 } });
  run(g, 60);
  const p = g.player.char;
  assert.ok(p.grounded && p.pos.y > -0.01 && p.pos.y < 0.06, `posé : y = ${p.pos.y}`);
  // Vers le nord (haut de l'écran = −Z) : arrêté par COL_mur (face sud à z = −7,75), capsule de 0,5 m.
  run(g, 240, { move: { x: 0, y: 1 }, buttons: [] });
  assert.ok(p.pos.z > -7.75 + 0.4 && p.pos.z < -6.9, `devant le mur : z = ${p.pos.z}`);
  // Vers l'est : limite de l'aire de jeu (bord de COL_sol à x = 15).
  run(g, 300, { move: { x: 1, y: 0 }, buttons: [] });
  assert.ok(p.pos.x < 15 - 0.4 && p.pos.x > 14, `au bord : x = ${p.pos.x}`);
  g.world.free();
  assert.ok(g.world.isFreed);
  g.world.free(); // idempotent
});

test('joueur : marche ou course selon l’inclinaison ; vitesse ; lacet vers la direction ; haut de l’écran = −Z', () => {
  const g = newPoursuite({ preysStill: true });
  const p = g.player;
  run(g, 1, { move: { x: 0, y: 0.1 }, buttons: [] });
  assert.equal(p.clip, 'idle', 'sous la zone morte');
  const placed = newPoursuite({ playerAt: [4, 2] });
  assert.ok(placed.player.char.pos.x === 4 && placed.player.char.pos.z === 2, 'option de test : joueur posé');
  placed.world.free();
  run(g, 5, { move: { x: 0.4, y: 0 }, buttons: [] });
  assert.equal(p.clip, 'walk');
  const x0 = p.char.pos.x;
  run(g, 60, { move: { x: 0.4, y: 0 }, buttons: [] });
  assert.ok(near(p.char.pos.x - x0, WALK_FACTOR * 6, 0.05), `marche à 2,4 m/s : ${p.char.pos.x - x0}`);
  assert.ok(near(p.char.yaw, Math.PI / 2, 1e-6), 'tourné vers +X');
  run(g, 1, { move: { x: 0, y: 1 }, buttons: [] });
  assert.equal(p.clip, 'run');
  const z0 = p.char.pos.z;
  run(g, 60, { move: { x: 0, y: 1 }, buttons: [] });
  assert.ok(near(z0 - p.char.pos.z, 6, 0.1), `course à 6 m/s vers −Z : ${z0 - p.char.pos.z}`);
  assert.ok(near(Math.abs(p.char.yaw), Math.PI, 1e-6), 'tourné vers −Z');
  g.world.free();
});

test('Bond : 0,4 s à vitesse doublée (clip attack), recharge de 1 s après le bond, un appui maintenu compte une fois', () => {
  const g = newPoursuite({ preysStill: true });
  const p = g.player;
  run(g, 10); // posé au sol
  const z0 = p.char.pos.z;
  const press: StepInput = { move: { x: 0, y: 1 }, buttons: [true] };
  g.step(press);
  assert.equal(p.clip, 'attack');
  assert.deepEqual(g.drainEvents(), ['jump']);
  run(g, 23, { move: { x: 0, y: 1 }, buttons: [] });
  assert.ok(near(z0 - p.char.pos.z, 2 * 6 * BOND_S, 0.05), `élan de 4,8 m : ${z0 - p.char.pos.z}`);
  assert.ok(g.bondTimer <= 0 && !g.bondReady, 'bond fini, recharge');
  g.step(press);
  assert.equal(g.drainEvents().length, 0, 'pas de bond pendant la recharge');
  run(g, 59);
  assert.ok(g.bondReady, 'recharge de 1 s');
  g.step({ move: { x: 0, y: 0 }, buttons: [true] });
  assert.deepEqual(g.drainEvents(), ['jump'], 'immobile : bond dans la direction du regard');
  // Front montant : `InputCollector` ne rend un bouton maintenu qu'une fois.
  const input = new InputCollector();
  input.press(0);
  assert.deepEqual(input.read(null).buttons.slice(0, 1), [true]);
  assert.deepEqual(input.read(null).buttons.slice(0, 1), [false]);
  g.world.free();
});

test('capture : touchée pendant un bond (pas sans) ; clip caught 1 s, fondu, réapparition au point le plus éloigné du joueur', () => {
  const g = newPoursuite({ preysStill: true, preyAt: [0, -2.5] }, { points: 3 });
  const prey = g.preys[0];
  run(g, 30, { move: { x: 0, y: 1 }, buttons: [] });
  assert.equal(g.score, 0, 'traversée sans bond : pas de capture');
  assert.equal(prey.state, 'rest');
  const g2 = newPoursuite({ preysStill: true, preyAt: [0, -2.5] }, { points: 3 });
  const q = g2.preys[0];
  g2.step({ move: { x: 0, y: 1 }, buttons: [true] });
  run(g2, 12, { move: { x: 0, y: 1 }, buttons: [] });
  assert.equal(q.state, 'caught');
  assert.equal(q.clip, 'caught');
  assert.equal(g2.score, 3, 'points par capture');
  assert.deepEqual(g2.drainEvents(), ['jump', 'capture']);
  run(g2, 60);
  assert.equal(q.state, 'fading');
  run(g2, 15);
  assert.ok(q.opacity > 0 && q.opacity < 1, 'fondu');
  run(g2, 16);
  // Joueur vers (0, −4,8) : le coin le plus éloigné est au sud, (±10, 10) ; la proie n'y reste pas sur une autre.
  assert.equal(q.state, 'rest');
  assert.ok(q.visible && q.opacity === 1 && q.generation === 1);
  assert.ok(near(q.char.pos.z, 10, 1e-3) && near(Math.abs(q.char.pos.x), 10, 1e-3), `réapparue en (${q.char.pos.x}, ${q.char.pos.z})`);
  const others = g2.preys.filter((o) => o !== q);
  assert.ok(others.every((o) => Math.hypot(o.char.pos.x - q.char.pos.x, o.char.pos.z - q.char.pos.z) >= 1), 'pas sur une autre proie');
  g.world.free();
  g2.world.free();
});

test('sans réapparition : la proie capturée disparaît ; point de réapparition à au moins le rayon de détection', () => {
  const g = newPoursuite({ preysStill: true, preyAt: [0, -2.5] }, { respawn: false });
  g.step({ move: { x: 0, y: 1 }, buttons: [true] });
  run(g, 100);
  assert.equal(g.preys[0].state, 'gone');
  assert.equal(g.preys[0].visible, false);
  // Point de réapparition : le plus éloigné parmi ceux à au moins 6 m du joueur.
  const r = g.respawnPoint();
  assert.ok(Math.hypot(r.x - g.player.char.pos.x, r.z - g.player.char.pos.z) >= 6);
  g.world.free();
});

test('proie : errance (walk) → fuite (flee) si le joueur est à moins du rayon de détection, à l’opposé, puis errance', () => {
  const g = newPoursuite({ preyAt: [0, 4] }, { preys: [{ entity: 'compso', count: 1 }] });
  const q = g.preys[0];
  run(g, 3);
  assert.equal(q.state, 'flee', 'joueur à 4 m < 6 m');
  assert.equal(q.clip, 'flee');
  const d0 = Math.hypot(q.char.pos.x, q.char.pos.z);
  run(g, 30);
  assert.ok(Math.hypot(q.char.pos.x, q.char.pos.z) > d0 + 2, 's’éloigne du joueur');
  assert.ok(q.char.pos.z > 4, 'à l’opposé du joueur (vers +Z)');
  run(g, 120);
  const later: string = q.state;
  assert.ok(later === 'wander' || later === 'rest', `loin du joueur : errance (${later})`);
  // Errance : cible dans l'aire de jeu, clip walk.
  const g2 = newPoursuite({}, { preys: [{ entity: 'compso', count: 1 }] });
  const w = g2.preys[0];
  run(g2, 120);
  assert.ok(['wander', 'rest'].includes(w.state));
  assert.ok(Math.abs(w.target.x) <= 13.5 && Math.abs(w.target.z) <= 13.5, 'cible dans l’aire de jeu (marge 1,5 m)');
  g.world.free();
  g2.world.free();
});

test('proie coincée : trois rayons bloqués (mur devant) → changement de direction, longe le mur sans le traverser', () => {
  // Proie entre le joueur (au sud) et COL_mur (face sud à z = −7,75, x de −5 à 5) : fuite droit dans le mur.
  const arena = { ...testArena(), spawnPlayer: { x: 0, y: 0, z: -1, yaw: 0 } };
  const g = newPoursuite({ preyAt: [0, -6.5] }, { preys: [{ entity: 'compso', count: 1 }] }, arena);
  const q = g.preys[0];
  let cornered = false;
  let minZ = Infinity;
  for (let i = 0; i < 60; i++) {
    g.step(IDLE);
    if (q.cornered > 0) cornered = true;
    minZ = Math.min(minZ, q.char.pos.z);
  }
  assert.ok(cornered, 'coincée (trois rayons bloqués)');
  assert.ok(Math.abs(q.char.pos.x) > 1.5, `longe le mur : x = ${q.char.pos.x.toFixed(2)}`);
  assert.ok(minZ > -7.75 + 0.3 - 0.05, `ne traverse pas le mur : z min = ${minZ.toFixed(2)}`);
  // Coin de l'aire de jeu : la proie change de direction et reste dans l'aire.
  const g2 = newPoursuite({ preyAt: [13.5, -13.5] }, { preys: [{ entity: 'compso', count: 1 }] }, { ...testArena(), spawnPlayer: { x: 10, y: 0, z: -10, yaw: 0 } });
  const c = g2.preys[0];
  const dirs = new Set<string>();
  for (let i = 0; i < 240; i++) {
    g2.step(IDLE);
    if (c.cornered > 0) dirs.add(`${c.dir.x.toFixed(2)},${c.dir.z.toFixed(2)}`);
    assert.ok(Math.abs(c.char.pos.x) < 15 && Math.abs(c.char.pos.z) < 15, 'dans l’aire de jeu');
  }
  assert.ok(dirs.size >= 2, `directions de sortie : ${[...dirs].join(' ; ')}`);
  g.world.free();
  g2.world.free();
});

test('chrono : fin à la durée (événement end une fois), plus rien ne bouge ensuite ; partie raccourcie par option', () => {
  const g = newPoursuite({ duration: 2 });
  assert.equal(g.duration, 2);
  run(g, 119);
  assert.ok(!g.over && near(g.remaining, 1 / 60, 1e-9));
  g.step(IDLE);
  assert.ok(g.over && g.remaining === 0);
  assert.ok(g.drainEvents().includes('end'));
  const steps = g.world.steps;
  g.step(IDLE);
  assert.equal(g.world.steps, steps, 'partie finie : pas de pas en plus');
  assert.deepEqual(g.drainEvents(), []);
  g.world.free();
});

test('simulation déterministe à pas fixe : même graine, mêmes entrées → mêmes positions et score', () => {
  const play = () => {
    const g = newPoursuite({}, { preys: [{ entity: 'compso', count: 8 }] });
    for (let i = 0; i < 1800; i++) {
      const p = g.player.char.pos;
      const prey = g.preys.filter((q) => q.state !== 'caught' && q.state !== 'fading' && q.state !== 'gone').sort((a, b) => Math.hypot(a.char.pos.x - p.x, a.char.pos.z - p.z) - Math.hypot(b.char.pos.x - p.x, b.char.pos.z - p.z))[0];
      const dx = prey.char.pos.x - p.x;
      const dz = prey.char.pos.z - p.z;
      const n = Math.hypot(dx, dz) || 1;
      g.step({ move: { x: dx / n, y: -dz / n }, buttons: [n < 3] });
    }
    const out = { score: g.score, pos: [g.player.char.pos, ...g.preys.map((q) => q.char.pos)].map((v) => [v.x, v.z].map((x) => x.toFixed(6))) };
    g.world.free();
    return out;
  };
  const a = play();
  assert.deepEqual(play(), a);
  assert.ok(a.score >= 3, `poursuite automatique de 30 s : ${a.score} captures`);
});

test('entrées : joystick absolu (haut de l’écran), zones et tailles selon le côté et la taille (DP-24)', () => {
  assert.deepEqual(joystickVector(100, 200, 100, 144, 56), { x: 0, y: 1 }, 'vers le haut = y positif');
  const v = joystickVector(100, 200, 300, 200, 56);
  assert.deepEqual(v, { x: 1, y: 0 }, 'borné au rayon');
  const half = joystickVector(100, 200, 128, 200, 56);
  assert.ok(near(half.x, 0.5) && half.y === 0);
  assert.deepEqual(controlZones('right'), { joystick: 'left', buttons: 'right' }, 'droitier');
  assert.deepEqual(controlZones('left'), { joystick: 'right', buttons: 'left' }, 'gaucher');
  assert.equal(inJoystickZone(100, 800, 'right'), true);
  assert.equal(inJoystickZone(500, 800, 'right'), false);
  assert.equal(inJoystickZone(500, 800, 'left'), true);
  assert.deepEqual(CONTROL_SIZES.normal, { button: 64, joystick: 56 });
  assert.equal(CONTROL_SIZES.large.button, 88);
  assert.ok(near(CONTROL_SIZES.large.joystick / CONTROL_SIZES.normal.joystick, 88 / 64, 0.01), 'joystick agrandi dans la même proportion');
});

test('clavier (DP-26) : position physique (KeyW… = ZQSD en AZERTY), diagonale normée, opposés annulés ; Espace puis J, K, L ; Échap', () => {
  assert.deepEqual(keyboardVector(new Set(['KeyW'])), { x: 0, y: 1 });
  assert.deepEqual(keyboardVector(new Set(['ArrowLeft'])), { x: -1, y: 0 });
  const diag = keyboardVector(new Set(['KeyW', 'KeyD']));
  assert.ok(near(diag.x, Math.SQRT1_2) && near(diag.y, Math.SQRT1_2));
  assert.deepEqual(keyboardVector(new Set(['ArrowUp', 'KeyW'])), { x: 0, y: 1 }, 'flèche et lettre : une fois');
  assert.deepEqual(keyboardVector(new Set(['KeyA', 'KeyD'])), { x: 0, y: 0 });
  assert.deepEqual(keyboardVector(new Set(['KeyZ', 'KeyQ'])), { x: 0, y: 0 }, 'KeyZ / KeyQ (W, A sur AZERTY) : pas des touches du jeu');
  assert.deepEqual(['Space', 'KeyJ', 'KeyK', 'KeyL', 'KeyF'].map(keyButtonIndex), [0, 1, 2, 3, -1]);
  assert.ok(isGameKey('Escape') && isGameKey('ArrowDown') && !isGameKey('Tab'));
  const input = new InputCollector();
  input.keys.add('KeyS');
  input.press(0);
  input.requestPause();
  const r = input.read(null);
  assert.deepEqual(r.move, { x: 0, y: -1 });
  assert.deepEqual(r.buttons, [true, false, false, false]);
  assert.equal(r.pause, true);
  assert.equal(input.read(null).pause, false);
  input.clear();
  assert.deepEqual(input.read(null).move, { x: 0, y: 0 });
});

test('manette (DP-27) : disposition standard (stick gauche ou croix, A B X Y, Start = pause), zone morte, autres ignorées', () => {
  const pad = (axes: number[], pressed: number[] = [], mapping = 'standard'): GamepadLike => ({
    mapping, connected: true, axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
  });
  assert.equal(readGamepad(pad([0, -1], [], '')), null, 'disposition non standard');
  assert.equal(readGamepad({ ...pad([0, 0]), connected: false }), null);
  assert.deepEqual(readGamepad(pad([0.1, 0.1]))!.move, { x: 0, y: 0 }, 'zone morte');
  const up = readGamepad(pad([0, -1]))!;
  assert.ok(near(up.move.x, 0) && near(up.move.y, 1), 'stick vers le haut = y positif');
  const mid = readGamepad(pad([0.6, 0]))!;
  assert.ok(near(mid.move.x, 0.5), 'remis à l’échelle après la zone morte');
  const cross = readGamepad(pad([0.5, 0.5], [12, 15]))!.move;
  assert.ok(near(cross.x, Math.SQRT1_2) && near(cross.y, Math.SQRT1_2), 'croix prioritaire');
  assert.deepEqual(readGamepad(pad([0, 0], [0, 3]))!.buttons, [true, false, false, true]);
  assert.equal(readGamepad(pad([0, 0], [9]))!.pause, true);
  // Fronts montants : A maintenu = un bond ; Start maintenu = une pause.
  const input = new InputCollector();
  const held = readGamepad(pad([0, 0], [0, 9]));
  const first = input.read(held);
  assert.equal(first.buttons[0] && first.pause, true);
  const second = input.read(held);
  assert.equal(second.buttons[0] || second.pause, false);
  // Déplacement le plus fort parmi doigt, clavier et manette.
  input.touch = { x: 0.3, y: 0 };
  assert.deepEqual(input.read(readGamepad(pad([0, -1]))).move.y, 1);
});

try {
  // Sons du jeu (MJ2) sur le moteur d'Î11 : musique = ambiance en boucle, sons du gabarit = sons d'événement de l'action « jeu » ;
  // page masquée : AudioContext suspendu, repris au geste « Continuer » (unlock).
  const { ctx, engine } = audioRig();
  engine.setSounds({ ambient: 'sounds/jeu.wav', actions: {}, events: { jeu: { capture: 'sounds/hop.wav', jump: 'sounds/bond.wav' } } });
  engine.unlock();
  await flush();
  await flush();
  assert.deepEqual(ctx.playing(), ['sounds/jeu.wav (boucle)']);
  engine.onEvent('jeu', 'capture');
  await flush();
  await flush();
  assert.deepEqual(ctx.playing(), ['sounds/jeu.wav (boucle)', 'sounds/hop.wav']);
  engine.suspend();
  await flush();
  assert.equal(ctx.state, 'suspended');
  assert.equal(engine.blocked, true);
  engine.unlock();
  await flush();
  assert.equal(ctx.state, 'running');
  // Fin de partie : musique arrêtée (ambiance retirée), sons du gabarit gardés.
  engine.setSounds({ actions: {}, events: { jeu: { capture: 'sounds/hop.wav', jump: 'sounds/bond.wav' } } });
  assert.ok(!ctx.playing().includes('sounds/jeu.wav (boucle)'));
  engine.dispose();
  assert.equal(ctx.closed, true);
  console.log('  ✓ sons du jeu : musique en boucle, son de capture, AudioContext suspendu puis repris, musique arrêtée à la fin');
} catch (e) {
  failed++;
  console.error(`  ✗ sons du jeu\n    ${(e as Error).message}`);
}

test('arène lue du GLB : COL_* et FADE_* cherchés dans le sous-arbre (maillage déplacé par meshopt), points d’apparition, sol', () => {
  const root = new THREE.Group();
  const plate = new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2);
  const sol = new THREE.Mesh(plate, new THREE.MeshBasicMaterial());
  sol.userData.name = 'COL_sol';
  root.add(sol);
  // COL_mur : nœud nommé sans maillage, maillage sur un enfant sans nom (cas de quantize, constat de MJ1).
  const mur = new THREE.Object3D();
  mur.userData.name = 'COL_mur';
  mur.position.set(0, 1, -8);
  const murMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 0.5), new THREE.MeshBasicMaterial());
  mur.add(murMesh);
  root.add(mur);
  const arbre = new THREE.Object3D();
  arbre.userData.name = 'FADE_arbre';
  const arbreMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1), new THREE.MeshBasicMaterial());
  arbre.add(arbreMesh);
  root.add(arbre);
  const spawn = (name: string, x: number, z: number) => {
    const o = new THREE.Object3D();
    o.userData.name = name;
    o.position.set(x, 0, z);
    root.add(o);
    return o;
  };
  spawn('SPAWN_prey_10', 1, 1);
  spawn('SPAWN_prey_2', 2, 2);
  spawn('SPAWN_player', 3, 4).rotation.y = Math.PI / 2;
  const { desc, colliderNodes, fadeMeshes } = readArena(root);
  assert.deepEqual(desc.colliders.map((c) => c.name), ['COL_sol', 'COL_mur']);
  assert.equal(desc.colliders[1].indices.length, 36, 'triangles du maillage enfant');
  assert.ok(near(Math.max(...Array.from(desc.colliders[1].vertices).filter((_, i) => i % 3 === 2)), -7.75), 'coordonnées monde');
  assert.deepEqual(colliderNodes, [sol, mur]);
  assert.deepEqual(fadeMeshes, [arbreMesh]);
  assert.deepEqual(desc.spawnPreys, [{ x: 2, y: 0, z: 2 }, { x: 1, y: 0, z: 1 }], 'tri numérique');
  assert.ok(near(desc.spawnPlayer.yaw, Math.PI / 2) && desc.spawnPlayer.x === 3);
  assert.ok(near(desc.floor.min.x, -15) && near(desc.floor.max.z, 15));
  assert.throws(() => readArena(new THREE.Group()), /COL_sol/);
  // Capsule : centre sur l'empty COLLIDER déclaré, sinon mi-hauteur.
  const ent = new THREE.Group();
  const col = new THREE.Object3D();
  col.userData.name = 'COLLIDER';
  col.position.set(0, 0.7, 0.2);
  ent.add(col);
  const e = { id: 'compso', role: 'prey' as const, object: 'A', clips: {}, capsule: { radius: 0.3, height: 0.8 } };
  assert.deepEqual(capsuleOf(e, ent).center, { x: 0, y: 0.4, z: 0 });
  assert.ok(near(capsuleOf({ ...e, collider: 'COLLIDER' }, ent).center.y, 0.7));
  // Matériaux qui s'estompent (décor FADE_*, proie capturée) : transparents dès le départ, l'original intact (batterie de
  // MJ2 : un matériau rendu opaque garde l'alpha à 1 dans son shader, passer `transparent` à vrai en cours de partie était
  // sans effet).
  const orig = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  const faded = fadeableClone(orig);
  assert.ok(faded !== orig && faded.transparent && faded.opacity === 1 && faded.depthWrite);
  assert.equal(orig.transparent, false);
});

// ────────────── Entrée « Jeu » de l'atelier (MJ3) ──────────────
console.log('Atelier : entrée « Jeu » (MJ3)');

const NB = '\u00a0';
const T3 = (fr: string, en = fr, es = fr) => ({ fr, en, es });
/** Couche éditoriale du jeu du livre de test (make-test-book.ts), insécables comprises. */
const testGameEdit = {
  version: 1,
  rules: { duration: 300, preys: [{ entity: 'compso', count: 4 }], playerSpeed: 6, preySpeed: 5, detectionRadius: 6, points: 1, respawn: true },
  camera: { distance: 14 },
  texts: {
    title: T3('La grande chasse', 'The great hunt', 'La gran cacería'),
    instructions: T3(`Attrape un maximum de compsognathes avant la fin du temps${NB}! Bondis pour les capturer.`, 'Catch!', '¡Atrapa!'),
    end: T3(`Bravo, belle chasse${NB}!`, 'Well done!', '¡Muy bien!'),
  },
  sounds: { capture: 'sounds/jeu_capture.wav', music: 'sounds/jeu_musique.wav' },
  credits: { assets: [{ asset: 'sounds/jeu_capture.wav', title: 'Capture (test)', author: 'GLBInterpreter', license: 'CC0' }, { asset: 'sounds/jeu_musique.wav', title: 'Musique du jeu (test)', author: 'GLBInterpreter', license: 'CC0' }] },
};

test('formulaire du jeu : aller-retour sans modification identique octet pour octet (forme du livre de test), schéma accepté', () => {
  const text = `${JSON.stringify(testGameEdit, null, 2)}\n`;
  assert.equal(formatGameEdit(testGameEdit), text, 'ordre des clés du contrat = ordre de make-test-book.ts');
  const { layer, incomplete } = gameLayerFromForm(gameFormFromEdit(testGameEdit));
  assert.deepEqual(incomplete, []);
  assert.equal(formatGameEdit(layer), text);
  assert.ok(gameEditSchema.safeParse(JSON.parse(formatGameEdit(layer))).success);
  // Clés dans le désordre (fichier écrit à la main) : remises dans l'ordre du contrat.
  const shuffled = { credits: testGameEdit.credits, texts: testGameEdit.texts, version: 1, rules: { respawn: false, duration: 400 } };
  assert.equal(formatGameEdit(shuffled).indexOf('"version"') < formatGameEdit(shuffled).indexOf('"rules"'), true);
  assert.match(formatGameEdit(shuffled), /"duration": 400,\n {4}"respawn": false/);
  // Formulaire vide : seule la version (tout le reste vaut par défaut).
  assert.equal(formatGameEdit(gameLayerFromForm(gameFormFromEdit({ version: 1 })).layer), '{\n  "version": 1\n}\n');
});

test('formulaire du jeu : bornes du §6 (hors bornes non écrit, signalé), virgule décimale, proies (somme ≤ 12, doublon, ligne incomplète)', () => {
  const f = gameFormFromEdit(testGameEdit);
  f.rules.duration = '120';
  f.rules.playerSpeed = '7,5';
  f.rules.points = '1.5';
  f.camera.distance = '3';
  f.rules.respawn = 'non';
  const { layer, incomplete } = gameLayerFromForm(f);
  const out = JSON.parse(formatGameEdit(layer));
  assert.equal(out.rules.duration, undefined, 'durée hors bornes : non écrite');
  assert.equal(out.rules.playerSpeed, 7.5);
  assert.equal(out.rules.points, undefined, 'entier attendu');
  assert.equal(out.rules.respawn, false);
  assert.equal(out.camera, undefined);
  assert.deepEqual(incomplete.map((i) => i.field).sort(), ['camera.distance', 'rules.duration', 'rules.points']);
  assert.match(incomplete.find((i) => i.field === 'rules.duration')!.message, /de 300 à 600 attendu \(saisi : 120\), non enregistré/);
  assert.ok(gameEditSchema.safeParse(out).success);
  // Proies : 13 en tout → liste non écrite ; doublon → non écrite ; nombre manquant → non écrite.
  const p = gameFormFromEdit(testGameEdit);
  p.rules.preys = [['compso', '8'], ['raptor', '5']];
  const r1 = gameLayerFromForm(p);
  assert.equal((r1.layer.rules as { preys?: unknown }).preys, undefined);
  assert.match(r1.incomplete[0].message, /13 en même temps \(12 au plus\)/);
  p.rules.preys = [['compso', '2'], ['compso', '3']];
  assert.match(gameLayerFromForm(p).incomplete[0].message, /en double/);
  p.rules.preys = [['compso', '']];
  assert.match(gameLayerFromForm(p).incomplete[0].message, /nombre à saisir/);
  p.rules.preys = [['', ''], ['compso', '6']];
  assert.deepEqual((gameLayerFromForm(p).layer.rules as { preys?: unknown }).preys, [{ entity: 'compso', count: 6 }]);
  // Texte traduit incomplet : non écrit ; crédit incomplet : non écrit.
  const t = gameFormFromEdit(testGameEdit);
  t.texts.end = T3('Bravo', '', '');
  t.credits[0].license = '';
  const r2 = gameLayerFromForm(t);
  assert.equal((r2.layer.texts as { end?: unknown }).end, undefined);
  assert.deepEqual(r2.incomplete.map((i) => i.tab).sort(), ['gcredits', 'textes']);
  assert.deepEqual(gameUsedSounds(t).map((u) => u.asset), ['sounds/jeu_capture.wav', 'sounds/jeu_musique.wav']);
});

test('insécables (MJ3) : espace ordinaire avant ? ! : ; » et après « repérée et corrigée ; texte correct inchangé', () => {
  assert.deepEqual(frenchSpacingIssues('Attrape-les ! Prêt ? Dis « oui » : go ; fin'), ['!', '?', '»', ':', ';', '«']);
  assert.equal(fixFrenchSpacing('Attrape-les ! Dis « oui »'), `Attrape-les${NB}! Dis «${NB}oui${NB}»`);
  assert.deepEqual(frenchSpacingIssues(testGameEdit.texts.instructions.fr), []);
  assert.deepEqual(frenchSpacingIssues('https://x.org Bravo!'), [], 'pas d’espace avant : rien à signaler');
  assert.equal(fixFrenchSpacing(testGameEdit.texts.end.fr), testGameEdit.texts.end.fr);
});

test('Rapport du jeu → champ ; lignes du jeu reconnues', () => {
  const f = gameFormFromEdit(testGameEdit);
  assert.deepEqual(gameFieldOfMessage('game/game.edit.json : rules.duration : durée (s) : 300 au moins', f), { tab: 'regles', field: 'rules.duration' });
  assert.deepEqual(gameFieldOfMessage('game/game.edit.json : rules.preys.0.entity : entité « x » absente de game/ (proies : compso)', f), { tab: 'regles', field: 'rules.preys' });
  assert.deepEqual(gameFieldOfMessage('game/game.edit.json : texts.end.fr : traduction vide (V-09)', f), { tab: 'textes', field: 'texts.end' });
  assert.deepEqual(gameFieldOfMessage('game/game.edit.json : credits.assets.1.title : vide', f), { tab: 'gcredits', field: 'credit.sounds/jeu_musique.wav' });
  assert.deepEqual(gameFieldOfMessage('jeu : titre du jeu (texts.title) absent de game/game.edit.json ; à renseigner dans l’atelier', f), { tab: 'textes', field: 'texts.title' });
  assert.deepEqual(gameFieldOfMessage('jeu : son « sounds/hop.wav » sans entrée dans credits.assets de game/game.edit.json (V-10)', f), { tab: 'gcredits', field: 'credit.sounds/hop.wav' });
  assert.deepEqual(gameFieldOfMessage('asset « sounds/jeu_capture.wav » introuvable dans le dossier source (V-03)', f), { tab: 'sons', field: 'sounds.capture' });
  assert.equal(gameFieldOfMessage('game/arena.glb : pas de sol (maillage « COL_sol »)', f), null, 'couche 3D : Blender');
  assert.ok(isGameLine({ scene: null, message: 'jeu : aucun crédit de modèle (propriétés src_*) dans les GLB de game/' }));
  assert.ok(isGameLine({ scene: null, message: 'game/compso.glb : capsule de 1,5 m' }));
  assert.ok(!isGameLine({ scene: 'trex', message: 'jeu : x' }));
  assert.ok(!isGameLine({ scene: null, message: 'book.json : pas de ogImage (aperçu de partage)' }));
});

test('jeu monté dans l’atelier : ReaderGame tiré de l’objet fusionné (GLB source de game/) ; meilleur score et commandes en mémoire, rien sous les clés du livre', () => {
  const draft = {
    version: 1, template: 'poursuite',
    entities: [
      { id: 'dino', role: 'player', object: 'Armature_Dino', clips: { idle: 'i', walk: 'w', run: 'r', attack: 'a' }, capsule: { radius: 0.5, height: 1.8 } },
      { id: 'compso', role: 'prey', object: 'Armature_Compso', clips: { idle: 'i', walk: 'w', flee: 'f', caught: 'c' }, capsule: { radius: 0.3, height: 0.8 } },
    ],
    rules: { duration: 300, preys: [{ entity: 'compso', count: 4 }], playerSpeed: 6, preySpeed: 5, detectionRadius: 6, points: 2, respawn: true },
    camera: { distance: 20 },
    texts: { title: T3('Jeu'), instructions: T3('Va') },
    sounds: { capture: 'sounds/hop.wav' },
  } as unknown as GameConfig;
  const g = readerGameOf(draft);
  assert.deepEqual(g.files, { arena: 'game/arena.glb', entities: { dino: 'game/dino.glb', compso: 'game/compso.glb' } });
  assert.equal(g.rules.points, 2);
  assert.equal(g.camera.distance, 20);
  assert.equal(g.sounds.capture, 'sounds/hop.wav');
  const mem = new MemoryStorage();
  const store = new GameStore('test-dino', mem, quiet);
  assert.deepEqual(store.recordScore(7), { best: 7, record: true });
  store.setControls({ side: 'left', size: 'large' });
  assert.equal(store.best(), 7);
  assert.deepEqual(new GameStore('test-dino', mem, quiet).controls(), { side: 'left', size: 'large' }, 'gardé pour l’onglet (remontage du jeu)');
  assert.equal(mem.getItem(gameKey('test-dino')), '{"best":7}');
});

if (failed) {
  console.error(`\n${failed} test(s) en échec`);
  process.exit(1);
}
console.log('\nTous les tests du moteur passent.');
