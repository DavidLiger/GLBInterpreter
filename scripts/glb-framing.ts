// scripts/glb-framing.ts — diagnostic du cadrage et de l'éclairage d'un GLB (Î10b), sans navigateur.
//
//   npx tsx scripts/glb-framing.ts <scenes/<id>.glb> [<scenes/<id>.edit.json>]
//
// Affiche : nœuds racines (translation, rotation en degrés d'Euler XYZ, échelle) ; boîte englobante monde des maillages
// (pose de repos) et rayon de la sphère englobante ; cible caméra de GLBI_ROOT (position monde) ; lampes
// KHR_lights_punctual (type, intensité) ; cadrage que posera le lecteur (`lib/orbitFraming.ts`), avec le cadrage de
// `edit.json` s'il est donné, sinon les valeurs par défaut. Sert à écarter un modèle couché, à une autre échelle, ou une
// cible mal placée.
import fs from 'node:fs';
import { getBounds, type Node as GNode } from '@gltf-transform/core';
import type { Light } from '@gltf-transform/extensions';
import * as THREE from 'three';
import { getIO } from './glb-pipeline';
import { resolveOrbit, orbitPosition, type OrbitFraming } from '../src/components/diorama/lib/orbitFraming';

const deg = (r: number) => `${((r * 180) / Math.PI).toFixed(1)}°`;
const v3 = (v: ArrayLike<number>) => `(${Array.from(v).map((x) => x.toFixed(3)).join(', ')})`;

async function main() {
  const [glbPath, editPath] = process.argv.slice(2);
  if (!glbPath) {
    console.error('usage : npx tsx scripts/glb-framing.ts <scène.glb> [<scène.edit.json>]');
    process.exit(2);
  }
  const doc = await (await getIO()).read(glbPath);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error('aucune scène dans le GLB');

  console.log(`${glbPath}`);
  console.log('Nœuds racines :');
  for (const n of scene.listChildren()) {
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(...n.getRotation()), 'XYZ');
    console.log(`  ${n.getName() || '(sans nom)'} : translation ${v3(n.getTranslation())}, rotation (${deg(e.x)}, ${deg(e.y)}, ${deg(e.z)}), échelle ${v3(n.getScale())}`);
  }

  const b = getBounds(scene);
  const size = [0, 1, 2].map((i) => b.max[i] - b.min[i]);
  const radius = Math.hypot(...size) / 2;
  console.log(`Boîte englobante monde (glTF, Y en haut, face +Z) : min ${v3(b.min)}, max ${v3(b.max)}, taille ${v3(size)}`);
  console.log(`Rayon de la sphère englobante : ${radius.toFixed(3)}`);
  if (size[1] < Math.max(size[0], size[2]) * 0.35) console.log('  note : boîte très plate en hauteur (modèle couché, ou sujet allongé)');

  const glbiRoot = root.listNodes().find((n) => n.getName() === 'GLBI_ROOT');
  let targetName: string | undefined;
  try {
    const cfg = JSON.parse(String((glbiRoot?.getExtras() as { glbi_config?: string } | undefined)?.glbi_config ?? '{}'));
    targetName = cfg?.modules?.camera?.target;
  } catch {
    console.log('GLBI_ROOT : glbi_config illisible');
  }
  const target: GNode | undefined = targetName ? root.listNodes().find((n) => n.getName() === targetName) : undefined;
  const targetPos = new THREE.Vector3(...(target ? target.getWorldTranslation() : [0, 0, 0]));
  console.log(targetName ? `Cible caméra « ${targetName} » : ${target ? `position monde ${v3(targetPos.toArray())}, locale ${v3(target.getTranslation())}` : 'INTROUVABLE'}` : 'Pas de cible caméra dans GLBI_ROOT');

  const lights = root.listNodes().flatMap((n) => {
    const l = n.getExtension<Light>('KHR_lights_punctual');
    return l ? [`${n.getName()} : ${l.getType()}, intensité ${l.getIntensity()}`] : [];
  });
  console.log(lights.length ? `Lampes (KHR_lights_punctual) :\n  ${lights.join('\n  ')}` : 'Aucune lampe : éclairage de secours du lecteur (D-8.10)');

  let framing: OrbitFraming = {};
  if (editPath) {
    const edit = JSON.parse(fs.readFileSync(editPath, 'utf8'));
    framing = edit?.modules?.camera ?? {};
    console.log(`Cadrage de ${editPath} : ${Object.keys(framing).length ? JSON.stringify(framing) : 'aucun (valeurs par défaut)'}`);
  }
  const f = resolveOrbit(framing, radius);
  const cam = orbitPosition(targetPos, f);
  console.log('Cadrage posé par le lecteur :');
  console.log(`  distance ${f.distance.toFixed(3)} dans [${f.minDistance.toFixed(3)}, ${f.maxDistance.toFixed(3)}]`);
  console.log(`  polaire ${deg(f.polarAngle)} dans [${deg(f.minPolarAngle)}, ${deg(f.maxPolarAngle)}] ; azimut ${deg(f.azimuthAngle)} dans [${Number.isFinite(f.minAzimuthAngle) ? deg(f.minAzimuthAngle) : '−∞'}, ${Number.isFinite(f.maxAzimuthAngle) ? deg(f.maxAzimuthAngle) : '+∞'}]`);
  console.log(`  caméra en ${v3(cam.toArray())}, visant ${v3(targetPos.toArray())}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
