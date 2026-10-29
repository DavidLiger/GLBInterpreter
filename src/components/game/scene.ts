// Scène Three.js du mini-jeu (MJ2, spec-mini-jeu.md §3 « Chargement », « Entités », « Caméra ») : GLB de `game/` lus avec
// les décodeurs du lecteur (Meshopt, KTX2 : `lib/gltfDecoders.ts`), noms de nœuds par `userData.name` (`lib/nodeNames.ts`).
//
// - Arène : `COL_*` → triangles en coordonnées monde pour Rapier (non dessinés) ; `SPAWN_player`, `SPAWN_prey_*` → points
//   d'apparition ; `FADE_*` → décor rendu transparent entre la caméra et le joueur. Le maillage d'un `COL_*` ou d'un
//   `FADE_*` est cherché dans **tout le sous-arbre** du nœud nommé : `meshopt` (`quantize`) peut le déplacer sur un enfant
//   sans nom (constat de MJ1).
// - Entités : un clone par personnage (`SkeletonUtils.clone` : géométrie partagée, squelette propre), un mixer chacun, une
//   action par rôle de clip ; fondu de 0,2 s d'un rôle à l'autre. Les proies ont leurs propres matériaux (fondu de
//   disparition).
// - Caméra plongeante (DP-16) : environ 50° au-dessus de l'horizon, tournée vers −Z, distance éditoriale
//   (`camera.distance`), suivi amorti du joueur.
// - Libération : géométries, matériaux, textures, mixers, décodeurs.
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createGLTFLoader, type GLTFLoaderWithDecoders } from "@/components/diorama/lib/gltfDecoders";
import { addFallbackLightsIfNone } from "@/components/diorama/lib/fallbackLights";
import { originalNodeName } from "@/components/diorama/lib/nodeNames";
import type { ReaderGame, ReaderGameEntity, ClipRoleName } from "./gameSource";
import type { ArenaDesc, CapsuleDef, Vec3 } from "./world";
import type { Actor, ClipRole } from "./poursuite";

/** Angle de la caméra au-dessus de l'horizon (DP-16). */
export const CAMERA_PITCH = (50 * Math.PI) / 180;
/** Hauteur visée au-dessus des pieds du joueur (m). */
export const CAMERA_AIM_Y = 0.8;
/** Amortissement du suivi (1/s). */
export const CAMERA_FOLLOW = 5;
const CROSSFADE_S = 0.2;
const FADE_OPACITY = 0.3;

const NODE = { spawnPlayer: "SPAWN_player", spawnPrey: "SPAWN_prey_", collider: "COL_", floor: "COL_sol", fade: "FADE_", colliderEmpty: "COLLIDER" };

/**
 * Copie d'un matériau qui pourra s'estomper (décor `FADE_*`, proie qui disparaît) : transparente dès le départ, opacité 1.
 * three.js compile le shader d'un matériau opaque avec l'alpha forcé à 1 : passer `transparent` à vrai en cours de partie
 * resterait sans effet (sans recompilation, qui ferait un à-coup). Seules l'opacité et l'écriture de profondeur changent.
 */
export function fadeableClone(mat: THREE.Material): THREE.Material {
  const m = mat.clone();
  m.transparent = true;
  m.opacity = 1;
  m.depthWrite = true;
  return m;
}

