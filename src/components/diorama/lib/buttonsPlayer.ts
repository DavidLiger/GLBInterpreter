// Mode `buttons` (spec-extras-blender.md §4 et §8 ; Î10b, décisions de David du 14/10/2026 ; actions combinées en AC2,
// spec-actions-combinees.md §4, §6, §16).
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
// Événements (AC2, DP-6, §4) : chaque action peut porter des événements `{ id, time }` (marqueurs de la timeline de
// Blender, temps 0 = image 0 de la timeline, v0.3 §15 ; triés ici par instant, le build ne contrôle pas leur ordre). Un
// événement part (`onEvent`) quand le temps du clip (`AnimationAction.time`) franchit son instant, contrôlé par `postUpdate`
// **après** la mise à jour du mixer dans la boucle unique : plusieurs événements franchis par une même image partent tous,
// dans l'ordre ; un événement à l'instant 0 part à la première image ; une action en boucle les redéclenche à chaque tour
// (tours comptés par l'événement `loop` du mixer, même plusieurs dans une image) ; une relance les fait repartir du début ;
// une interruption annule ceux qui restent ; à la fin naturelle du clip, ceux qui restent (instant égal à la durée, à la
// tolérance d'arrondi près) partent avant `end`.
//
// Coupe au noir (AC2, DP-8, §6) : une action `transition: "cut"` passe par le noir à son entrée et à sa sortie (d'une
// action à une autre, si l'une des deux est marquée ; relance d'une action marquée comprise). Le calque noir est dessiné par
// la page (`onCut` : opacité 0 → 1 en 0,3 s, puis 1 → 0 en 0,3 s). Au noir : l'action sortante est arrêtée (`interrupt`,
// ou `end` pour une action en boucle arrêtée par son bouton), l'entrante démarre au temps 0 avec le poids 1, sans fondu de
// poses (`start`). Pendant la montée vers le noir, le dernier clic est retenu et exécuté au noir. Fin naturelle d'une action
// marquée : `end` à la fin du clip (pose tenue), retour à `idle` au noir. Pendant la descente (noir → scène), un clic est
// traité normalement (une nouvelle coupe repart de l'opacité courante).
//
// Caméra (AC2, DP-19, §16) : le mode `buttons` désigne seulement l'action dont l'empty de position tient la caméra
// (`onCamera`) ; le mouvement est fait par `lib/cameraRig.ts`. Changement d'un coup (`snap`) au noir d'une coupe et au
// démarrage, sinon en douceur.
//
// Un seul mixer, attaché à la racine de la scène (une action = un clip glTF commun à tous les personnages concernés,
// spec §4) ; il appartient à `usePOIAnimations` (R-13, R-27, P-25), qui le met à jour dans la boucle unique (P-06).
// Les poids sont gérés ici, et non par `crossFadeTo` : la somme des poids reste égale à 1 même quand un clic arrive au
// milieu d'un fondu (`crossFadeTo` repartirait du poids 1 pour l'action sortante et laisserait voir la pose de repos).
//
// `onAction({ id, phase })` : exactement une paire `start` puis `interrupt` ou `end` par lancement (son par action, Î11 ;
// `collected`, Î13).
import * as THREE from "three";

export type ActionPhase = "start" | "interrupt" | "end";
export interface ActionEvent {
  id: string;
  phase: ActionPhase;
}

/** Événement d'une action franchi par le temps du clip (son d'événement, AC2). */
export interface ButtonsEvent {
  action: string;
  event: string;
  time: number;
}

/** État du calque noir (coupe au noir, AC2) : opacité, phase (`out` vers le noir, `in` vers la scène), instant du noir. */
export interface CutState {
  opacity: number;
  phase: "out" | "in" | null;
  /** Vrai à l'instant du noir (une fois par coupe). */
  black?: boolean;
}

/** Action dont l'empty de position tient la caméra (`null` : caméra libre) ; `snap` : changement d'un coup (au noir). */
export interface CameraOwner {
  id: string | null;
  snap: boolean;
}

/** Ce que le mode `buttons` lit de `modules.animations` (couche 3D) : clips, boucles, transitions, événements, caméra. */
export interface ButtonsPlayerConfig {
  idle: { clip: string; loop?: boolean };
  actions: {
    id: string;
    clip: string;
    loop?: boolean;
    transition?: "fade" | "cut";
    events?: readonly { id: string; time: number }[];
    cameraPosition?: string;
  }[];
}

