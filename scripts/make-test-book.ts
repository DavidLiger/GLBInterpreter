// scripts/make-test-book.ts — génère un livre de test au format à deux couches (D-8.9, spec-atelier-glbi.md §3, §4 ; A1).
//
//   npm run book:test-source            → books/test-dino/ (non versionné)
//   npm run build -- --source books/test-dino
//
// Contenu synthétique, sans valeur visuelle : il sert à tester build-book en l'absence de GLB réel produit par l'addon.
// - scènes « trex » et « raptor » : GLB avec GLBI_ROOT (glbi_version = 2, glbi_config = couche 3D en chaîne JSON), armature
//   à 2 os, maillage skinné portant des propriétés src_*, empty « start », clips idle/walk/roar/eat ; couche éditoriale dans
//   scenes/<scène>.edit.json (textes, icônes, sons, cadrage, quiz, crédits) ; « raptor » n'a pas de cadrage (valeurs par
//   défaut du lecteur, Î10b) ; aucune scène n'a de lumière (éclairage de secours, D-8.10) ;
// - progression (Î13) : trois scènes dans l'ordre trex → raptor → ptero ; quiz complet en 3 langues sur « trex » et
//   « ptero », « raptor » sans quiz (débloquée à son ouverture) ; « ptero » sert l'écran de blocage tant que « raptor »
//   n'est pas débloquée ;
// - images PNG 1×1, icône du livre `icon.png` (512 px, Î9) ;
// - sons WAV audibles (Î11) : un bip par action, de hauteur propre à l'action (walk grave, roar médium, eat aigu ; raptor une
//   octave plus haut que trex), plus long que le clip (on entend la coupure à l'interruption et à la fin du clip) ; ambiance `jungle.wav` : bourdonnement doux de 2 s qui boucle sans coupure ;
// - action « walk » du raptor en boucle (`loop: true`, Î11) : couvre le son qui boucle avec l'action et s'arrête avec elle ;
// - image de chargement de « trex » en bruit aléatoire (≈ 3 MiB, Î10) : avec `--part-mib 1`, au moins un fichier du livre est
//   découpé, ce qui garde la couverture des tests de recomposition et de reprise (tests/install.spec.ts) sur un livre v1 ;
// - scène « duo » ajoutée en fin (AC1, spec-actions-combinees.md §11) : deux armatures (`Armature_Chasseur`, acteur
//   principal, et `Armature_Proie`) animées par des clips communs cuits à 30 i/s (clés redondantes : terrain du `resample`),
//   cible caméra `start` animée pendant « chasse », événements avec sons (`chasse` : morsure, souffle sans son, fuite ;
//   `chute` : impact), action « chute » en coupe au noir (`transition: "cut"`), « regard » sans événement ; sans quiz.
//   AC2 : les deux armatures ont des os de **même nom** (`Os_racine`, `Os_queue` : personnages tirés du même squelette,
//   v0.3) ; « regard » dure 3 s et déclare un empty de position de la caméra, `CamRegard` (DP-19), animé dans son clip
//   (arc de 120° autour de la cible, en montant) et immobile ailleurs ; action « course » en boucle (clip de 1 s), deux
//   événements par tour (`pas_g` 0,25 s, `pas_d` 0,75 s, même son) : événements redéclenchés à chaque tour.
//   Les GLB de trex, raptor et ptero sont écrits par `makeGlb`, inchangé : mêmes octets qu'avant AC1 ;
// - cartes de collection (CC1, spec-carte-collection.md §10) : `book.json.cardFields` (taille, poids, époque, régime) ;
//   « trex » a la carte la plus chargée (sous-titre, illustration `images/trex-card.png` 900 × 600, les 4 caractéristiques,
//   valeurs jusqu'à 16 caractères, paragraphe de 250 caractères en espagnol) ; « raptor » une carte sans illustration
//   (image de chargement à la place), sans sous-titre, « régime » sans valeur (avertissement voulu, affiché « — ») ;
//   « ptero » et « duo » sans carte ;
// - un dossier `blender/` déjà posé dans le livre de test (raptor réel, point de clôture de ST1) est conservé : seul le reste
//   du dossier est effacé et réécrit.
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO, type Node as GNode, type TypedArray } from '@gltf-transform/core';
import sharp from 'sharp';
import { EDIT_LAYER_VERSION, LAYER3D_VERSION, RESERVED_SOURCE_DIR, type Book, type CardField, type EditLayer, type Layer3d } from '../src/schema/glbi';