/** Maillages d'un nœud et de tout son sous-arbre. */
export function meshesUnder(node: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  node.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

/** Triangles en coordonnées monde des maillages donnés (matrices monde à jour). */
export function worldTriangles(meshes: THREE.Mesh[]): { vertices: Float32Array; indices: Uint32Array } {
  let vCount = 0;
  let iCount = 0;
  for (const m of meshes) {
    const pos = m.geometry.getAttribute("position");
    if (!pos) continue;
    vCount += pos.count;
    iCount += m.geometry.index ? m.geometry.index.count : pos.count;
  }
  const vertices = new Float32Array(vCount * 3);
  const indices = new Uint32Array(iCount);
  const v = new THREE.Vector3();
  let vo = 0;
  let io = 0;
  for (const m of meshes) {
    const pos = m.geometry.getAttribute("position");
    if (!pos) continue;
    const base = vo / 3;
    for (let i = 0; i < pos.count; i++) {
      // `fromBufferAttribute` lit aussi les positions quantifiées (normalisées) par meshopt.
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      vertices[vo++] = v.x;
      vertices[vo++] = v.y;
      vertices[vo++] = v.z;
    }
    const idx = m.geometry.index;
    if (idx) for (let i = 0; i < idx.count; i++) indices[io++] = base + idx.getX(i);
    else for (let i = 0; i < pos.count; i++) indices[io++] = base + i;
  }
  return { vertices, indices };
}

/** Arène lue dans la scène d'un GLB (matrices monde mises à jour ici). Lève une erreur si un nœud obligatoire manque. */
export function readArena(root: THREE.Object3D): { desc: ArenaDesc; colliderNodes: THREE.Object3D[]; fadeMeshes: THREE.Mesh[] } {
  root.updateMatrixWorld(true);
  const colliders: ArenaDesc["colliders"] = [];
  const colliderNodes: THREE.Object3D[] = [];
  const fadeMeshes: THREE.Mesh[] = [];
  let floorBox: THREE.Box3 | null = null;
  let spawnPlayer: (Vec3 & { yaw: number }) | null = null;
  const spawnPreys: { name: string; at: Vec3 }[] = [];
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  // Nœuds nommés seulement (un enfant sans nom créé par meshopt n'est pas un collisionneur à lui seul).
  const named: THREE.Object3D[] = [];
  root.traverse((o) => named.push(o));
  const taken = new Set<THREE.Object3D>();
  for (const o of named) {
    const name = originalNodeName(o);
    if (!name || taken.has(o)) continue;
    if (name.startsWith(NODE.collider)) {
      const meshes = meshesUnder(o);
      meshes.forEach((m) => taken.add(m));
      colliderNodes.push(o);
      const tri = worldTriangles(meshes);
      colliders.push({ name, ...tri });
      if (name === NODE.floor && meshes.length) {
        floorBox = new THREE.Box3();
        for (const m of meshes) floorBox.expandByObject(m);
      }
    } else if (name.startsWith(NODE.fade)) {
      for (const m of meshesUnder(o)) {
        if (taken.has(m)) continue;
        taken.add(m);
        fadeMeshes.push(m);
      }
    } else if (name === NODE.spawnPlayer && !spawnPlayer) {
      o.matrixWorld.decompose(p, q, s);
      fwd.set(0, 0, 1).applyQuaternion(q);
      spawnPlayer = { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(fwd.x, fwd.z) };
    } else if (name.startsWith(NODE.spawnPrey)) {
      o.getWorldPosition(p);
      spawnPreys.push({ name, at: { x: p.x, y: p.y, z: p.z } });
    }
  }
  if (!floorBox || floorBox.isEmpty()) throw new Error("game/arena.glb : COL_sol absent ou sans maillage");
  const fb = floorBox as THREE.Box3;
  if (!spawnPlayer) throw new Error("game/arena.glb : SPAWN_player absent");
  spawnPreys.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  return {
    desc: {
      colliders,
      floor: { min: { x: fb.min.x, y: fb.min.y, z: fb.min.z }, max: { x: fb.max.x, y: fb.max.y, z: fb.max.z } },
      spawnPlayer,
      spawnPreys: spawnPreys.map((sp) => sp.at),
    },
    colliderNodes,
    fadeMeshes,
  };
}

/** Capsule d'une entité : centre sur l'empty `COLLIDER` déclaré, sinon à mi-hauteur au-dessus des pieds. */
export function capsuleOf(entity: ReaderGameEntity, root: THREE.Object3D | null): CapsuleDef {
  const { radius, height } = entity.capsule;
  if (entity.collider && root) {
    let node: THREE.Object3D | undefined;
    root.traverse((o) => {
      if (!node && originalNodeName(o) === entity.collider) node = o;
    });
    if (node) {
      root.updateMatrixWorld(true);
      const p = new THREE.Vector3();
      (node as THREE.Object3D).getWorldPosition(p);
      return { radius, height, center: { x: p.x, y: p.y, z: p.z } };
    }
  }
  return { radius, height, center: { x: 0, y: height / 2, z: 0 } };
}

interface EntityAsset {
  entity: ReaderGameEntity;
  gltf: GLTF;
  clips: Partial<Record<ClipRoleName, THREE.AnimationClip>>;
  capsule: CapsuleDef;
}

/** Personnage dessiné : clone, mixer, actions par rôle de clip. */
export class ActorView {
  readonly root: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  private readonly actions: Partial<Record<ClipRole, THREE.AnimationAction>> = {};
  private current: ClipRole | null = null;
  private generation = -1;
  private readonly materials: THREE.Material[] = [];
  private opacity = 1;

  constructor(asset: EntityAsset, ownMaterials: boolean) {
    this.root = cloneSkinned(asset.gltf.scene);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.frustumCulled = false; // maillage skinné : boîte du repos, pas de la pose
      if (ownMaterials && m.isMesh) {
        const list = Array.isArray(m.material) ? m.material : [m.material];
        const clones = list.map(fadeableClone);
        this.materials.push(...clones);
        m.material = Array.isArray(m.material) ? clones : clones[0];
      }
    });
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const [role, clip] of Object.entries(asset.clips) as [ClipRoleName, THREE.AnimationClip][]) {
      const a = this.mixer.clipAction(clip);
      if (role === "caught" || role === "attack") {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[role] = a;
    }
    // Proie sans `flee` : `run` pour la fuite (spec §4).
    if (!this.actions.flee && this.actions.run) this.actions.flee = this.actions.run;
    if (!this.actions.run && this.actions.flee) this.actions.run = this.actions.flee;
    this.play("idle");
  }

  private play(role: ClipRole): void {
    const next = this.actions[role] ?? this.actions.idle;
    const prev = this.current ? this.actions[this.current] : undefined;
    this.current = role;
    if (!next || next === prev) {
      if (next && (role === "attack" || role === "caught")) next.reset().play();
      return;
    }
    next.reset().setEffectiveWeight(1).play();
    if (prev) prev.crossFadeTo(next, CROSSFADE_S, false);
  }

  /** Recopie de l'état de la simulation (position interpolée `alpha`), puis mixer avancé de `dt`. */
  sync(actor: Actor, alpha: number, dt: number, animate: boolean): void {
    const c = actor.char;
    if (actor.generation !== this.generation) {
      this.generation = actor.generation;
      this.current = null;
      this.mixer.stopAllAction();
      this.play(actor.clip);
    } else if (actor.clip !== this.current) this.play(actor.clip);
    this.root.visible = actor.visible && actor.opacity > 0.001;
    this.root.position.set(c.prev.x + (c.pos.x - c.prev.x) * alpha, c.prev.y + (c.pos.y - c.prev.y) * alpha, c.prev.z + (c.pos.z - c.prev.z) * alpha);
    let d = c.yaw - c.prevYaw;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    this.root.rotation.set(0, c.prevYaw + d * alpha, 0);
    if (this.materials.length && actor.opacity !== this.opacity) {
      this.opacity = actor.opacity;
      for (const m of this.materials) {
        m.opacity = actor.opacity;
        m.depthWrite = actor.opacity >= 1;
      }
    }
    if (animate) this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    for (const m of this.materials) m.dispose();
    this.root.removeFromParent();
  }
}