export interface ButtonsPlayerOptions {
  /** Durée des fondus, en secondes (0,25 par défaut). */
  fade?: number;
  /** Durée de chaque moitié d'une coupe au noir, en secondes (0,3 par défaut). */
  cutFade?: number;
  onAction?: (e: ActionEvent) => void;
  /** Action en cours (ou `null` : `idle`), pour l'interface. */
  onChange?: (currentId: string | null) => void;
  /** Événement franchi (son d'événement). */
  onEvent?: (e: ButtonsEvent) => void;
  /** Calque noir : à chaque image d'une coupe, et une dernière fois à opacité 0. */
  onCut?: (s: CutState) => void;
  /** Changement de l'action qui tient la caméra (DP-19). */
  onCamera?: (e: CameraOwner) => void;
  warn?: (message: string) => void;
}

export const BUTTONS_FADE = 0.25;
/** Moitié d'une coupe au noir (DP-8 : 0,3 s vers le noir, 0,3 s vers la scène). */
export const CUT_FADE = 0.3;

/** Clip par nom exact (les noms de clips ne sont pas modifiés par `GLTFLoader`), sinon sans tenir compte de la casse. */
export function findClip(clips: readonly THREE.AnimationClip[], name: string): THREE.AnimationClip | undefined {
  return clips.find((c) => c.name === name) ?? clips.find((c) => c.name.toLowerCase() === name.toLowerCase());
}

interface Fading {
  action: THREE.AnimationAction;
  share: number;
}

interface Entry {
  id: string;
  action: THREE.AnimationAction;
  loop: boolean;
  cut: boolean;
  /** Événements triés par instant (ordre déclaré gardé à instant égal). */
  events: { id: string; time: number }[];
  /** L'action déclare un empty de position de la caméra. */
  camera: boolean;
}

/** Lancement en cours : temps du clip déjà parcouru par les événements (`last`, −1 au lancement) et tours de boucle. */
interface Current {
  id: string;
  entry: Entry;
  token: number;
  last: number;
  wraps: number;
}

interface Cut {
  phase: "out" | "in";
  opacity: number;
  /** Au noir : action entrante (`null` : `idle`). */
  target: string | null;
  /** Action sortante en cours au début de la coupe, et ce qu'elle recevra au noir. */
  outgoing: { id: string; phase: "interrupt" | "end" } | null;
}

export class ButtonsPlayer {
  readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction | null;
  private readonly actions = new Map<string, Entry>();
  private readonly fade: number;
  private readonly cutFade: number;
  private readonly opts: ButtonsPlayerOptions;
  private current: Current | null = null;
  private token = 0;
  // Fondu en cours : `target` monte vers le poids 1, les `others` se partagent le reste au prorata de leur poids initial.
  private target: THREE.AnimationAction | null = null;
  private targetWeight = 1;
  private others: Fading[] = [];
  private cut: Cut | null = null;
  private cameraOwner: string | null = null;
  private suspended = false;
  private disposed = false;

  private readonly onFinished = (e: { action: THREE.AnimationAction }) => {
    const cur = this.current;
    if (this.disposed || this.suspended || !cur || e.action !== cur.entry.action) return;
    // Événements restants (instant égal à la durée du clip, à l'arrondi près) : avant `end`.
    this.fire(cur, cur.last, Infinity);
    if (this.current !== cur) return;
    this.current = null;
    this.emit(cur.id, "end");
    this.opts.onChange?.(null);
    if (this.cut?.phase === "out") {
      // Fin pendant la montée vers le noir : pose tenue jusqu'au noir, `end` déjà émis.
      if (this.cut.outgoing?.id === cur.id) this.cut.outgoing = null;
      return;
    }
    if (cur.entry.cut) {
      // Action marquée : `end` à la fin du clip, retour à `idle` au noir (pose et caméra tenues jusque-là).
      this.beginCut(null, null);
      return;
    }
    this.transitionTo(this.idle);
    this.setCamera(null, false);
  };

  private readonly onLoop = (e: { action: THREE.AnimationAction; loopDelta: number }) => {
    const cur = this.current;
    if (cur && e.action === cur.entry.action) cur.wraps += Math.abs(e.loopDelta);
  };

  constructor(mixer: THREE.AnimationMixer, clips: readonly THREE.AnimationClip[], cfg: ButtonsPlayerConfig, opts: ButtonsPlayerOptions = {}) {
    this.mixer = mixer;
    this.opts = opts;
    this.fade = opts.fade ?? BUTTONS_FADE;
    this.cutFade = opts.cutFade ?? CUT_FADE;
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
      const events = (a.events ?? [])
        .map((ev, i) => ({ id: ev.id, time: ev.time, i }))
        .sort((x, y) => x.time - y.time || x.i - y.i)
        .map(({ id, time }) => ({ id, time }));
      this.actions.set(a.id, { id: a.id, action, loop, cut: a.transition === "cut", events, camera: !!a.cameraPosition });
    }