const dir = path.resolve(process.cwd(), process.argv[2] ?? 'books/test-dino');

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** WAV PCM 16 bits mono : `sample(t)` dans [−1, 1] pour t en secondes. */
function wav(seconds: number, sample: (t: number) => number, rate = 22050): Buffer {
  const n = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + 2 * n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + 2 * n, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(2 * n, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(32767 * Math.max(-1, Math.min(1, sample(i / rate)))), 44 + 2 * i);
  return b;
}

/** Bip d'action : trois notes brèves répétées (on reconnaît le début, la coupure et la fin), attaque et fin adoucies. */
function actionWav(freq: number, seconds = 2): Buffer {
  return wav(seconds, (t) => {
    const env = Math.min(1, t / 0.01, (seconds - t) / 0.05);
    const pulse = (t % 0.25) < 0.18 ? 1 : 0;
    return 0.5 * env * pulse * Math.sin(2 * Math.PI * freq * t);
  });
}

/** Ambiance : 110 Hz modulé à 1 Hz, 2 s (nombres entiers de périodes : la boucle ne s'entend pas). */
const ambientWav = () => wav(2, (t) => 0.25 * (0.6 + 0.4 * Math.sin(2 * Math.PI * t)) * Math.sin(2 * Math.PI * 110 * t));

const L = (fr: string, en: string, es: string) => ({ fr, en, es });

/** GLB minimal : armature `armature` (2 os), maillage skinné, clips donnés, empty `start`, GLBI_ROOT portant la couche 3D. */
async function makeGlb(file: string, armature: string, clips: string[], layer3d: Layer3d): Promise<void> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Scene');

  const arm = doc.createNode(armature);
  const boneRoot = doc.createNode(`${armature}_root`).setTranslation([0, 0, 0]);
  const boneTail = doc.createNode(`${armature}_tail`).setTranslation([0, 1, 0]);
  boneRoot.addChild(boneTail);
  arm.addChild(boneRoot);

  const positions = doc.createAccessor().setType('VEC3').setBuffer(buffer)
    .setArray(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 2, 0]));
  const joints = doc.createAccessor().setType('VEC4').setBuffer(buffer)
    .setArray(new Uint16Array([0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0]));
  const weights = doc.createAccessor().setType('VEC4').setBuffer(buffer)
    .setArray(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]));
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', positions).setAttribute('JOINTS_0', joints).setAttribute('WEIGHTS_0', weights);
  const mesh = doc.createMesh(`${armature}_mesh`).addPrimitive(prim);
  const ibm = doc.createAccessor().setType('MAT4').setBuffer(buffer).setArray(new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1, 0, 1,
  ]));
  const skin = doc.createSkin(`${armature}_skin`).addJoint(boneRoot).addJoint(boneTail).setInverseBindMatrices(ibm).setSkeleton(boneRoot);
  const body = doc.createNode('Body').setMesh(mesh).setSkin(skin).setExtras({
    src_name: 'Dinosaure de test',
    src_author: 'GLBInterpreter',
    src_license: 'CC0',
    src_url: 'https://example.org/dino-test',
  });
  arm.addChild(body);
  scene.addChild(arm);

  const start: GNode = doc.createNode('start').setTranslation([0, 1, 0]); // au centre du sujet (Î10b : cible du cadrage)
  scene.addChild(start);

  for (const [i, name] of clips.entries()) {
    const input = doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Float32Array([0, 0.5 + i * 0.25]));
    const s = Math.sin(0.2 * (i + 1));
    const output = doc.createAccessor().setBuffer(buffer).setType('VEC4')
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, s, Math.cos(0.2 * (i + 1))]));
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
    const channel = doc.createAnimationChannel().setTargetNode(boneTail).setTargetPath('rotation').setSampler(sampler);
    doc.createAnimation(name).addSampler(sampler).addChannel(channel);
  }

  scene.addChild(doc.createNode('GLBI_ROOT').setExtras({ glbi_version: LAYER3D_VERSION, glbi_config: JSON.stringify(layer3d) }));
  await new NodeIO().write(file, doc);
}

