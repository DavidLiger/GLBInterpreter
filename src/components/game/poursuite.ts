// Gabarit « poursuite / capture » (MJ2, spec-mini-jeu.md §4, livre 1) : règles du jeu sur le monde physique du tronc
// commun (`world.ts`), sans Three.js ni DOM (`npm run test:engine`, déterministe : pas fixe, hasard à graine).
//
// - Joueur : marche ou course selon l'inclinaison (`WALK_BELOW`) ; « Bond » (premier et seul bouton du gabarit) : élan de
//   0,4 s à vitesse doublée (clip `attack`), puis recharge de 1 s (comptée à la fin du bond : précision de MJ2).
// - Proie, machine à états : **errance** (cible au hasard dans l'aire de jeu, clip `walk`, courtes haltes `idle`) →
//   **fuite** si le joueur est à moins du rayon de détection (direction opposée au joueur, trois rayons d'évitement contre
//   l'arène, clip `flee`, sinon `run`) → **capturée** si le joueur la touche pendant un bond (clip `caught` 1 s, puis
//   disparition en fondu de 0,5 s ; score augmenté) ; **coincée** (trois rayons bloqués, ou presque immobile) : changement
//   de direction pendant `CORNERED_S`.
// - Réapparition (`rules.respawn`) : la proie disparue revient au point d'apparition le plus éloigné du joueur (au moins le
//   rayon de détection si possible, et pas sur une autre proie), pour garder le nombre de proies.
// - Fin au chrono (`rules.duration`) : `over` vrai, événement `end`.
// « Bon enfant » : pas de dégâts ; la capture est une animation et un son.
import { GameWorld, STEP, type CapsuleDef, type Character, type Vec3 } from "./world";
import type { MoveVector } from "./input";

export type ClipRole = "idle" | "walk" | "run" | "attack" | "caught" | "flee";
export type PreyState = "wander" | "rest" | "flee" | "caught" | "fading" | "gone";

/** Boutons du gabarit, dans l'ordre (clavier : Espace ; manette : A). */
export const POURSUITE_BUTTONS = ["bond"] as const;

export const BOND_S = 0.4;
export const BOND_SPEED_FACTOR = 2;
export const BOND_COOLDOWN_S = 1;
/** Sous cette inclinaison : immobile ; sous `WALK_BELOW` : marche. */
export const MOVE_DEAD = 0.15;
export const WALK_BELOW = 0.6;
/** Vitesse de marche (fraction de la vitesse de course). */
export const WALK_FACTOR = 0.4;
/** Vitesse d'errance d'une proie (fraction de sa vitesse de fuite). */
export const WANDER_FACTOR = 0.35;
/** Marge de capture (m) en plus des deux rayons. */
export const CAPTURE_MARGIN = 0.35;
export const CAUGHT_S = 1;
export const FADE_S = 0.5;
/** Rotation vers la direction voulue (rad/s). */
export const TURN_RATE = 12;
/** Fin de fuite : joueur au-delà de ce multiple du rayon de détection. */
export const FLEE_EXIT = 1.4;
/** Angle des rayons latéraux d'évitement. */
export const AVOID_ANGLE = (35 * Math.PI) / 180;
export const CORNERED_S = 0.6;

export interface PoursuiteRules {
  duration: number;
  preys: { entity: string; count: number }[];
  playerSpeed: number;
  preySpeed: number;
  detectionRadius: number;
  points: number;
  respawn: boolean;
}

/** Entité du gabarit : identifiant, rôle, capsule (centre compris). */
export interface EntitySpec {
  id: string;
  role: "player" | "prey";
  capsule: CapsuleDef;
}

/** Options de partie (tests de navigateur et `test:engine`). */
export interface PoursuiteOptions {
  seed?: number;
  /** Durée de la partie (s), à la place de `rules.duration` (partie raccourcie des tests). */
  duration?: number;
  /** Proies immobiles (tests : capture par un bond sans poursuite). */
  preysStill?: boolean;
  /** Première proie posée en (x, z) au lieu de son point d'apparition (tests). */
  preyAt?: [number, number];
  /** Joueur posé en (x, z) au lieu de `SPAWN_player` (tests). */
  playerAt?: [number, number];
}

export interface StepInput {
  move: MoveVector;
  /** Boutons du gabarit appuyés pendant ce pas (front montant). */
  buttons: readonly boolean[];
}

export type GameEvent = "capture" | "jump" | "end";

export interface Actor {
  /** Identifiant de l'entité (fichier `game/<id>.glb`). */
  entity: string;
  char: Character;
  clip: ClipRole;
  /** Opacité du rendu (fondu de disparition). */
  opacity: number;
  visible: boolean;
  /** Incrémenté à chaque réapparition (le rendu repart du clip de départ). */
  generation: number;
}