    mixer.addEventListener("finished", this.onFinished);
    mixer.addEventListener("loop", this.onLoop);
  }

  /** `idle` en boucle, à poids plein (chargement de la scène, ou reprise après `suspend`). */
  start(): void {
    if (this.disposed) return;
    this.mixer.stopAllAction();
    this.current = null;
    this.others = [];
    this.endCut();
    this.target = this.idle;
    this.targetWeight = 1;
    if (this.idle) {
      this.idle.reset();
      this.idle.play();
    }
    this.applyWeights();
    this.opts.onChange?.(null);
    this.setCamera(null, true, true);
  }

  /** Clic sur le bouton de l'action `id`. */
  trigger(id: string): void {
    if (this.disposed || this.suspended) return;
    const entry = this.actions.get(id);
    if (!entry) {
      (this.opts.warn ?? console.warn)(`mode buttons : action « ${id} » sans clip jouable`);
      return;
    }
    // Montée vers le noir : le dernier clic est retenu, exécuté au noir.
    if (this.cut?.phase === "out") {
      this.cut.target = id;
      return;
    }
    const cur = this.current;

    if (cur && cur.id === id) {
      if (entry.loop) {
        // Action en boucle : son propre bouton l'arrête.
        if (entry.cut) {
          this.beginCut(null, "end");
          return;
        }
        this.current = null;
        this.emit(id, "end");
        this.transitionTo(this.idle);
        this.opts.onChange?.(null);
        this.setCamera(null, false);
        return;
      }
      if (entry.cut) {
        // Relance d'une action marquée : par le noir.
        this.beginCut(id, "interrupt");
        return;
      }
      // Relance depuis le début, sans fondu.
      this.emit(id, "interrupt");
      entry.action.reset();
      entry.action.play();
      this.current = this.launch(entry);
      this.emit(id, "start");
      return;
    }

    if (entry.cut || cur?.entry.cut) {
      this.beginCut(id, cur ? "interrupt" : null);
      return;
    }

    if (cur) this.emit(cur.id, "interrupt");
    this.transitionTo(entry.action);
    this.current = this.launch(entry);
    this.emit(id, "start");
    this.opts.onChange?.(id);
    this.setCamera(id, false);
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

  /** Phase de la coupe au noir en cours (`null` : aucune). */
  get cutPhase(): "out" | "in" | null {
    return this.cut?.phase ?? null;
  }

  /** Avance les fondus et la coupe au noir ; à appeler à chaque image avant la mise à jour du mixer. */
  tick(dt: number): void {
    if (this.disposed || this.suspended) return;
    if (this.cut) this.tickCut(dt);
    if (this.targetWeight < 1) {
      this.targetWeight = this.fade > 0 ? Math.min(1, this.targetWeight + dt / this.fade) : 1;
    }
    this.applyWeights();
  }

  /**
   * Événements franchis par le temps du clip de l'action en cours ; à appeler à chaque image **après** la mise à jour du
   * mixer (pas de dérive entre son et image, même à faible cadence).
   */
  postUpdate(): void {
    const cur = this.current;
    if (this.disposed || this.suspended || !cur) return;
    if (!cur.entry.events.length) {
      cur.wraps = 0;
      return;
    }
    if (cur.wraps > 0) {
      // Tours de boucle terminés pendant cette image : fin du tour en cours, puis les tours entiers.
      const wraps = cur.wraps;
      cur.wraps = 0;
      this.fire(cur, cur.last, Infinity);
      for (let i = 1; i < wraps && this.current === cur; i++) this.fire(cur, -1, Infinity);
      cur.last = -1;
    }
    if (this.current !== cur) return;
    const t = cur.entry.action.time;
    if (t > cur.last) this.fire(cur, cur.last, t);
    if (this.current === cur) cur.last = Math.max(cur.last, t);
  }

  /** Met le mode en pause (lecture libre d'un clip dans l'atelier) : tout est arrêté, une action en cours est interrompue. */
  suspend(): void {
    if (this.disposed || this.suspended) return;
    const cur = this.current;
    this.current = null;
    if (cur) this.emit(cur.id, "interrupt");
    this.endCut();
    this.mixer.stopAllAction();
    this.others = [];
    this.target = null;
    this.suspended = true;
    this.opts.onChange?.(null);
    this.setCamera(null, true);
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

  /** Retire les écouteurs et arrête les actions ; le mixer reste à son propriétaire (`usePOIAnimations`). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.removeEventListener("finished", this.onFinished);
    this.mixer.removeEventListener("loop", this.onLoop);
    this.mixer.stopAllAction();
    this.current = null;
    this.cut = null;
    this.others = [];
    this.target = null;
  }

  // ────────────── interne ──────────────

  private launch(entry: Entry): Current {
    return { id: entry.id, entry, token: ++this.token, last: -1, wraps: 0 };
  }

  private emit(id: string, phase: ActionPhase): void {
    try {
      this.opts.onAction?.({ id, phase });
    } catch (err) {
      console.error("mode buttons : erreur dans onAction", err);
    }
  }

  /** Événements de `cur` d'instant dans ]lo, hi], dans l'ordre ; s'arrête si le rappel change l'action en cours. */
  private fire(cur: Current, lo: number, hi: number): void {
    for (const ev of cur.entry.events) {
      if (ev.time <= lo || ev.time > hi) continue;
      if (this.current !== cur) return;
      try {
        this.opts.onEvent?.({ action: cur.id, event: ev.id, time: ev.time });
      } catch (err) {
        console.error("mode buttons : erreur dans onEvent", err);
      }
    }
  }

  /** Action qui tient la caméra (DP-19) : annoncée seulement quand elle change (`force` : toujours). */
  private setCamera(id: string | null, snap: boolean, force = false): void {
    const owner = id && this.actions.get(id)?.camera ? id : null;
    if (owner === this.cameraOwner && !force) return;
    this.cameraOwner = owner;
    try {
      this.opts.onCamera?.({ id: owner, snap });
    } catch (err) {
      console.error("mode buttons : erreur dans onCamera", err);
    }
  }

  // ── Coupe au noir ──

  /** Début d'une coupe vers `target` (`null` : `idle`) ; reprend l'opacité d'une coupe en cours de descente. */
  private beginCut(target: string | null, outgoingPhase: "interrupt" | "end" | null): void {
    const cur = this.current;
    this.cut = {
      phase: "out",
      opacity: this.cut?.opacity ?? 0,
      target,
      outgoing: cur && outgoingPhase ? { id: cur.id, phase: outgoingPhase } : null,
    };
    this.notifyCut();
  }

  private tickCut(dt: number): void {
    const cut = this.cut!;
    const step = this.cutFade > 0 ? dt / this.cutFade : 1;
    if (cut.phase === "out") {
      cut.opacity = Math.min(1, cut.opacity + step);
      if (cut.opacity >= 1) this.black();
      else this.notifyCut();
      return;
    }
    cut.opacity = Math.max(0, cut.opacity - step);
    if (cut.opacity <= 0) this.endCut();
    else this.notifyCut();
  }

  /** Au noir : sortante arrêtée, entrante au temps 0 et au poids 1, caméra d'un coup ; puis descente vers la scène. */
  private black(): void {
    const cut = this.cut!;
    const target = cut.target;
    const outgoing = cut.outgoing;
    cut.phase = "in";
    cut.target = null;
    cut.outgoing = null;
    this.notifyCut(true);
    const cur = this.current;
    if (cur && outgoing?.id === cur.id) {
      this.current = null;
      this.emit(cur.id, outgoing.phase);
    }
    const entry = target ? this.actions.get(target) ?? null : null;
    const to = entry ? entry.action : this.idle;
    this.mixer.stopAllAction();
    this.others = [];
    this.target = to;
    this.targetWeight = 1;
    if (to) {
      to.reset();
      to.play();
    }
    this.applyWeights();
    if (entry) {
      this.current = this.launch(entry);
      this.emit(entry.id, "start");
    }
    this.opts.onChange?.(entry ? entry.id : null);
    this.setCamera(entry ? entry.id : null, true);
  }

  private endCut(): void {
    if (!this.cut) return;
    this.cut = null;
    this.notifyCut();
  }

  private notifyCut(black = false): void {
    const s: CutState = this.cut ? { opacity: this.cut.opacity, phase: this.cut.phase } : { opacity: 0, phase: null };
    if (black) s.black = true;
    try {
      this.opts.onCut?.(s);
    } catch (err) {
      console.error("mode buttons : erreur dans onCut", err);
    }
  }

  // ── Poids ──

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
