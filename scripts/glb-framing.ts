// scripts/glb-framing.ts — diagnostic du cadrage et de l'éclairage d'un GLB (Î10b), sans navigateur.
//
//   npx tsx scripts/glb-framing.ts <scenes/<id>.glb> [<scenes/<id>.edit.json>]
//
// Affiche : nœuds racines (translation, rotation en degrés d'Euler XYZ, échelle) ; boîte englobante monde des maillages
// (**skinning appliqué** comme au rendu : un maillage skinné est placé par ses os, pas par son nœud), en pose de repos et en
// pose `idle` (première image, celle qu'affiche le lecteur au chargement et sur laquelle il mesure son rayon) ; rayon de la sphère englobante ; cible caméra de GLBI_ROOT (position monde) ; lampes
// KHR_lights_punctual (type, intensité) ; cadrage que posera le lecteur (`lib/orbitFraming.ts`), avec le cadrage de
// `edit.json` s'il est donné, sinon les valeurs par défaut. Sert à écarter un modèle couché, à une autre échelle, ou une
// cible mal placée. Contrôle aussi les poids de skinning (somme différente de 1, sommets sans os, influences au-delà de 4) :
// un sommet dont les poids ne font pas 1 est tiré vers l'origine au rendu (pointes vers le sol). À lancer sur le GLB source
// et sur le GLB optimisé (`public/dev-book/scenes/<id>.glb` ou `out/scenes/<id>.glb`) pour savoir où le défaut apparaît.
import fs from 'node:fs';
import type { Document as GDocument, Node as GNode, Scene as GScene } from '@gltf-transform/core';
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

/**
 * Applique aux nœuds la première image du clip `name` (translation, rotation, échelle), comme `mixer.update(0)` dans le
 * lecteur. Renvoie faux si le clip n'existe pas.
 */
function applyFirstFrame(doc: GDocument, name: string): boolean {
  const anim = doc.getRoot().listAnimations().find((a) => a.getName() === name);
  if (!anim) return false;
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode();
    const sampler = ch.getSampler();
    const out = sampler?.getOutput();
    if (!node || !sampler || !out) continue;
    const idx = sampler.getInterpolation() === 'CUBICSPLINE' ? 1 : 0; // tangente d'entrée, valeur, tangente de sortie
    const path = ch.getTargetPath();
    if (path === 'translation') node.setTranslation(out.getElement(idx, [0, 0, 0]) as [number, number, number]);
    else if (path === 'rotation') node.setRotation(out.getElement(idx, [0, 0, 0, 1]) as [number, number, number, number]);
    else if (path === 'scale') node.setScale(out.getElement(idx, [1, 1, 1]) as [number, number, number]);
  }
  return true;
}

/** Poids de skinning : sommets dont la somme s'écarte de 1, sommets sans influence, jeux d'influences au-delà de 4. */
function checkSkinWeights(scene: GScene): void {
  const nodes: GNode[] = [];
  scene.traverse((n) => {
    nodes.push(n);
  });
  let any = false;
  for (const node of nodes) {
    const mesh = node.getMesh();
    const skin = node.getSkin();
    if (!mesh || !skin) continue;
    any = true;
    const jointCount = skin.listJoints().length;
    let vertices = 0;
    let off = 0;
    let zero = 0;
    let badJoint = 0;
    let minSum = Infinity;
    let maxSum = -Infinity;
    const extraSets = new Set<string>();
    for (const prim of mesh.listPrimitives()) {
      const sets: [string, string][] = [];
      for (let k = 0; prim.getAttribute(`WEIGHTS_${k}`); k++) {
        sets.push([`JOINTS_${k}`, `WEIGHTS_${k}`]);
        if (k > 0) extraSets.add(`WEIGHTS_${k}`);
      }
      const pos = prim.getAttribute('POSITION');
      if (!pos || !sets.length) continue;
      const j = [0, 0, 0, 0];
      const w = [0, 0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        let sum = 0;
        for (const [ja, wa] of sets) {
          prim.getAttribute(wa)!.getElement(i, w);
          prim.getAttribute(ja)?.getElement(i, j);
          for (let c = 0; c < 4; c++) {
            sum += w[c];
            if (w[c] > 0 && j[c] >= jointCount) badJoint++;
          }
        }
        vertices++;
        minSum = Math.min(minSum, sum);
        maxSum = Math.max(maxSum, sum);
        if (sum === 0) zero++;
        else if (Math.abs(sum - 1) > 0.01) off++;
      }
    }
    console.log(
      `  ${node.getName()} : ${vertices} sommets, ${jointCount} os ; somme des poids de ${minSum.toFixed(3)} à ${maxSum.toFixed(3)} ; ` +
        `${off} sommet(s) à somme ≠ 1 (écart > 1 %), ${zero} sans os${badJoint ? `, ${badJoint} influence(s) vers un os inexistant` : ''}` +
        `${extraSets.size ? ` ; plus de 4 influences (${[...extraSets].join(', ')}), lues par three seulement pour les 4 premières` : ''}`,
    );
    if (off || zero || badJoint) console.log('    → ces sommets sont tirés vers l\'origine au rendu (pointes)');
  }
  if (!any) console.log('  aucun maillage skinné');
}

