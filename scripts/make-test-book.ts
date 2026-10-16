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
// - images PNG 1×1, icône du livre `icon.png` (512 px, Î9) ;
// - sons WAV audibles (Î11) : un bip par action, de hauteur propre à l'action (walk grave, roar médium, eat aigu ; raptor une
//   octave plus haut que trex), plus long que le clip (on entend la coupure à l'interruption et à la fin du clip) ; ambiance `jungle.wav` : bourdonnement doux de 2 s qui boucle sans coupure ;
// - action « walk » du raptor en boucle (`loop: true`, Î11) : couvre le son qui boucle avec l'action et s'arrête avec elle ;
// - image de chargement de « trex » en bruit aléatoire (≈ 3 MiB, Î10) : avec `--part-mib 1`, au moins un fichier du livre est
//   découpé, ce qui garde la couverture des tests de recomposition et de reprise (tests/install.spec.ts) sur un livre v1.
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO, type Node as GNode } from '@gltf-transform/core';
import sharp from 'sharp';
import { EDIT_LAYER_VERSION, LAYER3D_VERSION, type Book, type EditLayer, type Layer3d } from '../src/schema/glbi';

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

async function main(): Promise<void> {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const sub of ['scenes', 'images', 'icons', 'sounds']) fs.mkdirSync(path.join(dir, sub), { recursive: true });

  const book: Book = {
    bookId: 'test-dino',
    title: L('Dinos de test', 'Test dinos', 'Dinos de prueba'),
    languages: ['fr', 'en', 'es'],
    scenes: ['trex', 'raptor'],
    origin: 'https://dino.editions-liger.com',
    ogImage: 'images/og.png',
    legal: { year: 2026, text: L('© Éditions Liger', '© Éditions Liger', '© Éditions Liger') },
  };
  fs.writeFileSync(path.join(dir, 'book.json'), `${JSON.stringify(book, null, 2)}\n`);

  const clips = ['idle', 'walk', 'roar', 'eat'];
  const scenes = [
    { id: 'trex', armature: 'Armature_Trex', name: L('Tyrannosaure', 'Tyrannosaurus', 'Tiranosaurio') },
    { id: 'raptor', armature: 'Armature_Raptor', name: L('Vélociraptor', 'Velociraptor', 'Velociraptor') },
  ];
  for (const sc of scenes) {
    await makeGlb(path.join(dir, `scenes/${sc.id}.glb`), sc.armature, clips, layer3d(sc.id, sc.armature));
    const edit = editLayer(sc.id, sc.name);
    // « raptor » sans cadrage (Î10b) : couvre les valeurs par défaut du lecteur (sphère englobante, lib/orbitFraming.ts)
    if (sc.id === 'raptor') delete edit.modules!.camera;
    fs.writeFileSync(path.join(dir, `scenes/${sc.id}.edit.json`), `${JSON.stringify(edit, null, 2)}\n`);
  }

  for (const f of ['images/og.png', 'images/raptor-preview.png', 'icons/walk.png', 'icons/roar.png', 'icons/eat.png']) {
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
  // Icône du livre (Î9) : PNG carré ≥ 512 px, motif transparent (disque vert) pour vérifier les versions opaques.
  await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><circle cx="256" cy="256" r="220" fill="#2e8b57"/></svg>') }])
    .png()
    .toFile(path.join(dir, 'icon.png'));
  const pitch: Record<string, number> = { walk: 262, roar: 392, eat: 523 }; // do, sol, do aigu
  for (const id of ['trex', 'raptor']) {
    for (const a of ['walk', 'roar', 'eat']) {
      fs.writeFileSync(path.join(dir, `sounds/${id}_${a}.wav`), actionWav(pitch[a] * (id === 'raptor' ? 2 : 1)));
    }
  }
  fs.writeFileSync(path.join(dir, 'sounds/jungle.wav'), ambientWav());
  console.log(`make-test-book : livre de test écrit dans ${dir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
