// Audio Web Audio d'une scène v1 (Î11, D-4.1 B) : son par action du mode `buttons` et son d'ambiance, sur un volume commun.
//
// Chaîne : chaque son est un `AudioBufferSourceNode` → `GainNode` maître → sortie. Le volume et la sourdine agissent sur le
// gain maître (A-24, A-30) : ils valent pour tous les sons, y compris sur iOS où `HTMLAudioElement.volume` est ignoré (A-28,
// à vérifier en Î16).
//
// Chargement (A-05, A-10 à A-13) :
//   - les octets sont lus dans le Cache Storage du livre (`getAssetFromCache`, cache `book-<bookId>@<dossier>`), sinon par
//     URL (développement, atelier, livre non installé) ; ils sont préchargés dès que la scène connaît ses sons, avant le geste ;
//   - le décodage (`decodeAudioData`) attend l'`AudioContext`, créé par `unlock` : dans le geste de l'écran « Cliquer pour
//     commencer » (fixture, atelier), ou au lancement automatique d'une scène v1 du livre, puis repris dans le premier
//     geste de la page s'il est resté suspendu (Î13bis, `blocked`) ; un son lancé avant la fin de son décodage part dès
//     qu'il est prêt, si son lancement est toujours en cours ;
//   - génération : chaque `setSounds` incrémente un numéro ; un chargement d'une génération précédente est abandonné, et
//     les sons qui ne sont plus utilisés sont oubliés (mémoire rendue au ramasse-miettes).
//
// Son par action (événement `onAction` du mode `buttons`, une paire par lancement) :
//   - `start` : le son de l'action part (un seul son d'action à la fois : le précédent est coupé) ;
//   - `interrupt` : le son de l'action interrompue est coupé (fondu de 30 ms, sans clic) ;
//   - `end` : le son est coupé (fondu de 30 ms) à la fin du clip (décision de David du 16/10, test 2 d'Î11) ; pour une
//     action `loop: true`, arrêtée par son propre bouton, le son bouclait avec elle et s'arrête avec elle.
//
// Sons d'événement (AC2, DP-6, spec-actions-combinees.md §4) : un événement franchi par le temps du clip (`onEvent`, mode
// `buttons`) joue son son, en plus du son de l'action et des autres sons d'événement en cours (autant que nécessaire). À
// l'interruption de l'action (`interrupt`, relance comprise), ses sons d'événement sont coupés (fondu de 30 ms) et un son
// d'événement pas encore décodé ne part plus ; à la fin naturelle (`end`), ils vont au bout. Préchargés et décodés avec les
// autres sons de la scène, sur le même gain maître (volume et sourdine du livre).
//
// Ambiance (`modules.audio.ambientSound`) : décodée en entier et jouée en boucle sans coupure (décision de David du 16/10,
// option A). Mémoire : ≈ 21 Mo par minute de son stéréo 44,1 kHz décodé, rendue au déchargement de la scène.
//
// Volume et sourdine persistés par livre (A-31) : `localStorage` `glbinterpreter:audio:<bookId>` = `{ volume, muted }`.
// `volume` n'est jamais nul (c'est le dernier volume non nul, `lastNonZeroVolume`) : régler le curseur à 0 met en sourdine
// sans perdre le volume, et réactiver le son rend ce volume.
import { getAssetFromCache } from "@/components/book/install/bookCache";