function describeBox(label: string, box: THREE.Box3): number {
  const size = box.getSize(new THREE.Vector3()).toArray();
  const radius = box.isEmpty() ? 1 : box.getBoundingSphere(new THREE.Sphere()).radius;
  console.log(`Boîte englobante monde, ${label} (glTF, Y en haut, face +Z) : min ${v3(box.min.toArray())}, max ${v3(box.max.toArray())}, taille ${v3(size)}`);
  console.log(`  rayon de la sphère englobante : ${radius.toFixed(3)}`);
  return radius;
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

  const glbiRoot = root.listNodes().find((n) => n.getName() === 'GLBI_ROOT');
  let targetName: string | undefined;
  let idleClip: string | undefined;
  try {
    const cfg = JSON.parse(String((glbiRoot?.getExtras() as { glbi_config?: string } | undefined)?.glbi_config ?? '{}'));
    targetName = cfg?.modules?.camera?.target;
    idleClip = cfg?.modules?.animations?.idle?.clip;
  } catch {
    console.log('GLBI_ROOT : glbi_config illisible');
  }
  const target: GNode | undefined = targetName ? root.listNodes().find((n) => n.getName() === targetName) : undefined;

  // Pose de repos, puis pose `idle` (première image) : c'est elle que mesure le lecteur
  const restBox = renderBounds(scene);
  describeBox('pose de repos', restBox);
  let box = restBox;
  let radius: number;
  if (idleClip && applyFirstFrame(doc, idleClip)) {
    box = renderBounds(scene);
    radius = describeBox(`pose « ${idleClip} » (première image, mesurée par le lecteur)`, box);
  } else {
    console.log(idleClip ? `  clip « ${idleClip} » absent : pose de repos seule` : '  pas de clip idle déclaré : pose de repos seule');
    radius = box.isEmpty() ? 1 : box.getBoundingSphere(new THREE.Sphere()).radius;
  }
  const size = box.getSize(new THREE.Vector3());
  if (size.y < Math.max(size.x, size.z) * 0.35) console.log('  note : boîte très plate en hauteur (modèle couché, ou sujet allongé)');

  const targetPos = new THREE.Vector3(...(target ? target.getWorldTranslation() : [0, 0, 0]));
  const center = box.getCenter(new THREE.Vector3());
  console.log(targetName ? `Cible caméra « ${targetName} » : ${target ? `position monde ${v3(targetPos.toArray())}, locale ${v3(target.getTranslation())}` : 'INTROUVABLE'}` : 'Pas de cible caméra dans GLBI_ROOT');
  if (target) {
    const inside = box.containsPoint(targetPos);
    console.log(`  centre de la boîte ${v3(center.toArray())} ; cible ${inside ? 'dans la boîte' : 'HORS de la boîte (la caméra tournera autour d\'un point extérieur au sujet)'}`);
  }

  console.log('Poids de skinning :');
  checkSkinWeights(scene);

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
