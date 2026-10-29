"use client";
// Vue du mini-jeu (MJ2, spec-mini-jeu.md §3, §4) : tronc commun (rendu, boucle, entrées, affichage, audio, cycle de vie,
// orientation) et gabarit « poursuite / capture » (`poursuite.ts`). Sans dépendance à `WebDioramaLoader` (Î15 non
// nécessaire) : modules partagés du lecteur seulement (décodeurs, audio d'Î11, noms de nœuds, plein écran d'Î13bis).
//
// - Rendu comme le lecteur : pixelRatio 1 et sans anticrénelage sur mobile (décision du 28/10), 2 au plus ailleurs ;
//   rendu à la cadence de l'écran, physique à pas fixe de 1/60 s, rattrapage limité (`planSteps`), positions interpolées.
// - Écrans : consigne (« Jouer » : la partie ne démarre pas avant ; le geste reprend le son et redemande le plein écran,
//   règles d'Î13bis), pause (« Continuer »), fin (« Bravo ! », score, meilleur score, « Rejouer », « Retour au menu »).
// - Cycle de vie : page masquée → boucle arrêtée, `AudioContext` suspendu, partie gardée en mémoire, puis écran de pause ;
//   sortie (« Retour au menu », démontage) → monde Rapier et contrôleur libérés, GPU libéré (géométries, matériaux,
//   textures, contexte WebGL), sons arrêtés et `AudioContext` fermé.
// - Débogage sans Mac et tests : `window.__glbiGame.state()` (phase, score, temps, positions) ; options de test lues dans
//   `window.__glbiGameTest` à chaque partie (durée raccourcie, proies immobiles, proie posée).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Pause } from "lucide-react";
import { useTranslation } from "@/contexts/TranslationContext";
import LanguageSelector from "@/components/diorama/ui/LanguageSelector";
import RotateHint from "@/components/diorama/ui/RotateHint";
import VolumeControl from "@/components/diorama/audio/VolumeControl";
import { useOrientation } from "@/components/diorama/hooks/useOrientation";
import { FULLSCREEN_CHANGE_EVENTS, isPageFullscreen, requestPageFullscreen } from "@/components/diorama/lib/pageFullscreen";
import { AudioEngine, type AudioSettings, type SceneSounds } from "@/components/diorama/lib/audioEngine";
import type { GLTFLoaderWithDecoders } from "@/components/diorama/lib/gltfDecoders";
import { pageStorage } from "@/components/book/progress";
import { loadRapier, type Rapier } from "./rapier";
import { GameWorld, STEP, planSteps } from "./world";
import { PoursuiteGame, POURSUITE_BUTTONS, type Actor, type EntitySpec, type PoursuiteOptions } from "./poursuite";
import { GameScene, loadGameAssets } from "./scene";
import { InputCollector, isGameKey, keyButtonIndex, isMoveKey, PAUSE_KEY, readGamepad, type GamepadLike, type PadState } from "./input";
import { GameStore, type ControlSettings } from "./gameStorage";
import TouchControls from "./TouchControls";
import { ControlsPanel, GameScreen, InputHelp, fill } from "./GameScreens";
import type { ReaderGame } from "./gameSource";

type Phase = "loading" | "intro" | "playing" | "paused" | "ended" | "error";

/** Débogage (console Eruda, `#/debug`) et tests de navigateur. */
export interface GameDebugState {
  phase: Phase;
  score: number;
  remaining: number;
  steps: number;
  frames: number;
  bondReady: boolean;
  player: { x: number; y: number; z: number; clip: string } | null;
  preys: { x: number; z: number; state: string }[];
  faded: number;
  pixelRatio: number;
  /** Mesures de la partie en cours (essais sur téléphone) : images par seconde (dernière seconde, pire seconde), pire
   *  image (ms), temps abandonné par le rattrapage limité (s), coût moyen et pire d'un pas physique (ms). */
  perf: { fps: number; worstFps: number; worstFrameMs: number; droppedS: number; stepMs: number; worstStepMs: number };
}
declare global {
  interface Window {
    __glbiGame?: { state: () => GameDebugState };
    __glbiGameTest?: PoursuiteOptions;
  }
}

