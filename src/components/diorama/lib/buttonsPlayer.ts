// Mode `buttons` (spec-extras-blender.md §4 et §8 ; Î10b, décisions de David du 14/10/2026).
//
// Comportement :
//   - `idle` joue en boucle dès le chargement de la scène (le clic sur l'écran de démarrage ne sert qu'à l'audio) ;
//   - un bouton par action, dans l'ordre du GLB ; un clic lance l'action avec un fondu de 0,25 s ;
//   - clic sur une autre action pendant une action : l'action en cours est interrompue (`interrupt`), la nouvelle part
//     en fondu (`start`) ; un seul retour à `idle`, à la fin de la dernière action lancée ;
//   - clic sur le bouton de l'action en cours : relance depuis le début (`interrupt` puis `start` sur le même `id`), sans
//     fondu (un fondu d'un clip vers lui-même saccade) ;
//   - action déclarée `loop: true` : tourne jusqu'au prochain clic ; un clic sur son propre bouton l'arrête et rend la
//     main à `idle` (`end`) ;
//   - fin d'une action `loop: false` : la dernière pose est tenue (`clampWhenFinished`) pendant le fondu vers `idle` ;
//     `end` est émis une seule fois, sur l'événement `finished` du mixer, filtré par action (P-02).
//
// Un seul mixer, attaché à la racine de la scène (une action = un clip glTF commun à tous les personnages concernés,
// spec §4) ; il appartient à `usePOIAnimations` (R-13, R-27, P-25), qui le met à jour dans la boucle unique (P-06).
// Les poids sont gérés ici, et non par `crossFadeTo` : la somme des poids reste égale à 1 même quand un clic arrive au
// milieu d'un fondu (`crossFadeTo` repartirait du poids 1 pour l'action sortante et laisserait voir la pose de repos).
//
// Événement pour Î11 (son par action) : `onAction({ id, phase })`, exactement une paire `start` puis `interrupt` ou `end`
// par lancement. Aucun son ici.
import * as THREE from "three";

export type ActionPhase = "start" | "interrupt" | "end";
export interface ActionEvent {
  id: string;
  phase: ActionPhase;
}

/** Ce que le mode `buttons` lit de `modules.animations` (couche 3D) : clips et boucles. */
export interface ButtonsPlayerConfig {
  idle: { clip: string; loop?: boolean };
  actions: { id: string; clip: string; loop?: boolean }[];
}

export interface ButtonsPlayerOptions {
  /** Durée des fondus, en secondes (0,25 par défaut). */
  fade?: number;
  onAction?: (e: ActionEvent) => void;
  /** Action en cours (ou `null` : `idle`), pour l'interface. */
  onChange?: (currentId: string | null) => void;
  warn?: (message: string) => void;
}

export const BUTTONS_FADE = 0.25;

/** Clip par nom exact (les noms de clips ne sont pas modifiés par `GLTFLoader`), sinon sans tenir compte de la casse. */
export function findClip(clips: readonly THREE.AnimationClip[], name: string): THREE.AnimationClip | undefined {
  return clips.find((c) => c.name === name) ?? clips.find((c) => c.name.toLowerCase() === name.toLowerCase());
}

interface Fading {
  action: THREE.AnimationAction;
  share: number;
}

export class ButtonsPlayer {
  readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction | null;
  private readonly actions = new Map<string, { action: THREE.AnimationAction; loop: boolean }>();
  private readonly fade: number;
  private readonly opts: ButtonsPlayerOptions;
  private current: { id: string; action: THREE.AnimationAction; token: number } | null = null;
  private token = 0;
  // Fondu en cours : `target` monte vers le poids 1, les `others` se partagent le reste au prorata de leur poids initial.
  private target: THREE.AnimationAction | null = null;
  private targetWeight = 1;
  private others: Fading[] = [];
  private suspended = false;
  private disposed = false;

  private readonly onFinished = (e: { action: THREE.AnimationAction }) => {
    const cur = this.current;
    if (this.disposed || this.suspended || !cur || e.action !== cur.action) return;
    this.current = null;
    this.emit(cur.id, "end");
    this.transitionTo(this.idle);
    this.opts.onChange?.(null);
  };

  constructor(mixer: THREE.AnimationMixer, clips: readonly THREE.AnimationClip[], cfg: ButtonsPlayerConfig, opts: ButtonsPlayerOptions = {}) {
    this.mixer = mixer;
    this.opts = opts;
    this.fade = opts.fade ?? BUTTONS_FADE;
    const warn = opts.warn ?? ((m: string) => console.warn(m));

    const idleClip = findClip(clips, cfg.idle.clip);
    if (!idleClip) warn(`mode buttons : clip « ${cfg.idle.clip} » (idle) absent du GLB`);
    this.idle = idleClip ? mixer.clipAction(idleClip) : null;
    if (this.idle) {
      const loop = cfg.idle.loop ?? true;
      this.idle.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      this.idle.clampWhenFinished = !loop;
    }

    for (const a of cfg.actions) {
      const clip = findClip(clips, a.clip);
      if (!clip) {
        warn(`mode buttons : clip « ${a.clip} » (action « ${a.id} ») absent du GLB`);
        continue;
      }
      const loop = a.loop ?? false;
      const action = mixer.clipAction(clip);
      action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      action.clampWhenFinished = !loop;
      this.actions.set(a.id, { action, loop });
    }

    mixer.addEventListener("finished", this.onFinished);
  }

