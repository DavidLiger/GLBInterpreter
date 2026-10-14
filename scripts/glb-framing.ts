// scripts/glb-framing.ts — diagnostic du cadrage et de l'éclairage d'un GLB (Î10b), sans navigateur.
//
//   npx tsx scripts/glb-framing.ts <scenes/<id>.glb> [<scenes/<id>.edit.json>]
//
// Affiche : nœuds racines (translation, rotation en degrés d'Euler XYZ, échelle) ; boîte englobante monde des maillages
// (pose de repos, **skinning appliqué** comme au rendu : un maillage skinné est placé par ses os, pas par son nœud) et rayon de la sphère englobante ; cible caméra de GLBI_ROOT (position monde) ; lampes
// KHR_lights_punctual (type, intensité) ; cadrage que posera le lecteur (`lib/orbitFraming.ts`), avec le cadrage de
// `edit.json` s'il est donné, sinon les valeurs par défaut. Sert à écarter un modèle couché, à une autre échelle, ou une
// cible mal placée.
import fs from 'node:fs';
import type { Node as GNode, Scene as GScene } from '@gltf-transform/core';
import type { Light } from '@gltf-transform/extensions';
import * as THREE from 'three';
import { getIO } from './glb-pipeline';
import { resolveOrbit, orbitPosition, type OrbitFraming } from '../src/components/diorama/lib/orbitFraming';

const deg = (r: number) => `${((r * 180) / Math.PI).toFixed(1)}°`;
const v3 = (v: ArrayLike<number>) => `(${Array.from(v).map((x) => x.toFixed(3)).join(', ')})`;

/**
 * Boîte englobante monde de la pose de repos, comme la calcule three au rendu (`Box3.setFromObject`) : un maillage skinné
 * est placé par ses os (Σ poids × monde de l'os × matrice de liaison inverse), son propre nœud est ignoré (spécification
 * glTF) ; les autres maillages par la matrice monde de leur nœud.
 */
function renderBounds(scene: GScene): THREE.Box3 {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const acc = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const nodes: GNode[] = [];
  scene.traverse((n) => {
    nodes.push(n);
  });
  for (const node of nodes) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const skin = node.getSkin();
    const nodeWorld = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    let jointMats: THREE.Matrix4[] | null = null;
    if (skin) {
      const ibm = skin.getInverseBindMatrices();
      jointMats = skin.listJoints().map((j, i) => {
        const inv = new THREE.Matrix4();
        if (ibm) inv.fromArray(ibm.getElement(i, new Array(16)));
        return new THREE.Matrix4().fromArray(j.getWorldMatrix()).multiply(inv);
      });
    }
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const joints = prim.getAttribute('JOINTS_0');
      const weights = prim.getAttribute('WEIGHTS_0');
      const p = [0, 0, 0];
      const ji = [0, 0, 0, 0];
      const wi = [0, 0, 0, 0];
      for (let k = 0; k < pos.getCount(); k++) {
        pos.getElement(k, p);
        v.set(p[0], p[1], p[2]);
        if (jointMats && joints && weights) {
          joints.getElement(k, ji);
          weights.getElement(k, wi);
          acc.set(0, 0, 0);
          let wsum = 0;
          for (let c = 0; c < 4; c++) {
            if (!wi[c] || !jointMats[ji[c]]) continue;
            acc.addScaledVector(tmp.copy(v).applyMatrix4(jointMats[ji[c]]), wi[c]);
            wsum += wi[c];
          }
          if (wsum > 0) box.expandByPoint(acc.divideScalar(wsum));
        } else {
          box.expandByPoint(v.applyMatrix4(nodeWorld));
        }
      }
    }
  }
  return box;
}

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

  const box = renderBounds(scene);
  const b = { min: box.min.toArray(), max: box.max.toArray() };
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
  const center = box.getCenter(new THREE.Vector3());
  console.log(targetName ? `Cible caméra « ${targetName} » : ${target ? `position monde ${v3(targetPos.toArray())}, locale ${v3(target.getTranslation())}` : 'INTROUVABLE'}` : 'Pas de cible caméra dans GLBI_ROOT');
  if (target) {
    const inside = box.containsPoint(targetPos);
    console.log(`  centre de la boîte ${v3(center.toArray())} ; cible ${inside ? 'dans la boîte' : 'HORS de la boîte (la caméra tournera autour d\'un point extérieur au sujet)'}`);
  }

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