const IS_MOBILE = typeof navigator !== "undefined" && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const NO_BUTTONS: readonly boolean[] = [false, false, false, false];
const EVENT_ACTION = "jeu";

/** Première manette à disposition standard. */
function firstPad(): GamepadLike | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  for (const gp of navigator.getGamepads()) if (gp && gp.connected && gp.mapping === "standard") return gp;
  return null;
}

const clock = (s: number) => {
  const t = Math.ceil(Math.max(0, s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

interface Runtime {
  renderer: THREE.WebGLRenderer;
  scene: GameScene | null;
  decoders: GLTFLoaderWithDecoders | null;
  R: Rapier | null;
  world: GameWorld | null;
  game: PoursuiteGame | null;
  /** Joueur puis proies, dans l'ordre des personnages dessinés (gardé d'une image à l'autre). */
  actors: Actor[];
  specs: EntitySpec[];
  /** Derniers chrono et score écrits dans l'affichage (écrits seulement s'ils changent). */
  hud: string;
  acc: number;
  raf: number;
  last: number;
  frames: number;
  /** Image rendue depuis le dernier changement (la pause n'en redessine pas d'autre). */
  drawn: boolean;
  lost: boolean;
  perf: Perf;
}

/** Mesures d'une partie (remises à zéro à chaque partie). */
interface Perf {
  t0: number;
  frames: number;
  fps: number;
  worstFps: number;
  worstFrame: number;
  dropped: number;
  stepTime: number;
  stepCount: number;
  worstStep: number;
}
const newPerf = (): Perf => ({ t0: 0, frames: 0, fps: 0, worstFps: 0, worstFrame: 0, dropped: 0, stepTime: 0, stepCount: 0, worstStep: 0 });

interface GameViewProps {
  bookId: string;
  game: ReaderGame;
  onBack: () => void;
}

export default function GameView({ bookId, game, onBack }: GameViewProps) {
  const { t, lang } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const rt = useRef<Runtime | null>(null);
  const [phase, setPhaseState] = useState<Phase>("loading");
  const phaseRef = useRef<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const store = useMemo(() => new GameStore(bookId, pageStorage()), [bookId]);
  const [controls, setControlsState] = useState<ControlSettings>(() => store.controls());
  const [result, setResult] = useState<{ score: number; best: number; record: boolean } | null>(null);
  const [best, setBest] = useState<number | null>(() => store.best());
  const input = useMemo(() => new InputCollector(), []);
  const audioRef = useRef<AudioEngine | null>(null);
  const [audio, setAudio] = useState<AudioSettings | null>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [keyboard, setKeyboard] = useState(false);
  const [gamepad, setGamepad] = useState(false);
  const { showRotateHint, dismissRotateHint } = useOrientation(5000, phase === "intro" || phase === "playing");
  const buttonLabels = POURSUITE_BUTTONS.map((b) => t.jeu.buttons[b]);
  const loopRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  /** Actions appelées par la boucle et le clavier : lues à chaque appel (pas de version figée au montage). */
  const fns = useRef<{ pause: () => void; end: () => void; resume: () => void; padOnScreens: (pad: PadState | null) => void }>({
    pause: () => {},
    end: () => {},
    resume: () => {},
    padOnScreens: () => {},
  });

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
    const r = rt.current;
    if (r) r.drawn = false;
    input.clear();
  }, [input]);

  const sounds = useCallback(
    (withMusic: boolean): SceneSounds => {
      const ev: Record<string, string> = {};
      for (const k of ["capture", "jump", "end"] as const) if (game.sounds[k]) ev[k] = game.sounds[k]!;
      return { ...(withMusic && game.sounds.music ? { ambient: game.sounds.music } : {}), actions: {}, events: { [EVENT_ACTION]: ev } };
    },
    [game],
  );

  /** Nouvelle partie : monde Rapier neuf (l'ancien est libéré), personnages redessinés. */
  const newGame = useCallback(() => {
    const r = rt.current;
    if (!r || !r.R || !r.scene) return;
    r.world?.free();
    const world = new GameWorld(r.R, r.scene.assets.arenaDesc);
    const opts = typeof window !== "undefined" ? window.__glbiGameTest ?? {} : {};
    const g = new PoursuiteGame(world, r.specs, game.rules, { seed: (Date.now() & 0xffff) + 1, ...opts });
    r.world = world;
    r.game = g;
    r.actors = [g.player, ...g.preys];
    r.acc = 0;
    r.hud = "";
    r.perf = newPerf();
    r.scene.setActors(r.actors);
  }, [game]);

  // ────────────── Montage : rendu, chargement (Rapier et GLB en parallèle), boucle ──────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let alive = true;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !IS_MOBILE, powerPreference: "high-performance", alpha: false });
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
      return;
    }
    renderer.setPixelRatio(IS_MOBILE ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
    renderer.domElement.style.display = "block";
    renderer.domElement.setAttribute("data-testid", "game-canvas");
    container.appendChild(renderer.domElement);
    const r: Runtime = { renderer, scene: null, decoders: null, R: null, world: null, game: null, actors: [], specs: [], hud: "", acc: 0, raf: 0, last: 0, frames: 0, drawn: false, lost: false, perf: newPerf() };
    rt.current = r;

    const onLost = (e: Event) => {
      e.preventDefault();
      r.lost = true;
      cancelAnimationFrame(r.raf);
      r.raf = 0;
      setError(null);
      setPhase("error");
      console.error("[JEU] contexte WebGL perdu");
    };
    renderer.domElement.addEventListener("webglcontextlost", onLost);

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      r.scene?.resize(w, h);
      r.drawn = false;
    });
    ro.observe(container);

    const audioEngine = new AudioEngine({ bookId });
    audioRef.current = audioEngine;
    setAudio(audioEngine.getSettings());
    const offAudio = audioEngine.subscribe(setAudio);
    audioEngine.setSounds(sounds(false));

    // Boucle unique : physique à pas fixe pendant la partie, rendu à chaque image.
    const frame = (now: number) => {
      r.raf = requestAnimationFrame(frame);
      const dt = r.last ? (now - r.last) / 1000 : 0;
      r.last = now;
      const g = r.game;
      const scene = r.scene;
      if (!g || !scene) return;
      const ph = phaseRef.current;
      const pad = readGamepad(firstPad());
      if (ph === "playing") {
        const { move, buttons, pause } = input.read(pad);
        if (pause) {
          fns.current.pause();
          return;
        }
        const plan = planSteps(r.acc, dt);
        r.acc = plan.acc;
        const pf = r.perf;
        for (let i = 0; i < plan.steps; i++) {
          const t = performance.now();
          g.step({ move, buttons: i === 0 ? buttons : NO_BUTTONS });
          const ms = performance.now() - t;
          pf.stepTime += ms;
          pf.stepCount++;
          if (ms > pf.worstStep) pf.worstStep = ms;
        }
        pf.dropped += plan.dropped;
        if (dt > pf.worstFrame) pf.worstFrame = dt;
        pf.frames++;
        if (!pf.t0) pf.t0 = now;
        else if (now - pf.t0 >= 1000) {
          pf.fps = (pf.frames * 1000) / (now - pf.t0);
          pf.worstFps = pf.worstFps ? Math.min(pf.worstFps, pf.fps) : pf.fps;
          pf.frames = 0;
          pf.t0 = now;
        }
        for (const ev of g.drainEvents()) {
          if (ev === "capture" || ev === "jump") audioEngine.onEvent(EVENT_ACTION, ev);
        }
        const time = clock(g.remaining);
        const hud = `${time}|${g.score}`;
        if (hud !== r.hud) {
          r.hud = hud;
          if (timeRef.current) timeRef.current.textContent = time;
          if (scoreRef.current) scoreRef.current.textContent = String(g.score);
        }
        const ready = String(g.bondReady);
        const b0 = buttonRefs.current[0];
        if (b0 && b0.dataset.ready !== ready) b0.dataset.ready = ready;
        if (g.over) fns.current.end();
      } else {
        // Écrans : manette (A = Jouer, Rejouer, Continuer ; Start = Continuer).
        fns.current.padOnScreens(pad);
      }
      const animate = phaseRef.current !== "paused";
      if (!animate && r.drawn) return;
      scene.update(r.actors, phaseRef.current === "playing" ? r.acc / STEP : 1, dt, animate);
      renderer.render(scene.scene, scene.camera);
      r.drawn = true;
      r.frames++;
    };
    const start = () => {
      if (r.raf || r.lost || !alive) return;
      r.last = 0;
      r.raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(r.raf);
      r.raf = 0;
    };
    loopRef.current = { start, stop };

    Promise.all([loadRapier(), loadGameAssets(renderer, game)])
      .then(([R, { assets, decoders }]) => {
        if (!alive) {
          decoders.dispose();
          return;
        }
        r.R = R;
        r.decoders = decoders;
        r.scene = new GameScene(assets, game.camera.distance);
        r.scene.resize(container.clientWidth || 1, container.clientHeight || 1);
        r.specs = game.entities.map((e) => ({ id: e.id, role: e.role, capsule: assets.entities.get(e.id)!.capsule }));
        newGame();
        setPhase("intro");
        if (!document.hidden) start();
      })
      .catch((e: Error) => {
        if (!alive) return;
        console.error("[JEU] chargement impossible :", e);
        setError(e.message);
        setPhase("error");
      });

    window.__glbiGame = {
      state: () => {
        const g = r.game;
        const p = g?.player.char.pos;
        return {
          phase: phaseRef.current,
          score: g?.score ?? 0,
          remaining: g?.remaining ?? 0,
          steps: r.world?.steps ?? 0,
          frames: r.frames,
          bondReady: g?.bondReady ?? false,
          player: g && p ? { x: p.x, y: p.y, z: p.z, clip: g.player.clip } : null,
          preys: g ? g.preys.map((q) => ({ x: q.char.pos.x, z: q.char.pos.z, state: q.state })) : [],
          faded: r.scene?.fadedCount ?? 0,
          pixelRatio: renderer.getPixelRatio(),
          perf: {
            fps: Math.round(r.perf.fps * 10) / 10,
            worstFps: Math.round(r.perf.worstFps * 10) / 10,
            worstFrameMs: Math.round(r.perf.worstFrame * 1000),
            droppedS: Math.round(r.perf.dropped * 1000) / 1000,
            stepMs: r.perf.stepCount ? Math.round((r.perf.stepTime / r.perf.stepCount) * 100) / 100 : 0,
            worstStepMs: Math.round(r.perf.worstStep * 100) / 100,
          },
        };
      },
    };

    return () => {
      alive = false;
      stop();
      loopRef.current = null;
      ro.disconnect();
      offAudio();
      audioEngine.dispose();
      audioRef.current = null;
      r.world?.free();
      r.world = null;
      r.game = null;
      r.scene?.dispose();
      r.scene = null;
      r.decoders?.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      rt.current = null;
      if (window.__glbiGame) delete window.__glbiGame;
    };
    // Monté une fois par entrée dans le jeu (`game` et `bookId` fixés par GameEntry).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ────────────── Actions des écrans (dans le geste : son et plein écran) ──────────────
  const play = useCallback(() => {
    if (phaseRef.current !== "intro" && phaseRef.current !== "ended") return;
    requestPageFullscreen();
    if (phaseRef.current === "ended") newGame();
    const a = audioRef.current;
    a?.unlock();
    a?.setSounds(sounds(true));
    setResult(null);
    setPhase("playing");
    if (rt.current) rt.current.acc = 0;
  }, [newGame, setPhase, sounds]);

  const resume = useCallback(() => {
    if (phaseRef.current !== "paused") return;
    requestPageFullscreen();
    audioRef.current?.unlock();
    const r = rt.current;
    if (r) {
      r.acc = 0;
      // La pause ne compte pas dans les images par seconde.
      r.perf.t0 = 0;
      r.perf.frames = 0;
    }
    setPhase("playing");
  }, [setPhase]);

  const pauseGame = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    audioRef.current?.suspend();
    setPhase("paused");
  }, [setPhase]);

  const endGame = useCallback(() => {
    const g = rt.current?.game;
    if (!g || phaseRef.current !== "playing") return;
    const a = audioRef.current;
    a?.setSounds(sounds(false)); // musique arrêtée
    a?.onEvent(EVENT_ACTION, "end");
    const rec = store.recordScore(g.score);
    setResult({ score: g.score, best: rec.best, record: rec.record });
    setBest(rec.best);
    setPhase("ended");
  }, [setPhase, sounds, store]);

  const padPrev = useRef<boolean[]>([false, false]);
  const padOnScreens = useCallback(
    (pad: PadState | null) => {
      const now = [!!pad?.buttons[0], !!pad?.pause];
      const a = now[0] && !padPrev.current[0];
      const s = now[1] && !padPrev.current[1];
      padPrev.current = now;
      if (!a && !s) return;
      const ph = phaseRef.current;
      if (ph === "paused") resume();
      else if (a && (ph === "intro" || ph === "ended")) play();
    },
    [play, resume],
  );

  fns.current = { pause: pauseGame, end: endGame, resume, padOnScreens };

  const setControls = useCallback(
    (s: ControlSettings) => {
      store.setControls(s);
      setControlsState(store.controls());
    },
    [store],
  );

  // ────────────── Page masquée : boucle arrêtée, son suspendu, pause ──────────────
  useEffect(() => {
    const onVisibility = () => {
      const loop = loopRef.current;
      if (document.hidden) {
        loop?.stop();
        input.clear();
        if (phaseRef.current === "playing") {
          phaseRef.current = "paused";
          setPhaseState("paused");
          if (rt.current) rt.current.drawn = false;
        }
        audioRef.current?.suspend();
      } else if (phaseRef.current !== "loading" && phaseRef.current !== "error") {
        loop?.start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [input]);

  // ────────────── Sortie du plein écran pendant la partie : pause (décision de David du 29/10, option B) ──────────────
  // En plein écran, le premier Échap (ordinateur) et le bouton Retour (Android) font sortir du plein écran sans que la page
  // reçoive la touche : la partie se met en pause, comme avec Échap hors plein écran. Un Échap qui arriverait aussi à la
  // page juste après (selon le navigateur) ne relance pas aussitôt la partie (`fsPauseAt`).
  const fsPauseAt = useRef(-Infinity);
  useEffect(() => {
    const onChange = () => {
      if (isPageFullscreen() || phaseRef.current !== "playing") return;
      fsPauseAt.current = performance.now();
      fns.current.pause();
    };
    for (const type of FULLSCREEN_CHANGE_EVENTS) document.addEventListener(type, onChange);
    return () => {
      for (const type of FULLSCREEN_CHANGE_EVENTS) document.removeEventListener(type, onChange);
    };
  }, []);

  // ────────────── Clavier (DP-26) ──────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const ph = phaseRef.current;
      if (e.code === PAUSE_KEY) {
        if (ph === "playing") input.requestPause();
        else if (ph === "paused" && performance.now() - fsPauseAt.current > 400) fns.current.resume();
        return;
      }
      if (ph !== "playing" || !isGameKey(e.code)) return;
      e.preventDefault();
      if (isMoveKey(e.code)) input.keys.add(e.code);
      const b = keyButtonIndex(e.code);
      if (b >= 0 && !e.repeat) input.press(b);
    };
    const up = (e: KeyboardEvent) => {
      input.keys.delete(e.code);
    };
    const blur = () => input.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [input]);

  // Clavier présent (aide affichée) : appareil à souris (survol et pointeur fin) ; manette branchée.
  useEffect(() => {
    setKeyboard(window.matchMedia?.("(hover: hover) and (pointer: fine)").matches ?? false);
    const pads = () => setGamepad(!!firstPad());
    pads();
    window.addEventListener("gamepadconnected", pads);
    window.addEventListener("gamepaddisconnected", pads);
    return () => {
      window.removeEventListener("gamepadconnected", pads);
      window.removeEventListener("gamepaddisconnected", pads);
    };
  }, []);

  const corner = (
    <div className="glbi-corner-top-right z-40 flex items-start gap-2 p-2">
      {audio && (
        <VolumeControl volume={audio.volume} muted={audio.muted} onVolumeChange={(v) => audioRef.current?.setVolume(v)} onToggleMute={() => audioRef.current?.toggleMute()} />
      )}
      <LanguageSelector />
    </div>
  );
  const back = (
    <button type="button" className="glbi-btn glbi-btn-secondary px-6 py-3" onClick={onBack} data-testid="game-back">
      {t.collection.backToMenu}
    </button>
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-white" data-testid="game-view" data-phase={phase}>
      <div ref={containerRef} className="absolute inset-0" />

      {phase === "playing" && (
        <>
          <TouchControls input={input} settings={controls} buttons={buttonLabels} joystickLabel={t.jeu.joystick} enabled buttonRefs={buttonRefs} />
          <div className="glbi-corner-top-left z-20 p-2">
            <button type="button" className="glbi-icon-btn" aria-label={t.jeu.pause} onClick={pauseGame} data-testid="game-pause">
              <Pause className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center gap-3" style={{ top: "calc(var(--safe-top) + 0.5rem)" }}>
            <span className="glbi-game-hud" aria-label={t.jeu.time}>
              ⏱ <span ref={timeRef} data-testid="game-time">{clock(rt.current?.game?.remaining ?? game.rules.duration)}</span>
            </span>
            <span className="glbi-game-hud" aria-label={t.jeu.score}>
              ★ <span ref={scoreRef} data-testid="game-score">{rt.current?.game?.score ?? 0}</span>
            </span>
          </div>
        </>
      )}

      {phase === "loading" && (
        <GameScreen testId="game-loading" label={t.jeu.loading}>
          {corner}
          <p role="status" className="text-white/85">{t.jeu.loading}</p>
          {back}
        </GameScreen>
      )}

      {phase === "intro" && (
        <GameScreen testId="game-intro" label={game.title[lang]}>
          {corner}
          <h1 className="text-2xl font-bold" data-testid="game-title">{game.title[lang]}</h1>
          <p className="max-w-md text-white/85" data-testid="game-instructions">{game.instructions[lang]}</p>
          {best !== null && <p className="text-white/80" data-testid="game-best">{fill(t.jeu.best, { n: best })}</p>}
          <button type="button" className="glbi-btn glbi-btn-primary px-10 py-3 text-lg" onClick={play} autoFocus data-testid="game-play">
            {t.jeu.play}
          </button>
          <ControlsPanel settings={controls} onChange={setControls} />
          <InputHelp keyboard={keyboard} gamepad={gamepad} buttons={buttonLabels} />
          {back}
        </GameScreen>
      )}

      {phase === "paused" && (
        <GameScreen testId="game-paused" label={t.jeu.pause}>
          {corner}
          <h1 className="text-2xl font-bold">{t.jeu.pause}</h1>
          <button type="button" className="glbi-btn glbi-btn-primary px-10 py-3 text-lg" onClick={resume} autoFocus data-testid="game-resume">
            {t.jeu.resume}
          </button>
          <ControlsPanel settings={controls} onChange={setControls} />
          {back}
        </GameScreen>
      )}

      {phase === "ended" && result && (
        <GameScreen testId="game-end" label={t.jeu.endTitle}>
          {corner}
          <h1 className="text-3xl font-bold" data-testid="game-end-title">{t.jeu.endTitle}</h1>
          {game.end && <p className="max-w-md text-white/85">{game.end[lang]}</p>}
          <p className="text-2xl font-bold" data-testid="game-final-score">{fill(t.jeu.finalScore, { n: result.score })}</p>
          {result.record ? (
            <p className="font-bold text-amber-300" role="status" data-testid="game-record">{t.jeu.newRecord}</p>
          ) : (
            <p className="text-white/80" data-testid="game-best">{fill(t.jeu.best, { n: result.best })}</p>
          )}
          <button type="button" className="glbi-btn glbi-btn-primary px-10 py-3 text-lg" onClick={play} autoFocus data-testid="game-replay">
            {t.jeu.replay}
          </button>
          {back}
        </GameScreen>
      )}

      {phase === "error" && (
        <GameScreen testId="game-error" label={t.jeu.error}>
          {corner}
          <p className="max-w-md text-white/85">{rt.current?.lost || !error ? t.jeu.lost : t.jeu.error}</p>
          {error && (
            <p className="max-w-md break-words text-sm text-white/60" lang="fr">
              {error}
            </p>
          )}
          {back}
        </GameScreen>
      )}

      <RotateHint show={showRotateHint} onDismiss={dismissRotateHint} />
    </div>
  );
}