const ACTIONS = [
  { id: 'walk', label: L('Marcher', 'Walk', 'Caminar') },
  { id: 'roar', label: L('Rugir', 'Roar', 'Rugir') },
  { id: 'eat', label: L('Manger', 'Eat', 'Comer') },
];

/** Couche 3D (ce qu'écrit l'addon v0.2) : identifiants, objets, clips, boucle, cible caméra. */
function layer3d(id: string, armature: string): Layer3d {
  return {
    version: LAYER3D_VERSION,
    scene: { id },
    modules: {
      camera: { target: 'start' },
      animations: {
        mode: 'buttons',
        idle: { object: armature, clip: 'idle', loop: true },
        // Raptor : « walk » en boucle (Î11, son qui boucle avec l'action et s'arrête par son bouton)
        actions: ACTIONS.map((a) => ({ id: a.id, object: armature, type: 'armature' as const, clip: a.id, trigger: 'button' as const, loop: id === 'raptor' && a.id === 'walk' })),
      },
    },
  };
}

/** Couche éditoriale (ce qu'écrit l'atelier) : textes, assets, cadrage, quiz, crédits ; actions indexées par `id`. */
function editLayer(id: string, name: ReturnType<typeof L>): EditLayer {
  return {
    version: EDIT_LAYER_VERSION,
    scene: { name, loaderImage: `images/${id}-preview.png` },
    modules: {
      camera: {
        zoom: 0.5, lookAxis: 'x', minDistance: 1, maxDistance: 20,
        minPolarAngle: 0, maxPolarAngle: 1.57, minAzimuthAngle: -3.14, maxAzimuthAngle: 3.14, enableZoom: true,
      },
      animations: {
        actions: Object.fromEntries(ACTIONS.map((a) => [a.id, { label: a.label, icon: `icons/${a.id}.png`, sound: `sounds/${id}_${a.id}.wav` }])),
      },
      audio: { ambientSound: 'sounds/jungle.wav' },
      quiz: {
        question: L(`Que mange le ${name.fr} ?`, `What does the ${name.en} eat?`, `¿Qué come el ${name.es}?`),
        choices: [
          { text: L('De l’herbe', 'Grass', 'Hierba'), correct: false },
          { text: L('De la viande', 'Meat', 'Carne'), correct: true },
          { text: L('Des cailloux', 'Stones', 'Piedras'), correct: false },
        ],
        explanation: L('C’est un carnivore.', 'It is a carnivore.', 'Es carnívoro.'),
      },
      credits: {
        assets: [
          ...ACTIONS.map((a) => ({ asset: `sounds/${id}_${a.id}.wav`, title: `${a.id} (test)`, author: 'GLBInterpreter', license: 'CC0' })),
          { asset: 'sounds/jungle.wav', title: 'Jungle (test)', author: 'GLBInterpreter', license: 'CC0', source: 'https://example.org/jungle' },
          // Î12 : une image créditée (rubrique « Images » de la fenêtre Informations).
          { asset: 'icons/walk.png', title: 'Icône marcher (test)', author: 'GLBInterpreter', license: 'CC-BY 4.0', source: 'https://example.org/icons' },
        ],
      },
    },
  };
}


// ---------------------------------------------------------------------------------------------------------
// Scène « duo » (AC1) : deux personnages, clips communs, cible animée, événements, coupe au noir
// ---------------------------------------------------------------------------------------------------------

const DUO_FPS = 30;
const DUO_CLIPS = { idle: 2, chasse: 4, chute: 2, regard: 3, course: 1 } as const;
type DuoClip = keyof typeof DUO_CLIPS;