export interface GameAssets {
  arena: GLTF;
  arenaDesc: ArenaDesc;
  fadeMeshes: THREE.Mesh[];
  entities: Map<string, EntityAsset>;
}

/** Lecture des GLB du jeu (arène et entités) avec les décodeurs du lecteur. */
export async function loadGameAssets(renderer: THREE.WebGLRenderer, game: ReaderGame): Promise<{ assets: GameAssets; decoders: GLTFLoaderWithDecoders }> {
  const decoders = createGLTFLoader(renderer);
  try {
    const load = (url: string) => decoders.loader.loadAsync(url) as Promise<GLTF>;
    const [arena, ...glbs] = await Promise.all([load(game.files.arena), ...game.entities.map((e) => load(game.files.entities[e.id]))]);
    const { desc, colliderNodes, fadeMeshes } = readArena(arena.scene);
    for (const n of colliderNodes) n.visible = false; // collisionneurs non dessinés
    const entities = new Map<string, EntityAsset>();
    game.entities.forEach((e, i) => {
      const gltf = glbs[i];
      const clips: EntityAsset["clips"] = {};
      for (const [role, name] of Object.entries(e.clips) as [ClipRoleName, string][]) {
        const clip = gltf.animations.find((a) => a.name === name);
        if (clip) clips[role] = clip;
        else console.warn(`[JEU] game/${e.id}.glb : clip « ${name} » (${role}) introuvable`);
      }
      entities.set(e.id, { entity: e, gltf, clips, capsule: capsuleOf(e, gltf.scene) });
    });
    return { assets: { arena, arenaDesc: desc, fadeMeshes, entities }, decoders };
  } catch (e) {
    decoders.dispose();
    throw e;
  }
}

/** Décor `FADE_*` : matériaux propres, rendus transparents quand ils coupent la ligne caméra → joueur. */
class FadeSet {
  private readonly items: { mesh: THREE.Mesh; materials: THREE.Material[]; opacity: number }[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];
  private readonly dir = new THREE.Vector3();
  private readonly meshes: THREE.Mesh[];