export interface Prey extends Actor {
  state: PreyState;
  timer: number;
  target: { x: number; z: number };
  /** Direction gardée pendant que la proie est coincée. */
  dir: { x: number; z: number };
  cornered: number;
  slowFor: number;
}

/** Hasard à graine (mulberry32), pour une simulation reproductible. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const angleDelta = (from: number, to: number) => {
  let d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
};
/** Lacet d'une direction (x, z) : 0 = face à +Z (convention glTF). */
const yawOf = (x: number, z: number) => Math.atan2(x, z);

export class PoursuiteGame {
  readonly world: GameWorld;
  readonly rules: PoursuiteRules;
  readonly player: Actor;
  readonly preys: Prey[] = [];
  readonly duration: number;
  elapsed = 0;
  score = 0;
  over = false;
  bondTimer = 0;
  cooldown = 0;
  private bondDir = { x: 0, z: 1 };
  private readonly random: () => number;
  private readonly events: GameEvent[] = [];
  private readonly specs: Map<string, EntitySpec>;
  private readonly still: boolean;
  private readonly center: Vec3 = { x: 0, y: 0, z: 0 };
  /** Direction retenue par l'évitement (réutilisée : pas d'allocation par pas). */
  private readonly steer = { x: 0, z: 0 };

  constructor(world: GameWorld, entities: EntitySpec[], rules: PoursuiteRules, opts: PoursuiteOptions = {}) {
    this.world = world;
    this.rules = rules;
    this.duration = opts.duration ?? rules.duration;
    this.random = seededRandom(opts.seed ?? 1);
    this.still = !!opts.preysStill;
    this.specs = new Map(entities.map((e) => [e.id, e]));
    const playerSpec = entities.find((e) => e.role === "player");
    if (!playerSpec) throw new Error("jeu : aucune entité de rôle player");
    const arena = world.arena;
    const sp = opts.playerAt ? { ...arena.spawnPlayer, x: opts.playerAt[0], z: opts.playerAt[1] } : arena.spawnPlayer;
    this.player = { entity: playerSpec.id, char: world.addCharacter(playerSpec.capsule, sp, sp.yaw), clip: "idle", opacity: 1, visible: true, generation: 0 };
    // Proies : points d'apparition en tourniquet ; au-delà de leur nombre, décalées sur un cercle de 1,2 m.
    const spawns = arena.spawnPreys.length ? arena.spawnPreys : [{ x: sp.x + 5, y: sp.y, z: sp.z + 5 }];
    let k = 0;
    for (const line of rules.preys) {
      const spec = this.specs.get(line.entity);
      if (!spec || spec.role !== "prey") throw new Error(`jeu : proie « ${line.entity} » inconnue`);
      for (let i = 0; i < line.count; i++, k++) {
        const base = spawns[k % spawns.length];
        const ring = Math.floor(k / spawns.length);
        const a = (ring * 2.4) % (2 * Math.PI);
        const at = ring ? { x: base.x + 1.2 * Math.cos(a), y: base.y, z: base.z + 1.2 * Math.sin(a) } : { ...base };
        if (k === 0 && opts.preyAt) {
          at.x = opts.preyAt[0];
          at.z = opts.preyAt[1];
        }
        const char = world.addCharacter(spec.capsule, at, this.random() * 2 * Math.PI);
        const prey: Prey = {
          entity: spec.id, char, clip: "idle", opacity: 1, visible: true, generation: 0,
          state: "rest", timer: this.random() * 0.8, target: { x: at.x, z: at.z }, dir: { x: 0, z: 1 }, cornered: 0, slowFor: 0,
        };
        this.preys.push(prey);
      }
    }
  }

  /** Temps restant (s). */
  get remaining(): number {
    return Math.max(0, this.duration - this.elapsed);
  }

  /** Recharge du bond restante (s), 0 si le bond est disponible. */
  get bondReady(): boolean {
    return this.bondTimer <= 0 && this.cooldown <= 0;
  }

  /** Événements depuis la dernière lecture (sons, affichage). */
  drainEvents(): GameEvent[] {
    if (!this.events.length) return [];
    const out = this.events.slice();
    this.events.length = 0;
    return out;
  }

  /** Un pas fixe de la simulation. */
  step(input: StepInput, dt = STEP): void {
    if (this.over) return;
    this.world.beginStep();
    this.stepPlayer(input, dt);
    for (const p of this.preys) this.stepPrey(p, dt);
    this.world.step();
    this.elapsed += dt;
    if (this.elapsed >= this.duration - 1e-9) {
      this.elapsed = this.duration;
      this.over = true;
      this.events.push("end");
    }
  }

  // ────────────── Joueur ──────────────

