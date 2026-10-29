// Monde physique du mini-jeu (MJ2, spec-mini-jeu.md §3 « Monde », « Collisionneurs », « Entités ») : tronc commun, sans
// Three.js ni DOM, pour tourner aussi sous Node (`npm run test:engine`, déterministe à pas fixe, §14).
//
// - Arène : chaque `COL_*` devient un collisionneur fixe trimesh (sommets déjà en coordonnées monde, fournis par la
//   lecture du GLB, `scene.ts`) ; les limites de l'aire de jeu sont quatre murs invisibles posés sur les bords de `COL_sol`
//   (précision de MJ2 : la spec ne dit pas comment les tracer ; un sol sans murs laisserait tomber les personnages).
// - Personnages : un corps cinématique (position imposée) et une capsule par entité ; **un seul contrôleur cinématique**
//   pour toutes les entités (décision du 28/10) ; gravité appliquée à la main, collage au sol, marches et pentes.
//   Les personnages ne se bloquent pas entre eux (filtre `EXCLUDE_KINEMATIC`) : le contrôleur ne voit que l'arène, ce qui
//   coûte moins cher (le contrôleur fait 90 % du pas, §14) et ne coince jamais une proie contre une autre ; la capture se
//   juge à la distance (`poursuite.ts`).
// - Pas fixe de 1/60 s ; rattrapage limité à `MAX_STEPS_PER_FRAME` pas par image, le temps en trop abandonné
//   (`planSteps`, recommandation de MJ0 : un à-coup du Poco F3 appelait jusqu'à 4 pas).
// - Pas d'allocation de notre fait par pas : vecteurs et rayon réutilisés ; les objets rendus par les liaisons de Rapier
//   (résultat d'un rayon) restent hors de notre main.
import type { Rapier } from "./rapier";
import type * as R from "@dimforge/rapier3d-compat";

/** Pas fixe de la physique (s). */
export const STEP = 1 / 60;
/** Pas de rattrapage au plus par image (2 ou 3, décision du 28/10). */
export const MAX_STEPS_PER_FRAME = 3;
/** Écart d'une image au plus pris en compte (page restée figée) : au-delà, le temps est abandonné. */
export const MAX_FRAME_DT = 0.25;
export const GRAVITY = 9.81;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Pas à exécuter pour une image de `dt` secondes : `acc` est le temps accumulé non encore simulé. Au plus `max` pas ; le
 * temps qui dépasse est abandonné (`dropped`), seul le reste d'un pas (< `step`) est gardé pour l'image suivante.
 */
export function planSteps(acc: number, dt: number, step = STEP, max = MAX_STEPS_PER_FRAME): { steps: number; acc: number; dropped: number } {
  const d = Math.max(dt, 0);
  let a = acc + Math.min(d, MAX_FRAME_DT);
  let dropped = d > MAX_FRAME_DT ? d - MAX_FRAME_DT : 0;
  // Petite marge : 1/60 accumulé 60 fois ne fait pas exactement 1 en virgule flottante.
  let steps = Math.floor((a + 1e-9) / step);
  if (steps > max) {
    dropped += (steps - max) * step;
    a -= (steps - max) * step;
    steps = max;
  }
  return { steps, acc: Math.max(0, a - steps * step), dropped };
}

/** Arène lue du GLB (`scene.ts`) : coordonnées monde. */
export interface ArenaDesc {
  /** Collisionneurs `COL_*` (sommets monde, triangles indexés). */
  colliders: { name: string; vertices: Float32Array; indices: Uint32Array }[];
  /** Boîte englobante de `COL_sol` : aire de jeu. */
  floor: { min: Vec3; max: Vec3 };
  spawnPlayer: Vec3 & { yaw: number };
  spawnPreys: Vec3[];
}

/** Capsule d'une entité (couche 3D) et centre de la capsule par rapport aux pieds (origine de l'entité, ou empty `COLLIDER`). */
export interface CapsuleDef {
  radius: number;
  height: number;
  center: Vec3;
}

/** Personnage physique : position des pieds (origine de l'entité) et orientation (lacet, 0 = face à +Z, convention glTF). */
export interface Character {
  readonly capsule: CapsuleDef;
  readonly body: R.RigidBody;
  readonly collider: R.Collider;
  /** Pieds, après le dernier pas. */
  pos: Vec3;
  /** Pieds, avant le dernier pas (interpolation du rendu). */
  prev: Vec3;
  yaw: number;
  prevYaw: number;
  /** Vitesse verticale (gravité). */
  vy: number;
  grounded: boolean;
  /** Déplacement horizontal réel du dernier pas (m), pour repérer un personnage coincé. */
  moved: number;
}

const WALL_HEIGHT = 20;
/**
 * Hauteur ajoutée à un point d'apparition (m) : un personnage posé exactement sur le sol (points d'apparition à la hauteur
 * du sol dans Blender) démarre en contact, et le contrôleur cinématique le bloque ; il tombe de 5 cm au premier pas.
 */
export const SPAWN_LIFT = 0.05;
const WALL_THICKNESS = 1;

export class GameWorld {
  readonly R: Rapier;
  readonly world: R.World;
  readonly arena: ArenaDesc;
  private readonly controller: R.KinematicCharacterController;
  private readonly characters: Character[] = [];
  private readonly desired: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly movement: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly ray: R.Ray;
  private readonly filterFlags: number;
  private freed = false;
  /** Pas exécutés depuis la création (mesure, tests). */
  steps = 0;

