// scripts/make-test-book.ts — génère un livre de test conforme à spec-extras-blender.md v1.1 (Î6).
//
//   npm run book:test-source            → books/test-dino/ (non versionné)
//   npm run build -- --source books/test-dino
//
// Contenu synthétique, sans valeur visuelle : il sert à tester build-book en l'absence de GLB réel produit par l'addon.
// - scène « trex » : GLB avec GLBI_ROOT (glbi_version = 1, glbi_config = chaîne JSON), armature à 2 os, maillage
//   skinné portant des propriétés src_*, empty « start », clips idle/walk/roar/eat ;
// - scène « raptor » : GLB sans GLBI_ROOT + scenes/raptor.json (source de développement) ;
// - images PNG 1×1, sons WAV de 0,1 s, icônes du manifest.
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO, type Node as GNode } from '@gltf-transform/core';
import type { GlbiConfig, Book } from '../src/schema/glbi';

const dir = path.resolve(process.cwd(), process.argv[2] ?? 'books/test-dino');

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function silentWav(seconds = 0.1, rate = 8000): Buffer {
  const n = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  b.fill(128, 44);
  return b;
}

const L = (fr: string, en: string, es: string) => ({ fr, en, es });

/** GLB minimal : armature `armature` (2 os), maillage skinné, clips donnés, empty `start`, GLBI_ROOT facultatif. */
async function makeGlb(file: string, armature: string, clips: string[], glbiConfig: GlbiConfig | null): Promise<void> {
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

  const start: GNode = doc.createNode('start').setTranslation([0, 1, 4]);
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

  if (glbiConfig) {
    scene.addChild(doc.createNode('GLBI_ROOT').setExtras({ glbi_version: 1, glbi_config: JSON.stringify(glbiConfig) }));
  }
  await new NodeIO().write(file, doc);
}

function sceneConfig(id: string, armature: string, name: ReturnType<typeof L>): GlbiConfig {
  const actions = [
    { id: 'walk', label: L('Marcher', 'Walk', 'Caminar') },
    { id: 'roar', label: L('Rugir', 'Roar', 'Rugir') },
    { id: 'eat', label: L('Manger', 'Eat', 'Comer') },
  ];
  return {
    version: 1,
    scene: { id, name, loaderImage: `images/${id}-preview.png` },
    modules: {
      camera: {
        target: 'start', zoom: 0.5, lookAxis: 'x', minDistance: 1, maxDistance: 20,
        minPolarAngle: 0, maxPolarAngle: 1.57, minAzimuthAngle: -3.14, maxAzimuthAngle: 3.14, enableZoom: true,
      },
      animations: {
        mode: 'buttons',
        idle: { object: armature, clip: 'idle', loop: true },
        actions: actions.map((a) => ({
          id: a.id, object: armature, type: 'armature' as const, clip: a.id, trigger: 'button' as const,
          label: a.label, icon: `icons/${a.id}.png`, sound: `sounds/${id}_${a.id}.wav`, loop: false,
        })),
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
          ...actions.map((a) => ({ asset: `sounds/${id}_${a.id}.wav`, title: `${a.id} (test)`, author: 'GLBInterpreter', license: 'CC0' })),
          { asset: 'sounds/jungle.wav', title: 'Jungle (test)', author: 'GLBInterpreter', license: 'CC0', source: 'https://example.org/jungle' },
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
  await makeGlb(path.join(dir, 'scenes/trex.glb'), 'Armature_Trex', clips,
    sceneConfig('trex', 'Armature_Trex', L('Tyrannosaure', 'Tyrannosaurus', 'Tiranosaurio')));
  await makeGlb(path.join(dir, 'scenes/raptor.glb'), 'Armature_Raptor', clips, null);
  fs.writeFileSync(path.join(dir, 'scenes/raptor.json'),
    `${JSON.stringify(sceneConfig('raptor', 'Armature_Raptor', L('Vélociraptor', 'Velociraptor', 'Velociraptor')), null, 2)}\n`);

  for (const f of ['images/og.png', 'images/trex-preview.png', 'images/raptor-preview.png', 'icons/walk.png', 'icons/roar.png', 'icons/eat.png', 'icon-192.png', 'icon-512.png']) {
    fs.writeFileSync(path.join(dir, f), PNG_1X1);
  }
  for (const id of ['trex', 'raptor']) for (const a of ['walk', 'roar', 'eat']) fs.writeFileSync(path.join(dir, `sounds/${id}_${a}.wav`), silentWav());
  fs.writeFileSync(path.join(dir, 'sounds/jungle.wav'), silentWav(0.2));
  console.log(`make-test-book : livre de test écrit dans ${dir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