/** Couche 3D de « duo » : instants des événements = marqueurs posés dans Blender (secondes depuis le début du clip). */
function duoLayer3d(): Layer3d {
  const actor = 'Armature_Chasseur';
  return {
    version: LAYER3D_VERSION,
    scene: { id: 'duo' },
    modules: {
      camera: { target: 'start' },
      animations: {
        mode: 'buttons',
        idle: { object: actor, clip: 'idle', loop: true },
        actions: [
          {
            id: 'chasse', object: actor, type: 'armature', clip: 'chasse', trigger: 'button', loop: false,
            events: [{ id: 'morsure', time: 2 }, { id: 'souffle', time: 2.5 }, { id: 'fuite', time: 3.2 }],
          },
          { id: 'chute', object: actor, type: 'armature', clip: 'chute', trigger: 'button', loop: false, transition: 'cut', events: [{ id: 'impact', time: 1.5 }] },
          // DP-19 (AC2) : caméra posée sur l'empty `CamRegard` pendant « regard » (fondu), regard sur la cible `start`.
          { id: 'regard', object: actor, type: 'armature', clip: 'regard', trigger: 'button', loop: false, cameraPosition: 'CamRegard' },
          // AC2 : action en boucle à événements (redéclenchés à chaque tour), arrêtée par son propre bouton.
          {
            id: 'course', object: actor, type: 'armature', clip: 'course', trigger: 'button', loop: true,
            events: [{ id: 'pas_g', time: 0.25 }, { id: 'pas_d', time: 0.75 }],
          },
        ],
      },
    },
  };
}

/** Couche éditoriale de « duo » : sons d'événement (« souffle » volontairement sans son : avertissement de book:check). */
function duoEditLayer(): EditLayer {
  const credit = (f: string, title: string) => ({ asset: `sounds/${f}.wav`, title, author: 'GLBInterpreter', license: 'CC0' });
  return {
    version: EDIT_LAYER_VERSION,
    scene: { name: L('La poursuite', 'The chase', 'La persecución'), loaderImage: 'images/duo-preview.png' },
    modules: {
      camera: {
        zoom: 0.5, minDistance: 2, maxDistance: 20, minPolarAngle: 0, maxPolarAngle: 1.57, minAzimuthAngle: -3.14, maxAzimuthAngle: 3.14, enableZoom: true,
      },
      animations: {
        actions: {
          chasse: {
            label: L('Chasser', 'Chase', 'Perseguir'), icon: 'icons/walk.png', sound: 'sounds/duo_chasse.wav',
            events: { morsure: { sound: 'sounds/duo_morsure.wav' }, fuite: { sound: 'sounds/duo_fuite.wav' } },
          },
          chute: { label: L('Tomber', 'Fall', 'Caer'), icon: 'icons/eat.png', events: { impact: { sound: 'sounds/duo_impact.wav' } } },
          regard: { label: L('Regarder', 'Look', 'Mirar'), icon: 'icons/roar.png', sound: 'sounds/duo_regard.wav' },
          course: { label: L('Courir', 'Run', 'Correr'), icon: 'icons/walk.png', events: { pas_g: { sound: 'sounds/duo_pas.wav' }, pas_d: { sound: 'sounds/duo_pas.wav' } } },
        },
      },
      audio: { ambientSound: 'sounds/jungle.wav' },
      credits: {
        assets: [
          credit('duo_chasse', 'Chasse (test)'),
          credit('duo_regard', 'Regard (test)'),
          credit('duo_morsure', 'Morsure (test)'),
          credit('duo_fuite', 'Fuite (test)'),
          credit('duo_impact', 'Impact (test)'),
          credit('duo_pas', 'Pas (test)'),
          { asset: 'sounds/jungle.wav', title: 'Jungle (test)', author: 'GLBInterpreter', license: 'CC0', source: 'https://example.org/jungle' },
        ],
      },
    },
  };
}

/** Courbe par morceaux sur [0, d] : `at(t)` → valeur ; échantillonnée à 30 i/s comme un clip cuit par Blender. */
const bake = (d: number, at: (t: number) => number[]) => {
  const n = Math.round(d * DUO_FPS);
  const times: number[] = [];
  const values: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / DUO_FPS;
    times.push(Math.min(t, d));
    values.push(...at(t));
  }
  return { times, values };
};
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** 0 avant `a`, 1 après `b`, linéaire entre les deux. */
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
/** Quaternion d'une rotation d'angle `a` autour de Z. */
const rotZ = (a: number) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];

