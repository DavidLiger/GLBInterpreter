// Lecture libre d'un clip (prérequis de l'atelier, spec-atelier-glbi.md §9 et §10, onglet Diagnostic, A2 ; Î10b).
//
// **Hors bundle du livre** : ce module n'est importé par aucun fichier du lecteur. L'atelier (ou un outil de
// développement) l'importe et l'accroche au lecteur par la poignée `ReaderEngine` que `WebDioramaLoader` passe à
// `onEngineReady` (scène chargée, clips du GLB, mode `buttons`, boucle unique).
//
// Pendant la lecture libre, le mode `buttons` est suspendu (aucune action, pas d'`idle`) ; `stop()` ou `dispose()` le
// reprend (retour à `idle`). Un mixer propre sur la racine de la scène, mis à jour par la boucle unique (P-06).
import * as THREE from "three";
import { findClip } from "./buttonsPlayer";
import type { FrameTasks } from "./frameTasks";

/** Poignée du lecteur sur une scène chargée (voir `WebDioramaLoader`, prop `onEngineReady`). */
export interface ReaderEngineLike {
  root: THREE.Object3D;
  clips: readonly THREE.AnimationClip[];
  frameTasks: FrameTasks;
  buttons: { suspend(): void; resume(): void } | null;
}

export interface ClipPreviewOptions {
  /** Boucle (vrai par défaut). */
  loop?: boolean;
  /** Vitesse de lecture, de 0 à 2 (1 par défaut). */
  speed?: number;
}

export const CLIP_PREVIEW_MAX_SPEED = 2;

export class ClipPreview {
  private readonly engine: ReaderEngineLike;
  private readonly mixer: THREE.AnimationMixer;
  private action: THREE.AnimationAction | null = null;
  private removeTask: (() => void) | null = null;
  private disposed = false;

  constructor(engine: ReaderEngineLike) {
    this.engine = engine;
    this.mixer = new THREE.AnimationMixer(engine.root);
  }

  /** Noms des clips du GLB, dans l'ordre du fichier. */
  get clipNames(): string[] {
    return this.engine.clips.map((c) => c.name);
  }

  /** Joue `clipName` seul (le mode `buttons` est suspendu). Renvoie faux si le clip n'existe pas. */
  play(clipName: string, opts: ClipPreviewOptions = {}): boolean {
    if (this.disposed) return false;
    const clip = findClip(this.engine.clips, clipName);
    if (!clip) return false;
    this.engine.buttons?.suspend();
    this.mixer.stopAllAction();
    const action = this.mixer.clipAction(clip);
    const loop = opts.loop ?? true;
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.setEffectiveWeight(1);
    action.timeScale = clampSpeed(opts.speed ?? 1);
    action.play();
    this.action = action;
    if (!this.removeTask) this.removeTask = this.engine.frameTasks.add((dt) => {
      this.mixer.update(dt);
    });
    return true;
  }

  setSpeed(speed: number): void {
    if (this.action) this.action.timeScale = clampSpeed(speed);
  }

  setLoop(loop: boolean): void {
    if (!this.action) return;
    this.action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    this.action.clampWhenFinished = !loop;
  }

  /** Temps et durée du clip en cours (secondes), pour un curseur d'affichage. */
  get time(): { current: number; duration: number } | null {
    return this.action ? { current: this.action.time, duration: this.action.getClip().duration } : null;
  }

  /** Arrête la lecture libre et rend la main au mode `buttons` (retour à `idle`). */
  stop(): void {
    this.removeTask?.();
    this.removeTask = null;
    this.mixer.stopAllAction();
    this.action = null;
    this.engine.buttons?.resume();
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.mixer.uncacheRoot(this.engine.root);
    this.disposed = true;
  }
}

function clampSpeed(s: number): number {
  return Number.isFinite(s) ? Math.min(CLIP_PREVIEW_MAX_SPEED, Math.max(0, s)) : 1;
}