export interface AudioSettings {
  /** Dernier volume non nul, dans ]0, 1]. */
  volume: number;
  muted: boolean;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { volume: 0.7, muted: false };
export const audioSettingsKey = (bookId: string) => `glbinterpreter:audio:${bookId}`;

/** Volume effectif (0 en sourdine) : ce que montre le curseur et ce que reçoit le gain maître. */
export const effectiveVolume = (s: AudioSettings) => (s.muted ? 0 : s.volume);

/** Réglages lus d'un texte enregistré ; valeurs absentes ou invalides remplacées par les valeurs par défaut. */
export function parseAudioSettings(raw: string | null | undefined): AudioSettings {
  if (!raw) return { ...DEFAULT_AUDIO_SETTINGS };
  try {
    const o = JSON.parse(raw) as Partial<AudioSettings>;
    const volume = typeof o.volume === "number" && o.volume > 0 && o.volume <= 1 ? o.volume : DEFAULT_AUDIO_SETTINGS.volume;
    return { volume, muted: o.muted === true };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

/** Curseur à `v` : 0 = sourdine (le volume non nul est gardé), sinon volume `v` et son actif. */
export function withVolume(s: AudioSettings, v: number): AudioSettings {
  const c = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  return c === 0 ? { volume: s.volume, muted: true } : { volume: c, muted: false };
}

export const withMuteToggled = (s: AudioSettings): AudioSettings => ({ volume: s.volume, muted: !s.muted });

/** Sons d'une scène (chemins déjà résolus, comme ceux du moteur). */
export interface SceneSounds {
  ambient?: string;
  /** Par identifiant d'action : son et boucle de l'action (couche 3D). */
  actions: Record<string, { sound: string; loop: boolean }>;
  /** Sons d'événement (AC2) : par identifiant d'action, puis d'événement. */
  events?: Record<string, Record<string, string>>;
}

export type ActionPhase = "start" | "interrupt" | "end";

/** Surface de l'`AudioContext` utilisée ici (remplaçable dans les tests sans navigateur). */
export type AudioContextLike = Pick<
  AudioContext,
  "state" | "currentTime" | "destination" | "resume" | "close" | "createGain" | "createBuffer" | "createBufferSource" | "decodeAudioData"
>;

export interface AudioEngineOptions {
  bookId: string;
  /** Création de l'`AudioContext` (dans le geste). Par défaut `new AudioContext()` (ou `webkitAudioContext`). */
  createContext?: () => AudioContextLike | null;
  /** Octets d'un son, ou `null`. Par défaut : Cache Storage du livre, puis réseau. */
  loadBytes?: (path: string) => Promise<ArrayBuffer | null>;
  /** Stockage des réglages (par défaut `localStorage`, ignoré s'il est indisponible). */
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  warn?: (message: string) => void;
}

const FADE_OUT = 0.03;
const GAIN_SMOOTHING = 0.015;

function defaultContext(): AudioContextLike | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

function defaultStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class AudioEngine {
  private readonly opts: AudioEngineOptions;
  private readonly warn: (m: string) => void;
  private readonly storage: Pick<Storage, "getItem" | "setItem"> | null;
  private settings: AudioSettings;
  private readonly listeners = new Set<(s: AudioSettings) => void>();

  private ctx: AudioContextLike | null = null;
  private master: GainNode | null = null;
  private sounds: SceneSounds = { actions: {} };
  private generation = 0;
  private disposed = false;
  /** Octets préchargés (avant le geste), puis tampons décodés, par chemin. */
  private readonly bytes = new Map<string, Promise<ArrayBuffer | null>>();
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();

  private launch = 0;
  private action: { id: string; launch: number; loop: boolean; voice: Voice | null } | null = null;
  /** Sons d'événement en cours, par action ; `epoch` : incrémentée à chaque interruption de l'action. */
  private readonly eventVoices = new Map<string, Set<Voice>>();
  private readonly eventEpoch = new Map<string, number>();
  private ambient: { path: string; voice: Voice | null } | null = null;

  constructor(opts: AudioEngineOptions) {
    this.opts = opts;
    this.warn = opts.warn ?? ((m) => console.warn(m));
    this.storage = opts.storage === undefined ? defaultStorage() : opts.storage;
    let raw: string | null = null;
    try {
      raw = this.storage?.getItem(audioSettingsKey(opts.bookId)) ?? null;
    } catch {
      /* stockage refusé : valeurs par défaut */
    }
    this.settings = parseAudioSettings(raw);
  }

  // ────────────── Réglages ──────────────

  getSettings(): AudioSettings {
    return this.settings;
  }

  subscribe(fn: (s: AudioSettings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setVolume(v: number): void {
    this.apply(withVolume(this.settings, v));
  }

  toggleMute(): void {
    this.apply(withMuteToggled(this.settings));
  }

  private apply(next: AudioSettings): void {
    if (next.volume === this.settings.volume && next.muted === this.settings.muted) return;
    this.settings = next;
    try {
      this.storage?.setItem(audioSettingsKey(this.opts.bookId), JSON.stringify(next));
    } catch {
      /* quota ou stockage refusé : le réglage vaut pour la session */
    }
    this.applyGain();
    for (const fn of this.listeners) fn(next);
  }

  private applyGain(): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(effectiveVolume(this.settings), this.ctx.currentTime, GAIN_SMOOTHING);
  }

  // ────────────── Sons de la scène ──────────────

  /** Sons de la scène (au chargement, et à chaque changement de configuration : atelier). */
  setSounds(sounds: SceneSounds): void {
    if (this.disposed) return;
    this.generation++;
    this.sounds = sounds;
    const eventSounds = Object.values(sounds.events ?? {}).flatMap((byEvent) => Object.values(byEvent));
    const used = new Set([sounds.ambient, ...Object.values(sounds.actions).map((a) => a.sound), ...eventSounds].filter((p): p is string => !!p));
    for (const p of [...this.bytes.keys()]) if (!used.has(p)) this.bytes.delete(p);
    for (const p of [...this.buffers.keys()]) if (!used.has(p)) this.buffers.delete(p);
    for (const p of used) {
      this.preload(p);
      if (this.ctx) void this.decode(p);
    }
    // Son de l'action en cours retiré ou changé : il continue jusqu'à son terme ; ambiance changée : relancée
    if (this.ctx && this.ambient?.path !== sounds.ambient) this.startAmbient();
  }

  private preload(path: string): void {
    if (this.bytes.has(path) || this.buffers.has(path)) return;
    const load = this.opts.loadBytes ?? ((p: string) => this.defaultLoad(p));
    this.bytes.set(
      path,
      load(path).catch((e) => {
        this.warn(`[AUDIO] son « ${path} » illisible : ${(e as Error)?.message ?? e}`);
        return null;
      }),
    );
  }

  private async defaultLoad(path: string): Promise<ArrayBuffer | null> {
    const blob = await getAssetFromCache(this.opts.bookId, path);
    if (blob) return blob.arrayBuffer();
    const res = await fetch(path);
    if (!res.ok) {
      this.warn(`[AUDIO] son « ${path} » introuvable (HTTP ${res.status})`);
      return null;
    }
    return res.arrayBuffer();
  }

  /** Tampon décodé d'un son (décodage lancé au premier besoin, une fois par génération). */
  private decode(path: string): Promise<AudioBuffer | null> {
    const known = this.buffers.get(path);
    if (known) return known;
    const ctx = this.ctx;
    const gen = this.generation;
    if (!ctx) return Promise.resolve(null);
    if (!this.bytes.has(path)) this.preload(path);
    const p = (async () => {
      const data = await this.bytes.get(path);
      if (!data || this.disposed || ctx !== this.ctx) return null;
      try {
        // `decodeAudioData` détache le tampon : les octets ne servent plus
        const buf = await ctx.decodeAudioData(data);
        return buf;
      } catch (e) {
        this.warn(`[AUDIO] décodage impossible de « ${path} » (format non pris en charge par ce navigateur ?) : ${(e as Error)?.message ?? e}`);
        return null;
      } finally {
        if (gen === this.generation) this.bytes.delete(path);
      }
    })();
    this.buffers.set(path, p);
    return p;
  }

  // ────────────── Déblocage ──────────────

  /** Vrai une fois l'`AudioContext` créé. */
  get unlocked(): boolean {
    return !!this.ctx;
  }

  /**
   * Vrai quand l'`AudioContext` existe mais ne joue pas encore : le navigateur attend un geste dans la page (Î13bis :
   * arrivée directe par un QR, page rechargée par le système). Les sons programmés partent dès qu'il démarre.
   */
  get blocked(): boolean {
    const s = this.ctx?.state;
    return !!s && s !== "running" && s !== "closed";
  }

  /** Changements de `blocked` (pastille « Touche l'écran pour le son », Î13bis). */
  onBlockedChange(fn: (blocked: boolean) => void): () => void {
    this.blockedListeners.add(fn);
    return () => this.blockedListeners.delete(fn);
  }

  private readonly blockedListeners = new Set<(blocked: boolean) => void>();
  private lastBlocked: boolean | null = null;

  private notifyBlocked(): void {
    if (this.disposed) return;
    const b = this.blocked;
    if (b === this.lastBlocked) return;
    this.lastBlocked = b;
    for (const fn of this.blockedListeners) fn(b);
  }

  /** Tampon muet joué pour débloquer les anciens iOS (doit partir dans le geste). */
  private playSilent(): void {
    if (!this.ctx || !this.master) return;
    try {
      const silent = this.ctx.createBufferSource();
      silent.buffer = this.ctx.createBuffer(1, 1, 22050);
      silent.connect(this.master);
      silent.start(0);
    } catch {
      /* sans effet sur les navigateurs récents */
    }
  }

  /**
   * Crée l'`AudioContext` s'il n'existe pas (décodage des sons préchargés, ambiance programmée), puis le reprend s'il est
   * suspendu, avec un tampon muet (anciens iOS).
   *
   * Î13bis : appelé une première fois **au lancement de la scène**, hors de tout geste. Le navigateur le laisse démarrer si
   * la page a déjà reçu un geste (activation durable : clic d'une carte du menu, « Passer » du quiz, installation ; Chrome,
   * Firefox) ou si l'app est installée (Chrome) ; sinon il reste suspendu (`blocked`), et le lecteur rappelle `unlock`
   * **dans** le premier geste de la page (toucher, clic, touche du clavier). Avant Î13bis, il n'était appelé que dans le
   * geste de l'écran « Cliquer pour commencer » (toujours le cas pour la fixture et l'atelier).
   */
  unlock(): void {
    if (this.disposed) return;
    if (!this.ctx) {
      let ctx: AudioContextLike | null = null;
      try {
        ctx = (this.opts.createContext ?? defaultContext)();
      } catch (e) {
        this.warn(`[AUDIO] Web Audio indisponible : ${(e as Error)?.message ?? e}`);
      }
      if (!ctx) {
        this.warn("[AUDIO] Web Audio indisponible dans ce navigateur : la scène s'affiche sans son");
        return;
      }
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = effectiveVolume(this.settings);
      this.master.connect(ctx.destination);
      // Démarrage annoncé par le navigateur (`statechange`), et de toute façon vérifié à la fin de `resume()`
      const target = ctx as unknown as { addEventListener?: (type: string, fn: () => void) => void };
      target.addEventListener?.("statechange", () => {
        if (this.ctx === ctx) this.notifyBlocked();
      });
      this.playSilent();
      for (const p of [...this.bytes.keys()]) void this.decode(p);
      this.startAmbient();
    } else if (this.ctx.state !== "running") {
      this.playSilent();
    }
    const ctx = this.ctx;
    if (ctx.state !== "running") {
      ctx
        .resume()
        .then(() => {
          if (this.ctx === ctx) this.notifyBlocked();
        })
        .catch(() => {});
    }
    this.notifyBlocked();
  }

  // ────────────── Lecture ──────────────

  private play(buffer: AudioBuffer, loop: boolean, onEnded?: () => void): Voice | null {
    if (!this.ctx || !this.master) return null;
    const gain = this.ctx.createGain();
    gain.connect(this.master);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.connect(gain);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      onEnded?.();
    };
    source.start(0);
    return { source, gain };
  }

  private stopVoice(voice: Voice | null): void {
    if (!voice || !this.ctx) return;
    const t = this.ctx.currentTime;
    try {
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
      voice.gain.gain.linearRampToValueAtTime(0, t + FADE_OUT);
      voice.source.stop(t + FADE_OUT);
    } catch {
      /* déjà arrêté */
    }
  }

  /** Événement `onAction` du mode `buttons`. */
  onAction(id: string, phase: ActionPhase): void {
    if (this.disposed) return;
    if (phase === "start") {
      this.stopVoice(this.action?.voice ?? null);
      const def = this.sounds.actions[id];
      const launch = ++this.launch;
      this.action = { id, launch, loop: def?.loop ?? false, voice: null };
      if (!def || !this.ctx) return;
      void this.decode(def.sound).then((buf) => {
        const cur = this.action;
        // Lancement toujours en cours (ni interrompu, ni fini en boucle, ni remplacé) : le son part, même s'il arrive tard
        if (!buf || this.disposed || !cur || cur.launch !== launch) return;
        cur.voice = this.play(buf, cur.loop, () => {
          if (this.action === cur) this.action = null;
        });
      });
      return;
    }
    // Interruption (relance comprise) : sons d'événement de l'action coupés, ceux pas encore décodés annulés (AC2)
    if (phase === "interrupt") this.stopEventSounds(id);
    const cur = this.action;
    if (!cur || cur.id !== id) return;
    // `interrupt` ou `end` : le son s'arrête avec l'action ; un son pas encore décodé ne partira plus
    this.stopVoice(cur.voice);
    this.action = null;
  }

  /** Événement `eventId` de l'action `actionId` franchi (mode `buttons`, AC2) : son joué en plus des sons en cours. */
  onEvent(actionId: string, eventId: string): void {
    if (this.disposed || !this.ctx) return;
    const path = this.sounds.events?.[actionId]?.[eventId];
    if (!path) return;
    const epoch = this.eventEpoch.get(actionId) ?? 0;
    void this.decode(path).then((buf) => {
      // Action interrompue pendant le décodage : le son ne part plus
      if (!buf || this.disposed || (this.eventEpoch.get(actionId) ?? 0) !== epoch) return;
      let set = this.eventVoices.get(actionId);
      if (!set) this.eventVoices.set(actionId, (set = new Set()));
      const voices = set;
      const voice = this.play(buf, false, () => voices.delete(voice!));
      if (voice) voices.add(voice);
    });
  }

  private stopEventSounds(actionId: string): void {
    this.eventEpoch.set(actionId, (this.eventEpoch.get(actionId) ?? 0) + 1);
    const set = this.eventVoices.get(actionId);
    if (!set) return;
    for (const v of set) this.stopVoice(v);
    set.clear();
  }

  private startAmbient(): void {
    this.stopVoice(this.ambient?.voice ?? null);
    const path = this.sounds.ambient;
    if (!path || !this.ctx) {
      this.ambient = null;
      return;
    }
    const amb: { path: string; voice: Voice | null } = { path, voice: null };
    this.ambient = amb;
    void this.decode(path).then((buf) => {
      if (!buf || this.disposed || this.ambient !== amb) return;
      amb.voice = this.play(buf, true);
    });
  }

  /** Arrêt de tous les sons et fermeture de l'`AudioContext` (déchargement de la scène, page masquée). */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    const eventVoices = [...this.eventVoices.values()].flatMap((set) => [...set]);
    this.eventVoices.clear();
    for (const v of [this.action?.voice, this.ambient?.voice, ...eventVoices]) {
      try {
        v?.source.stop();
      } catch {
        /* déjà arrêté */
      }
    }
    this.action = null;
    this.ambient = null;
    this.bytes.clear();
    this.buffers.clear();
    this.listeners.clear();
    this.blockedListeners.clear();
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
  }
}
