// Caméra d'une scène v1 pendant les actions (AC2 ; DP-7 et DP-19, spec-actions-combinees.md §5 et §16).
//
// Exécutée à chaque image **après** la mise à jour du mixer (positions des empties à jour), avant `controls.update()` :
//
//   - cible suivie (DP-7, mode `free`) : si la position monde de l'empty `camera.target` a bougé depuis l'image précédente
//     (cible animée par un clip, ou parentée à un objet animé), `controls.target` et la caméra sont décalés du même vecteur.
//     Distance, angles, bornes et zoom restent relatifs à la cible ; l'enfant tourne et zoome comme avant. Cible immobile :
//     rien ne change (aucun décalage appliqué) ;
//   - empty de position (DP-19) : quand une action qui déclare `cameraPosition` prend la caméra (`setOwner`, annoncé par
//     le mode `buttons`), la vue courante est mémorisée (écart caméra − cible) et les OrbitControls verrouillés (ni
//     rotation, ni zoom, ni déplacement : `enabled` faux, sans amortissement ni bornes pendant le verrou) ; la caméra est
//     placée sur la position monde de l'empty et regarde la position monde de la cible, à chaque image.
//     Entrée en fondu : la caméra rejoint l'empty pendant le fondu d'entrée des poses (0,25 s, sans saut), puis le suit
//     exactement (`enter` puis `locked`). Au noir d'une coupe : d'un coup.
//     Sortie (fin, interruption, retour à `idle`) : retour en 0,5 s à la vue mémorisée, recalée sur la position actuelle de
//     la cible (mêmes angle et distance qu'avant l'action) ; au noir d'une coupe : d'un coup ; OrbitControls rendus ensuite
//     avec leurs réglages d'avant (`return` puis `free`). Interruption par une autre action à `cameraPosition` : passage
//     direct d'un empty à l'autre (même fondu que l'entrée), sans retour à la vue mémorisée, qui reste celle d'avant la
//     première action.
//
// Module pur (pas de DOM) : testé par `npm run test:engine`.
import * as THREE from "three";
import { BUTTONS_FADE } from "./buttonsPlayer";

/** Durée de l'entrée sur l'empty de position (fondu d'entrée des poses). */
export const CAMERA_ENTER_S = BUTTONS_FADE;
/** Durée du retour à la vue mémorisée (DP-19 : 0,5 s). */
export const CAMERA_RETURN_S = 0.5;

/** Ce que le module lit et écrit des OrbitControls. */
export interface RigControls {
  target: THREE.Vector3;
  enabled: boolean;
  enableDamping: boolean;
  minDistance: number;
  maxDistance: number;
  minPolarAngle: number;
  maxPolarAngle: number;
  minAzimuthAngle: number;
  maxAzimuthAngle: number;
}

export type CameraMode = "free" | "enter" | "locked" | "return";

export interface CameraRigOptions {
  enter?: number;
  return?: number;
  /** Changement de mode (attribut de test de la page). */
  onModeChange?: (mode: CameraMode) => void;
  /** Premier décalage appliqué par la cible suivie (attribut de test de la page). */
  onTargetMoved?: () => void;
  warn?: (message: string) => void;
}