  private stepPlayer(input: StepInput, dt: number): void {
    const p = this.player;
    const c = p.char;
    const speed = this.rules.playerSpeed;
    const mx = input.move.x;
    const mz = -input.move.y; // haut de l'écran = −Z (caméra plongeante tournée vers −Z)
    const m = Math.hypot(mx, mz);

    if (this.bondTimer <= 0 && this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (input.buttons[0] && this.bondReady) {
      this.bondTimer = BOND_S;
      if (m >= MOVE_DEAD) {
        this.bondDir.x = mx / m;
        this.bondDir.z = mz / m;
      } else {
        this.bondDir.x = Math.sin(c.yaw);
        this.bondDir.z = Math.cos(c.yaw);
      }
      c.yaw = yawOf(this.bondDir.x, this.bondDir.z);
      this.events.push("jump");
    }

    if (this.bondTimer > 0) {
      const v = BOND_SPEED_FACTOR * speed * dt;
      this.world.move(c, this.bondDir.x * v, this.bondDir.z * v, dt);
      p.clip = "attack";
      this.checkCaptures();
      this.bondTimer -= dt;
      if (this.bondTimer <= 1e-9) {
        this.bondTimer = 0;
        this.cooldown = BOND_COOLDOWN_S;
      }
      return;
    }

    if (m < MOVE_DEAD) {
      this.world.move(c, 0, 0, dt);
      p.clip = "idle";
      return;
    }
    const run = m >= WALK_BELOW;
    const v = (run ? speed : WALK_FACTOR * speed) * dt;
    const dx = mx / m;
    const dz = mz / m;
    this.turnToward(c, yawOf(dx, dz), dt);
    this.world.move(c, dx * v, dz * v, dt);
    p.clip = run ? "run" : "walk";
  }

  private turnToward(c: Character, yaw: number, dt: number): void {
    const d = angleDelta(c.yaw, yaw);
    const max = TURN_RATE * dt;
    c.yaw += Math.abs(d) <= max ? d : Math.sign(d) * max;
  }

  private checkCaptures(): void {
    const pc = this.player.char;
    for (const prey of this.preys) {
      if (prey.state === "caught" || prey.state === "fading" || prey.state === "gone") continue;
      const q = prey.char;
      const reach = pc.capsule.radius + q.capsule.radius + CAPTURE_MARGIN;
      if (Math.abs(pc.pos.y - q.pos.y) > 1.5) continue;
      if (Math.hypot(pc.pos.x - q.pos.x, pc.pos.z - q.pos.z) > reach) continue;
      prey.state = "caught";
      prey.timer = CAUGHT_S;
      prey.clip = "caught";
      q.collider.setEnabled(false);
      this.score += this.rules.points;
      this.events.push("capture");
    }
  }

  // ────────────── Proies ──────────────

  private stepPrey(p: Prey, dt: number): void {
    const c = p.char;
    switch (p.state) {
      case "caught":
        this.world.move(c, 0, 0, dt);
        p.timer -= dt;
        if (p.timer <= 0) {
          p.state = "fading";
          p.timer = FADE_S;
        }
        return;
      case "fading":
        p.timer -= dt;
        p.opacity = Math.max(0, p.timer / FADE_S);
        if (p.timer <= 0) this.disappear(p);
        return;
      case "gone":
        return;
    }
    if (this.still) {
      this.world.move(c, 0, 0, dt);
      p.clip = "idle";
      return;
    }
    const pc = this.player.char;
    const ax = c.pos.x - pc.pos.x;
    const az = c.pos.z - pc.pos.z;
    const dist = Math.hypot(ax, az);
    const R = this.rules.detectionRadius;
    if (p.state !== "flee" && dist < R) p.state = "flee";
    else if (p.state === "flee" && dist > R * FLEE_EXIT) this.newTarget(p);

    if (p.state === "rest") {
      this.world.move(c, 0, 0, dt);
      p.clip = "idle";
      p.timer -= dt;
      if (p.timer <= 0) this.newTarget(p);
      return;
    }

    let dx: number;
    let dz: number;
    let speed: number;
    if (p.state === "flee") {
      dx = dist > 1e-6 ? ax / dist : Math.sin(c.yaw);
      dz = dist > 1e-6 ? az / dist : Math.cos(c.yaw);
      speed = this.rules.preySpeed;
      p.clip = "flee";
    } else {
      const tx = p.target.x - c.pos.x;
      const tz = p.target.z - c.pos.z;
      const n = Math.hypot(tx, tz);
      p.timer -= dt;
      if (n < 0.5 || p.timer <= 0) {
        p.state = "rest";
        p.timer = 0.5 + this.random();
        this.world.move(c, 0, 0, dt);
        p.clip = "idle";
        return;
      }
      dx = tx / n;
      dz = tz / n;
      speed = Math.max(1, WANDER_FACTOR * this.rules.preySpeed);
      p.clip = "walk";
    }

    // Coincée : direction gardée un moment, sans rayons.
    if (p.cornered > 0) {
      p.cornered -= dt;
      dx = p.dir.x;
      dz = p.dir.z;
    } else {
      this.avoid(p, dx, dz, speed);
      dx = this.steer.x;
      dz = this.steer.z;
    }
    const v = speed * dt;
    this.turnToward(c, yawOf(dx, dz), dt);
    this.world.move(c, dx * v, dz * v, dt);
    // Presque immobile pendant 0,5 s malgré l'effort : coincée.
    if (c.moved < 0.25 * v) p.slowFor += dt;
    else p.slowFor = 0;
    if (p.slowFor >= 0.5 && p.cornered <= 0) {
      p.slowFor = 0;
      this.corner(p, dx, dz);
    }
  }

  /** Trois rayons d'évitement : devant, ±35° ; tous bloqués : coincée (direction changée). Résultat dans `steer`. */
  private avoid(p: Prey, dx: number, dz: number, speed: number): void {
    const s = this.steer;
    const c = p.char;
    const o = this.center;
    o.x = c.pos.x + c.capsule.center.x;
    o.y = c.pos.y + c.capsule.center.y;
    o.z = c.pos.z + c.capsule.center.z;
    const look = Math.max(1.5, 0.5 * speed) + c.capsule.radius;
    const front = this.world.freeDistance(o, dx, dz, look);
    if (front >= look) {
      s.x = dx;
      s.z = dz;
      return;
    }
    const cs = Math.cos(AVOID_ANGLE);
    const sn = Math.sin(AVOID_ANGLE);
    const lx = dx * cs - dz * sn;
    const lz = dx * sn + dz * cs;
    const rx = dx * cs + dz * sn;
    const rz = -dx * sn + dz * cs;
    const left = this.world.freeDistance(o, lx, lz, look);
    const right = this.world.freeDistance(o, rx, rz, look);
    if (left >= look || right >= look) {
      s.x = left >= right ? lx : rx;
      s.z = left >= right ? lz : rz;
      return;
    }
    this.corner(p, dx, dz, left >= right ? 1 : -1);
    s.x = p.dir.x;
    s.z = p.dir.z;
  }

  /** Coincée : direction tournée de 90° (côté le plus libre, sinon au hasard) pendant `CORNERED_S`. */
  private corner(p: Prey, dx: number, dz: number, side = this.random() < 0.5 ? 1 : -1): void {
    p.dir.x = -dz * side;
    p.dir.z = dx * side;
    p.cornered = CORNERED_S;
    if (p.state !== "flee") {
      p.target.x = p.char.pos.x + p.dir.x * 4;
      p.target.z = p.char.pos.z + p.dir.z * 4;
      p.timer = 3;
    }
  }

  private newTarget(p: Prey): void {
    const { min, max } = this.world.arena.floor;
    const margin = 1.5;
    const span = (lo: number, hi: number) => (hi - lo > 2 * margin ? lo + margin + this.random() * (hi - lo - 2 * margin) : (lo + hi) / 2);
    p.state = "wander";
    p.target.x = span(min.x, max.x);
    p.target.z = span(min.z, max.z);
    p.timer = 5;
  }

  /** Fin du fondu : la proie disparaît, puis réapparaît au point le plus éloigné du joueur si la règle le dit. */
  private disappear(p: Prey): void {
    p.state = "gone";
    p.visible = false;
    p.opacity = 0;
    if (!this.rules.respawn) return;
    const at = this.respawnPoint();
    this.world.teleport(p.char, at, this.random() * 2 * Math.PI);
    p.char.collider.setEnabled(true);
    p.state = "rest";
    p.timer = 0.3;
    p.clip = "idle";
    p.opacity = 1;
    p.visible = true;
    p.cornered = 0;
    p.slowFor = 0;
    p.generation++;
  }

  /**
   * Point d'apparition le plus éloigné du joueur parmi ceux qui sont à au moins le rayon de détection (tous s'il n'y en a
   * pas) et sans autre proie à moins de 1 m ; à défaut, le plus éloigné.
   */
  respawnPoint(): Vec3 {
    const pc = this.player.char.pos;
    const spawns = this.world.arena.spawnPreys.length ? this.world.arena.spawnPreys : [this.world.arena.spawnPlayer];
    const d = (s: Vec3) => Math.hypot(s.x - pc.x, s.z - pc.z);
    const sorted = spawns.slice().sort((a, b) => d(b) - d(a));
    const far = sorted.filter((s) => d(s) >= this.rules.detectionRadius);
    const pool = far.length ? far : sorted;
    const free = pool.find((s) => !this.preys.some((q) => q.state !== "gone" && Math.hypot(q.char.pos.x - s.x, q.char.pos.z - s.z) < 1));
    const s = free ?? pool[0];
    return { x: s.x, y: s.y, z: s.z };
  }
}