  /** `idle` en boucle, à poids plein (chargement de la scène, ou reprise après `suspend`). */
  start(): void {
    if (this.disposed) return;
    this.mixer.stopAllAction();
    this.current = null;
    this.others = [];
    this.target = this.idle;
    this.targetWeight = 1;
    if (this.idle) {
      this.idle.reset();
      this.idle.play();
    }
    this.applyWeights();
    this.opts.onChange?.(null);
  }

  /** Clic sur le bouton de l'action `id`. */
  trigger(id: string): void {
    if (this.disposed || this.suspended) return;
    const entry = this.actions.get(id);
    if (!entry) {
      (this.opts.warn ?? console.warn)(`mode buttons : action « ${id} » sans clip jouable`);
      return;
    }
    const cur = this.current;

    if (cur && cur.id === id) {
      if (entry.loop) {
        // Action en boucle : son propre bouton l'arrête.
        this.current = null;
        this.emit(id, "end");
        this.transitionTo(this.idle);
        this.opts.onChange?.(null);
        return;
      }
      // Relance depuis le début, sans fondu.
      this.emit(id, "interrupt");
      entry.action.reset();
      entry.action.play();
      this.current = { id, action: entry.action, token: ++this.token };
      this.emit(id, "start");
      return;
    }

    if (cur) this.emit(cur.id, "interrupt");
    this.transitionTo(entry.action);
    this.current = { id, action: entry.action, token: ++this.token };
    this.emit(id, "start");
    this.opts.onChange?.(id);
  }

  /** Action en cours, ou `null` (`idle`). */
  get currentId(): string | null {
    return this.current?.id ?? null;
  }

  /** Jeton du dernier lancement (incrémenté à chaque `start`), pour un appelant qui diffère un traitement. */
  get currentToken(): number {
    return this.token;
  }

  /** Identifiants des actions jouables (clip présent dans le GLB), dans l'ordre déclaré. */
  get actionIds(): string[] {
    return [...this.actions.keys()];
  }

  /** Avance les fondus ; à appeler à chaque image avant la mise à jour du mixer. */
  tick(dt: number): void {
    if (this.disposed || this.suspended) return;
    if (this.targetWeight < 1) {
      this.targetWeight = this.fade > 0 ? Math.min(1, this.targetWeight + dt / this.fade) : 1;
    }
    this.applyWeights();
  }

  /** Met le mode en pause (lecture libre d'un clip dans l'atelier) : tout est arrêté, une action en cours est interrompue. */
  suspend(): void {
    if (this.disposed || this.suspended) return;
    const cur = this.current;
    this.current = null;
    if (cur) this.emit(cur.id, "interrupt");
    this.mixer.stopAllAction();
    this.others = [];
    this.target = null;
    this.suspended = true;
    this.opts.onChange?.(null);
  }

  /** Reprend après `suspend` : retour à `idle`. */
  resume(): void {
    if (this.disposed || !this.suspended) return;
    this.suspended = false;
    this.start();
  }

  get isSuspended(): boolean {
    return this.suspended;
  }

  /** Retire l'écouteur et arrête les actions ; le mixer reste à son propriétaire (`usePOIAnimations`). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.removeEventListener("finished", this.onFinished);
    this.mixer.stopAllAction();
    this.current = null;
    this.others = [];
    this.target = null;
  }

  // ────────────── interne ──────────────

  private emit(id: string, phase: ActionPhase): void {
    try {
      this.opts.onAction?.({ id, phase });
    } catch (err) {
      console.error("mode buttons : erreur dans onAction", err);
    }
  }

  /** Nouveau fondu vers `to` (relancé depuis le début), en partant des poids actuels. */
  private transitionTo(to: THREE.AnimationAction | null): void {
    const weights = new Map<THREE.AnimationAction, number>();
    if (this.target) weights.set(this.target, this.targetWeight);
    for (const o of this.others) weights.set(o.action, (weights.get(o.action) ?? 0) + o.share * (1 - this.targetWeight));

    let startWeight = 0;
    if (to && weights.has(to)) {
      startWeight = weights.get(to)!;
      weights.delete(to);
    }
    const rest = [...weights.values()].reduce((s, w) => s + w, 0);
    this.others = [...weights]
      .filter(([, w]) => w > 1e-4)
      .map(([action, w]) => ({ action, share: rest > 0 ? w / rest : 0 }));
    for (const [action, w] of weights) if (w <= 1e-4) action.stop();

    this.target = to;
    this.targetWeight = this.others.length ? Math.min(startWeight, 1) : 1;
    if (to) {
      to.reset();
      to.play();
    }
    this.applyWeights();
  }

  private applyWeights(): void {
    if (this.target) {
      this.target.enabled = true;
      this.target.setEffectiveWeight(this.targetWeight);
    }
    if (this.targetWeight >= 1) {
      for (const o of this.others) o.action.stop();
      this.others = [];
      return;
    }
    for (const o of this.others) {
      o.action.enabled = true;
      o.action.setEffectiveWeight(o.share * (1 - this.targetWeight));
    }
  }
}