type Saved = Pick<RigControls, "enabled" | "enableDamping" | "minDistance" | "maxDistance" | "minPolarAngle" | "maxPolarAngle" | "minAzimuthAngle" | "maxAzimuthAngle">;

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class CameraRig {
  private readonly camera: THREE.Camera;
  private readonly controls: RigControls;
  private readonly target: THREE.Object3D | null;
  private readonly positions: Readonly<Record<string, THREE.Object3D>>;
  private readonly opts: CameraRigOptions;
  private readonly enterS: number;
  private readonly returnS: number;

  private m: CameraMode = "free";
  private owner: THREE.Object3D | null = null;
  /** Vue d'avant la première action à `cameraPosition` : écart caméra − cible, et réglages des contrôles. */
  private saved: { offset: THREE.Vector3; controls: Saved } | null = null;
  private pendingSnap = false;
  private t = 0;
  private readonly fromPos = new THREE.Vector3();
  private readonly fromLook = new THREE.Vector3();
  private readonly lastTarget = new THREE.Vector3();
  private moved = false;
  private readonly tp = new THREE.Vector3();
  private readonly ep = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();

  /**
   * `target` : empty `camera.target` (`null` : rien à suivre, pas de position de caméra) ; `positions` : empty de
   * position par identifiant d'action. À créer une fois la caméra posée sur la vue de départ.
   */
  constructor(camera: THREE.Camera, controls: RigControls, target: THREE.Object3D | null, positions: Readonly<Record<string, THREE.Object3D>>, opts: CameraRigOptions = {}) {
    this.camera = camera;
    this.controls = controls;
    this.target = target;
    this.positions = positions;
    this.opts = opts;
    this.enterS = opts.enter ?? CAMERA_ENTER_S;
    this.returnS = opts.return ?? CAMERA_RETURN_S;
    if (target) target.getWorldPosition(this.lastTarget);
  }

  get mode(): CameraMode {
    return this.m;
  }

  /** Action dont l'empty de position tient la caméra (`null` : caméra libre) ; `snap` : d'un coup (noir d'une coupe). */
  setOwner(actionId: string | null, snap: boolean): void {
    if (!this.target) return;
    let empty: THREE.Object3D | null = null;
    if (actionId) {
      empty = this.positions[actionId] ?? null;
      if (!empty) (this.opts.warn ?? console.warn)(`caméra : empty de position de l'action « ${actionId} » introuvable, caméra libre`);
    }
    if (empty === this.owner) {
      if (snap && this.m !== "free") this.pendingSnap = true;
      return;
    }
    if (empty && !this.saved) this.lock();
    this.owner = empty;
    if (!empty && !this.saved) return; // déjà libre
    if (snap) {
      this.pendingSnap = true;
      return;
    }
    this.fromPos.copy(this.camera.position);
    this.fromLook.copy(this.controls.target);
    this.t = 0;
    this.setMode(empty ? "enter" : "return");
  }

  /** À chaque image, après la mise à jour du mixer. */
  update(dt: number): void {
    const target = this.target;
    if (!target) return;
    const tp = target.getWorldPosition(this.tp);

    if (this.pendingSnap) {
      this.pendingSnap = false;
      if (this.owner) {
        this.setMode("locked");
      } else if (this.saved) {
        this.place(this.pos.copy(tp).add(this.saved.offset), tp);
        this.unlock();
        this.lastTarget.copy(tp); // vue déjà recalée sur la cible : pas de décalage en plus cette image
      }
    }

    switch (this.m) {
      case "free": {
        const dx = tp.x - this.lastTarget.x;
        const dy = tp.y - this.lastTarget.y;
        const dz = tp.z - this.lastTarget.z;
        if (dx !== 0 || dy !== 0 || dz !== 0) {
          this.controls.target.x += dx;
          this.controls.target.y += dy;
          this.controls.target.z += dz;
          this.camera.position.x += dx;
          this.camera.position.y += dy;
          this.camera.position.z += dz;
          if (!this.moved) {
            this.moved = true;
            this.opts.onTargetMoved?.();
          }
        }
        break;
      }
      case "enter": {
        this.t += dt;
        const k = easeInOutCubic(Math.min(1, this.enterS > 0 ? this.t / this.enterS : 1));
        const ep = this.owner!.getWorldPosition(this.ep);
        this.place(this.pos.lerpVectors(this.fromPos, ep, k), this.look.lerpVectors(this.fromLook, tp, k));
        if (k >= 1) this.setMode("locked");
        break;
      }
      case "locked":
        this.place(this.owner!.getWorldPosition(this.ep), tp);
        break;
      case "return": {
        this.t += dt;
        const k = easeInOutCubic(Math.min(1, this.returnS > 0 ? this.t / this.returnS : 1));
        const dest = this.ep.copy(tp).add(this.saved!.offset);
        this.place(this.pos.lerpVectors(this.fromPos, dest, k), this.look.lerpVectors(this.fromLook, tp, k));
        if (k >= 1) this.unlock();
        break;
      }
    }
    this.lastTarget.copy(tp);
  }

  // ────────────── interne ──────────────

  private place(pos: THREE.Vector3, look: THREE.Vector3): void {
    this.camera.position.copy(pos);
    this.controls.target.copy(look);
    this.camera.lookAt(look);
  }

  /** Vue mémorisée et contrôles verrouillés (sans amortissement résiduel ni bornes : la caméra est posée par le module). */
  private lock(): void {
    const c = this.controls;
    this.saved = {
      offset: new THREE.Vector3().subVectors(this.camera.position, c.target),
      controls: {
        enabled: c.enabled, enableDamping: c.enableDamping,
        minDistance: c.minDistance, maxDistance: c.maxDistance,
        minPolarAngle: c.minPolarAngle, maxPolarAngle: c.maxPolarAngle,
        minAzimuthAngle: c.minAzimuthAngle, maxAzimuthAngle: c.maxAzimuthAngle,
      },
    };
    c.enabled = false;
    c.enableDamping = false;
    c.minDistance = 0;
    c.maxDistance = Infinity;
    c.minPolarAngle = 0;
    c.maxPolarAngle = Math.PI;
    c.minAzimuthAngle = -Infinity;
    c.maxAzimuthAngle = Infinity;
  }

  /** Contrôles rendus avec leurs réglages d'avant ; caméra libre. */
  private unlock(): void {
    if (this.saved) Object.assign(this.controls, this.saved.controls);
    this.saved = null;
    this.setMode("free");
  }

  private setMode(m: CameraMode): void {
    if (m === this.m) return;
    this.m = m;
    this.opts.onModeChange?.(m);
  }
}