/**
 * GLB de « duo » : deux armatures de 2 os aux noms identiques (maillage skinné chacune), empty `start` (cible), empty
 * `CamRegard` (position de la caméra pendant « regard », AC2), GLBI_ROOT. Chaque clip est commun : il anime les deux
 * personnages (translation de l'armature, rotation de l'os de queue) et, pour « chasse », la cible ; « regard » anime aussi
 * `CamRegard`.
 * Pistes cuites à 30 i/s, avec des paliers (clés redondantes que `resample` retire sans changer le mouvement).
 */
async function makeDuoGlb(file: string, layer: Layer3d): Promise<void> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Scene');

  const character = (name: string, x: number, credit: boolean) => {
    const arm = doc.createNode(name).setTranslation([x, 0, 0]);
    // Même squelette pour les deux personnages (AC2) : os de même nom dans le GLB.
    const boneRoot = doc.createNode('Os_racine');
    const boneTail = doc.createNode('Os_queue').setTranslation([0, 1, 0]);
    boneRoot.addChild(boneTail);
    arm.addChild(boneRoot);
    const acc = (type: 'VEC3' | 'VEC4' | 'MAT4', a: TypedArray) => doc.createAccessor().setType(type).setBuffer(buffer).setArray(a);
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', acc('VEC3', new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 2, 0])))
      .setAttribute('JOINTS_0', acc('VEC4', new Uint16Array([0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0])))
      .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])));
    const ibm = acc('MAT4', new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1, 0, 1]));
    const skin = doc.createSkin(`${name}_skin`).addJoint(boneRoot).addJoint(boneTail).setInverseBindMatrices(ibm).setSkeleton(boneRoot);
    const body = doc.createNode(`${name}_body`).setMesh(doc.createMesh(`${name}_mesh`).addPrimitive(prim)).setSkin(skin);
    if (credit) body.setExtras({ src_name: 'Dinosaures de test (duo)', src_author: 'GLBInterpreter', src_license: 'CC0', src_url: 'https://example.org/dino-test' });
    arm.addChild(body);
    scene.addChild(arm);
    return { arm, tail: boneTail };
  };
  const hunter = character('Armature_Chasseur', -2, true);
  const prey = character('Armature_Proie', 1, false);
  const target: GNode = doc.createNode('start').setTranslation([-0.5, 1, 0]);
  scene.addChild(target);
  // Empty de position de la caméra (DP-19) : arc de 120° autour de la cible pendant « regard », de 2,5 m à 3,5 m de haut,
  // à 6 m de la cible ; au repos, à son point de départ.
  const camAt = (t: number) => {
    const a = (Math.PI / 3) * (1 - 2 * ramp(t, 0, DUO_CLIPS.regard));
    return [-0.5 + 6 * Math.sin(a), 2.5 + ramp(t, 0, DUO_CLIPS.regard), 6 * Math.cos(a)];
  };
  const camRegard: GNode = doc.createNode('CamRegard').setTranslation(camAt(0) as [number, number, number]);
  scene.addChild(camRegard);

  // Mouvements de chaque clip : position des deux armatures et de la cible, angle de queue des deux personnages.
  const motion: Record<DuoClip, (t: number) => { h: number; p: number; c: number; ha: number; pa: number; pz?: number }> = {
    idle: (t) => ({ h: -2, p: 1, c: -0.5, ha: 0.1 * Math.sin(Math.PI * t), pa: -0.1 * Math.sin(Math.PI * t) }),
    // Le chasseur court jusqu'à la proie (0–2 s, morsure à 2 s), la proie fuit (3,2 s) ; la cible suit le milieu.
    chasse: (t) => {
      const h = -2 + 2.5 * ramp(t, 0, 2);
      const p = 1 + 2 * ramp(t, 3.2, 4);
      return { h, p, c: (h + p) / 2, ha: t < 2 ? 0.4 * Math.sin(4 * Math.PI * t) : 0.6, pa: t > 3.2 ? 0.4 * Math.sin(4 * Math.PI * t) : 0 };
    },
    // Le chasseur bascule (queue à 90°) et touche le sol à 1,5 s ; la proie ne bouge pas (palier sur tout le clip).
    chute: (t) => ({ h: -2, p: 1, c: -0.5, ha: (Math.PI / 2) * ramp(t, 0.5, 1.5), pa: 0 }),
    regard: (t) => ({ h: -2, p: 1, c: -0.5, ha: 0.3 * ramp(t, 0, 0.5) - 0.3 * ramp(t, 2.5, 3), pa: 0 }),
    // Course sur place : queues qui battent, une fois par demi-tour (début et fin identiques : la boucle ne saute pas).
    course: (t) => ({ h: -2, p: 1, c: -0.5, ha: 0.4 * Math.sin(2 * Math.PI * t), pa: -0.4 * Math.sin(2 * Math.PI * t) }),
  };
  for (const [name, d] of Object.entries(DUO_CLIPS) as [DuoClip, number][]) {
    const anim = doc.createAnimation(name);
    const m = motion[name];
    const channel = (node: GNode, pathName: 'translation' | 'rotation', at: (t: number) => number[]) => {
      const { times, values } = bake(d, at);
      const input = doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Float32Array(times));
      const output = doc.createAccessor().setBuffer(buffer).setType(pathName === 'rotation' ? 'VEC4' : 'VEC3').setArray(new Float32Array(values));
      const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
      anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(pathName).setSampler(sampler));
    };
    channel(hunter.arm, 'translation', (t) => [m(t).h, 0, 0]);
    channel(prey.arm, 'translation', (t) => [m(t).p, 0, 0]);
    channel(hunter.tail, 'rotation', (t) => rotZ(m(t).ha));
    channel(prey.tail, 'rotation', (t) => rotZ(m(t).pa));
    // Cible caméra : animée seulement dans « chasse » (DP-7 : la caméra la suit, AC2).
    if (name === 'chasse') channel(target, 'translation', (t) => [m(t).c, 1, 0]);
    // Position de la caméra : animée seulement dans « regard » (DP-19, AC2).
    if (name === 'regard') channel(camRegard, 'translation', camAt);
  }

  scene.addChild(doc.createNode('GLBI_ROOT').setExtras({ glbi_version: LAYER3D_VERSION, glbi_config: JSON.stringify(layer) }));
  await new NodeIO().write(file, doc);
}