  constructor(Rapier: Rapier, arena: ArenaDesc) {
    this.R = Rapier;
    this.arena = arena;
    this.world = new Rapier.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = STEP;
    for (const c of arena.colliders) {
      if (!c.vertices.length || !c.indices.length) continue;
      this.world.createCollider(Rapier.ColliderDesc.trimesh(c.vertices, c.indices));
    }
    // Limites de l'aire de jeu : quatre murs sur les bords de COL_sol.
    const { min, max } = arena.floor;
    const cx = (min.x + max.x) / 2;
    const cz = (min.z + max.z) / 2;
    const hx = (max.x - min.x) / 2;
    const hz = (max.z - min.z) / 2;
    const y = min.y + WALL_HEIGHT / 2 - 1;
    const t = WALL_THICKNESS / 2;
    const wall = (x: number, z: number, wx: number, wz: number) =>
      this.world.createCollider(Rapier.ColliderDesc.cuboid(wx, WALL_HEIGHT / 2, wz).setTranslation(x, y, z));
    wall(cx, min.z - t, hx + 2 * t, t);
    wall(cx, max.z + t, hx + 2 * t, t);
    wall(min.x - t, cz, t, hz + 2 * t);
    wall(max.x + t, cz, t, hz + 2 * t);
    // Un seul contrôleur cinématique pour toutes les entités.
    const ctl = this.world.createCharacterController(0.02);
    ctl.setUp({ x: 0, y: 1, z: 0 });
    ctl.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    ctl.setMinSlopeSlideAngle((50 * Math.PI) / 180);
    ctl.enableAutostep(0.3, 0.2, false);
    ctl.enableSnapToGround(0.3);
    ctl.setApplyImpulsesToDynamicBodies(false);
    this.controller = ctl;
    this.ray = new Rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    this.filterFlags = Rapier.QueryFilterFlags.EXCLUDE_KINEMATIC;
  }

  /** Personnage posé pieds en `at` (copie), orienté selon `yaw`. */
  addCharacter(capsule: CapsuleDef, at: Vec3, yaw = 0): Character {
    const R_ = this.R;
    const y = at.y + SPAWN_LIFT;
    const body = this.world.createRigidBody(R_.RigidBodyDesc.kinematicPositionBased().setTranslation(at.x, y, at.z));
    const half = Math.max(0, capsule.height / 2 - capsule.radius);
    const collider = this.world.createCollider(
      R_.ColliderDesc.capsule(half, capsule.radius).setTranslation(capsule.center.x, capsule.center.y, capsule.center.z),
      body,
    );
    const c: Character = { capsule, body, collider, pos: { x: at.x, y, z: at.z }, prev: { x: at.x, y, z: at.z }, yaw, prevYaw: yaw, vy: 0, grounded: false, moved: 0 };
    this.characters.push(c);
    return c;
  }

  /** Téléportation (réapparition) : sans interpolation depuis l'ancienne place. */
  teleport(c: Character, at: Vec3, yaw = c.yaw): void {
    c.pos.x = c.prev.x = at.x;
    c.pos.y = c.prev.y = at.y + SPAWN_LIFT;
    c.pos.z = c.prev.z = at.z;
    c.yaw = c.prevYaw = yaw;
    c.vy = 0;
    c.moved = 0;
    c.grounded = false;
    c.body.setNextKinematicTranslation(c.pos);
    c.body.setTranslation(c.pos, true);
  }

  /** Début d'un pas : positions d'avant gardées pour l'interpolation du rendu. */
  beginStep(): void {
    for (const c of this.characters) {
      c.prev.x = c.pos.x;
      c.prev.y = c.pos.y;
      c.prev.z = c.pos.z;
      c.prevYaw = c.yaw;
    }
  }

  /**
   * Déplacement horizontal voulu (`dx`, `dz`, en mètres pour ce pas) par le contrôleur cinématique, gravité comprise. Le
   * corps reçoit sa position du pas suivant (appliquée par `step`).
   */
  move(c: Character, dx: number, dz: number, dt = STEP): void {
    c.vy = c.grounded ? -1 : Math.max(-30, c.vy - GRAVITY * dt);
    const d = this.desired;
    d.x = dx;
    d.y = c.vy * dt;
    d.z = dz;
    this.controller.computeColliderMovement(c.collider, d, this.filterFlags);
    const m = this.controller.computedMovement(this.movement as R.Vector) as Vec3;
    c.grounded = this.controller.computedGrounded();
    if (c.grounded && c.vy < 0) c.vy = 0;
    c.pos.x += m.x;
    c.pos.y += m.y;
    c.pos.z += m.z;
    c.moved = Math.hypot(m.x, m.z);
    c.body.setNextKinematicTranslation(c.pos);
  }

  /**
   * Distance libre (m) d'un rayon horizontal partant de `origin` dans la direction (`dx`, `dz`) normée, contre l'arène
   * seule (personnages exclus), jusqu'à `maxDist` ; `maxDist` si rien n'est touché.
   */
  freeDistance(origin: Vec3, dx: number, dz: number, maxDist: number): number {
    const r = this.ray;
    r.origin.x = origin.x;
    r.origin.y = origin.y;
    r.origin.z = origin.z;
    r.dir.x = dx;
    r.dir.y = 0;
    r.dir.z = dz;
    const hit = this.world.castRay(r, maxDist, true, this.filterFlags);
    return hit ? hit.timeOfImpact : maxDist;
  }

  /** Un pas de la physique (positions des corps cinématiques appliquées). */
  step(): void {
    this.world.step();
    this.steps++;
  }

  /** Libération du monde et du contrôleur (sortie du jeu). Idempotent. */
  free(): void {
    if (this.freed) return;
    this.freed = true;
    this.world.removeCharacterController(this.controller);
    this.characters.length = 0;
    this.world.free();
  }

  get isFreed(): boolean {
    return this.freed;
  }
}