  constructor(meshes: THREE.Mesh[]) {
    this.meshes = meshes;
    for (const mesh of meshes) {
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const clones = list.map(fadeableClone);
      mesh.material = Array.isArray(mesh.material) ? clones : clones[0];
      this.items.push({ mesh, materials: clones, opacity: 1 });
    }
  }

  /** Vrai si au moins un décor `FADE_*` est actuellement transparent (tests, débogage). */
  faded = 0;

  update(camera: THREE.Camera, target: THREE.Vector3, dt: number): void {
    if (!this.items.length) return;
    this.dir.subVectors(target, camera.position);
    const far = this.dir.length();
    this.raycaster.set(camera.position, this.dir.normalize());
    this.raycaster.far = far;
    this.hits.length = 0;
    this.raycaster.intersectObjects(this.meshes, false, this.hits);
    const k = 1 - Math.exp(-dt * 10);
    this.faded = 0;
    for (const it of this.items) {
      const hit = this.hits.some((h) => h.object === it.mesh);
      const goal = hit ? FADE_OPACITY : 1;
      it.opacity += (goal - it.opacity) * k;
      if (Math.abs(goal - it.opacity) < 0.01) it.opacity = goal;
      if (it.opacity < 0.999) this.faded++;
      for (const m of it.materials) {
        m.opacity = it.opacity;
        m.depthWrite = it.opacity >= 0.999;
      }
    }
  }

  dispose(): void {
    for (const it of this.items) for (const m of it.materials) m.dispose();
  }
}

/** Scène dessinée d'une entrée dans le jeu : arène, personnages, caméra, décor estompé. */
export class GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  readonly assets: GameAssets;
  private readonly fade: FadeSet;
  private views: ActorView[] = [];
  private readonly aim = new THREE.Vector3();
  private readonly goal = new THREE.Vector3();
  private readonly distance: number;
  private placed = false;

  constructor(assets: GameAssets, cameraDistance: number) {
    this.assets = assets;
    this.distance = cameraDistance;
    this.scene.background = new THREE.Color(0x87b5d9);
    this.scene.add(assets.arena.scene);
    const box = new THREE.Box3().setFromObject(assets.arena.scene);
    const radius = box.isEmpty() ? 20 : box.getBoundingSphere(new THREE.Sphere()).radius;
    addFallbackLightsIfNone(this.scene, radius, "jeu");
    this.fade = new FadeSet(assets.fadeMeshes);
  }

  get fadedCount(): number {
    return this.fade.faded;
  }

  /** Personnages dessinés pour une partie : un par acteur de la simulation (les anciens sont libérés). */
  setActors(actors: Actor[]): void {
    for (const v of this.views) v.dispose();
    this.views = actors.map((a) => {
      const asset = this.assets.entities.get(a.entity);
      if (!asset) throw new Error(`jeu : entité « ${a.entity} » non chargée`);
      const v = new ActorView(asset, asset.entity.role === "prey");
      this.scene.add(v.root);
      return v;
    });
    this.placed = false;
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  /** Image : personnages (interpolés), caméra qui suit le joueur (`actors[0]`), décor estompé. */
  update(actors: Actor[], alpha: number, dt: number, animate: boolean): void {
    for (let i = 0; i < this.views.length; i++) this.views[i].sync(actors[i], alpha, dt, animate);
    const player = this.views[0]?.root;
    if (!player) return;
    this.goal.set(player.position.x, player.position.y + CAMERA_AIM_Y, player.position.z);
    if (!this.placed) {
      this.aim.copy(this.goal);
      this.placed = true;
    } else this.aim.lerp(this.goal, 1 - Math.exp(-dt * CAMERA_FOLLOW));
    const d = this.distance;
    this.camera.position.set(this.aim.x, this.aim.y + d * Math.sin(CAMERA_PITCH), this.aim.z + d * Math.cos(CAMERA_PITCH));
    this.camera.lookAt(this.aim);
    this.fade.update(this.camera, this.goal, dt);
  }

  /** Libération GPU et mixers (sortie du jeu). */
  dispose(): void {
    for (const v of this.views) v.dispose();
    this.views = [];
    this.fade.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const roots = [this.assets.arena.scene, ...[...this.assets.entities.values()].map((e) => e.gltf.scene)];
    for (const root of roots) {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        geometries.add(m.geometry);
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) materials.add(mat);
      });
    }
    for (const g of geometries) g.dispose();
    for (const mat of materials) {
      for (const v of Object.values(mat as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
    this.scene.clear();
  }
}