// ---------------------------------------------------------------------------------------------------------
// Cartes de collection (CC1)
// ---------------------------------------------------------------------------------------------------------

/** Intitulés communs à toutes les cartes du livre (`book.json.cardFields`), dans l'ordre d'affichage. */
const CARD_FIELDS: CardField[] = [
  { id: 'taille', label: L('Taille', 'Length', 'Longitud') },
  { id: 'poids', label: L('Poids', 'Weight', 'Peso') },
  { id: 'epoque', label: L('Époque', 'Period', 'Época') },
  { id: 'regime', label: L('Régime', 'Diet', 'Dieta') },
];

/** Carte de chaque scène (couche éditoriale, `modules.card`) ; « ptero » et « duo » n'en ont pas. */
const CARDS: Record<string, NonNullable<NonNullable<EditLayer['modules']>['card']>> = {
  // Carte la plus chargée (capture de 375 × 667 : rien ne doit déborder) : 250 caractères en espagnol.
  trex: {
    subtitle: L('T. rex · il y a 68 millions d’années', 'T. rex · 68 million years ago', 'T. rex · hace 68 millones de años'),
    image: 'images/trex-card.png',
    fields: {
      taille: L('12 à 13 mètres', '12 to 13 metres', '12 a 13 metros'),
      poids: L('8 à 9 tonnes', '8 to 9 tonnes', '8 a 9 toneladas'),
      epoque: L('Fin du Crétacé', 'Late Cretaceous', 'Cretácico tardío'),
      regime: L('Carnivore', 'Carnivore', 'Carnívoro'),
    },
    text: L(
      'Le tyrannosaure vivait à la fin du Crétacé, en Amérique du Nord. Ses dents mesuraient jusqu’à 30 cm et sa morsure était l’une des plus puissantes du monde animal. Ses petits bras n’avaient que deux doigts, mais ils étaient vraiment très musclés.',
      'The tyrannosaurus lived at the end of the Cretaceous, in North America. Its teeth were up to 30 cm long and its bite was one of the strongest in the whole animal world. Its short arms had only two fingers, but they were very, very strong.',
      'El tiranosaurio vivió a finales del Cretácico, en América del Norte. Sus dientes medían hasta 30 cm y su mordida era una de las más potentes del mundo animal. Sus brazos cortos solo tenían dos dedos, pero eran muy musculosos y fuertes, ¡de veras, sí!',
    ),
  },
  raptor: {
    fields: {
      taille: L('2 mètres', '2 metres', '2 metros'),
      poids: L('15 kg', '15 kg', '15 kg'),
      epoque: L('Crétacé', 'Cretaceous', 'Cretácico'),
    },
    text: L(
      'Le vélociraptor était un petit chasseur rapide, couvert de plumes.',
      'The velociraptor was a small, fast hunter covered in feathers.',
      'El velocirraptor era un cazador pequeño y rápido, cubierto de plumas.',
    ),
  },
};

/** Illustration de la carte de « trex » : 900 × 600 (3:2), ciel, sol et silhouette, reconnaissable à l'écran. */
async function cardImage(file: string): Promise<void> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#fde68a"/></linearGradient></defs>
    <rect width="900" height="600" fill="url(#sky)"/><rect y="440" width="900" height="160" fill="#65a30d"/>
    <circle cx="760" cy="120" r="60" fill="#fbbf24"/>
    <ellipse cx="430" cy="380" rx="190" ry="80" fill="#166534"/><circle cx="620" cy="280" r="70" fill="#166534"/>
    <rect x="330" y="420" width="40" height="110" fill="#166534"/><rect x="460" y="420" width="40" height="110" fill="#166534"/>
    <polygon points="250,360 60,330 250,410" fill="#166534"/><circle cx="645" cy="260" r="10" fill="#fff"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

/** Couche éditoriale avec la carte de la scène, rangée comme l'écrit l'atelier (après le quiz, avant les crédits). */
function withCard(edit: EditLayer, id: string): EditLayer {
  const card = CARDS[id];
  if (!card || !edit.modules) return edit;
  const { credits, ...rest } = edit.modules;
  return { ...edit, modules: { ...rest, card, credits } };
}

/** Efface le dossier du livre de test sauf le dossier réservé `blender/` (point de clôture de ST1). */
function clearTestBook(): boolean {
  if (!fs.existsSync(dir)) return false;
  let kept = false;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && e.name.toLowerCase() === RESERVED_SOURCE_DIR) {
      kept = true;
      continue;
    }
    fs.rmSync(path.join(dir, e.name), { recursive: true, force: true });
  }
  return kept;
}

async function main(): Promise<void> {
  const keptBlender = clearTestBook();
  for (const sub of ['scenes', 'images', 'icons', 'sounds']) fs.mkdirSync(path.join(dir, sub), { recursive: true });

  const book: Book = {
    bookId: 'test-dino',
    title: L('Dinos de test', 'Test dinos', 'Dinos de prueba'),
    languages: ['fr', 'en', 'es'],
    scenes: ['trex', 'raptor', 'ptero', 'duo'],
    origin: 'https://dino.editions-liger.com',
    ogImage: 'images/og.png',
    legal: { year: 2026, text: L('© Éditions Liger', '© Éditions Liger', '© Éditions Liger') },
    cardFields: CARD_FIELDS,
  };
  fs.writeFileSync(path.join(dir, 'book.json'), `${JSON.stringify(book, null, 2)}\n`);

  const clips = ['idle', 'walk', 'roar', 'eat'];
  const scenes = [
    { id: 'trex', armature: 'Armature_Trex', name: L('Tyrannosaure', 'Tyrannosaurus', 'Tiranosaurio') },
    { id: 'raptor', armature: 'Armature_Raptor', name: L('Vélociraptor', 'Velociraptor', 'Velociraptor') },
    { id: 'ptero', armature: 'Armature_Ptero', name: L('Ptéranodon', 'Pteranodon', 'Pteranodonte') },
  ];
  for (const sc of scenes) {
    await makeGlb(path.join(dir, `scenes/${sc.id}.glb`), sc.armature, clips, layer3d(sc.id, sc.armature));
    const edit = editLayer(sc.id, sc.name);
    // « raptor » sans cadrage (Î10b) : couvre les valeurs par défaut du lecteur (sphère englobante, lib/orbitFraming.ts)
    if (sc.id === 'raptor') delete edit.modules!.camera;
    // « raptor » sans quiz (Î13) : scène débloquée à son ouverture ; « trex » et « ptero » ont un quiz complet en 3 langues.
    if (sc.id === 'raptor') delete edit.modules!.quiz;
    fs.writeFileSync(path.join(dir, `scenes/${sc.id}.edit.json`), `${JSON.stringify(withCard(edit, sc.id), null, 2)}\n`);
  }
  // « duo » en fin de livre (AC1).
  await makeDuoGlb(path.join(dir, 'scenes/duo.glb'), duoLayer3d());
  fs.writeFileSync(path.join(dir, 'scenes/duo.edit.json'), `${JSON.stringify(duoEditLayer(), null, 2)}\n`);

  for (const f of ['images/og.png', 'images/raptor-preview.png', 'images/ptero-preview.png', 'images/duo-preview.png', 'icons/walk.png', 'icons/roar.png', 'icons/eat.png']) {
    fs.writeFileSync(path.join(dir, f), PNG_1X1);
  }
  // Bruit pseudo-aléatoire (graine fixe : même fichier à chaque génération) : un PNG incompressible de ≈ 3 MiB.
  const side = 1024;
  const noise = Buffer.alloc(side * side * 3);
  let seed = 0x2545f491;
  for (let i = 0; i < noise.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    noise[i] = seed & 0xff;
  }
  await sharp(noise, { raw: { width: side, height: side, channels: 3 } }).png({ compressionLevel: 9 }).toFile(path.join(dir, 'images/trex-preview.png'));
  await cardImage(path.join(dir, 'images/trex-card.png'));
  // Icône du livre (Î9) : PNG carré ≥ 512 px, motif transparent (disque vert) pour vérifier les versions opaques.
  await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><circle cx="256" cy="256" r="220" fill="#2e8b57"/></svg>') }])
    .png()
    .toFile(path.join(dir, 'icon.png'));
  const pitch: Record<string, number> = { walk: 262, roar: 392, eat: 523 }; // do, sol, do aigu
  const octave: Record<string, number> = { trex: 1, raptor: 2, ptero: 4 };
  for (const id of ['trex', 'raptor', 'ptero']) {
    for (const a of ['walk', 'roar', 'eat']) {
      fs.writeFileSync(path.join(dir, `sounds/${id}_${a}.wav`), actionWav(pitch[a] * octave[id]));
    }
  }
  fs.writeFileSync(path.join(dir, 'sounds/jungle.wav'), ambientWav());
  // « duo » : son d'action (même bip que les autres scènes, 2 s) et sons d'événement brefs (0,3 s), de hauteurs distinctes.
  fs.writeFileSync(path.join(dir, 'sounds/duo_chasse.wav'), actionWav(330));
  fs.writeFileSync(path.join(dir, 'sounds/duo_regard.wav'), actionWav(440));
  const blip = (freq: number) => wav(0.3, (t) => 0.5 * Math.min(1, t / 0.01, (0.3 - t) / 0.03) * Math.sin(2 * Math.PI * freq * t));
  fs.writeFileSync(path.join(dir, 'sounds/duo_morsure.wav'), blip(660));
  fs.writeFileSync(path.join(dir, 'sounds/duo_fuite.wav'), blip(880));
  fs.writeFileSync(path.join(dir, 'sounds/duo_impact.wav'), blip(220));
  fs.writeFileSync(path.join(dir, 'sounds/duo_pas.wav'), blip(550));
  console.log(`make-test-book : livre de test écrit dans ${dir}${keptBlender ? ` (dossier ${RESERVED_SOURCE_DIR}/ conservé)` : ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
