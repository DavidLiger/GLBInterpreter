// src/components/diorama/hooks/useUnifiedAudio.ts
//
// Audio de la fixture (modules réservés : ligne de temps `timeline` avec `sceneSound` et seek, ambiances par POI de la
// navigation entre POI), en `HTMLAudioElement`. Une scène v1 n'y passe pas : son par action et ambiance en Web Audio
// (`lib/audioEngine.ts`, Î11). Volume et sourdine viennent du moteur Web Audio (réglages communs, persistés par livre).
//
// Nettoyage Î11 (A-04, A-22, A-23, A-25, A-26, A-29) : un élément remplacé ou nettoyé est libéré (lecture arrêtée,
// écouteurs retirés, source retirée sans viser l'URL de la page, URL `blob:` révoquée) et n'est plus gardé dans une liste
// qui grossit ; le cache lu est celui du livre (`bookId`, et non plus `'folio'` codé en dur, A-05, A-10) ; un préchargement
// remplacé par un plus récent est abandonné (génération, A-13) et n'est plus relancé à chaque changement de volume.

import { useCallback, useEffect, useRef, useState } from "react";
import type { POI } from "@/types/diorama";

/** Attente maximale du son de scène avant de lancer la ligne de temps (A-14). */
const SCENE_AUDIO_WAIT_MS = 5000;

interface AudioState {
  isPlaying: boolean;
  isPaused: boolean;
  isEnded: boolean;
  currentSceneSound?: string;
}

interface UseUnifiedAudioProps {
  pois: POI[];
  currentPOI: string | null;
  audioState: AudioState;
  /** Livre dont le Cache Storage est lu (`ReaderScene.bookId`). */
  bookId: string;
  /** Réglages communs (moteur Web Audio, `useBookAudio`) : volume effectif et sourdine. */
  volume: number;
  muted: boolean;
}

/** URL `blob:` créée pour un élément (révoquée à sa libération). */
const blobUrls = new WeakMap<HTMLAudioElement, string>();
/** Écouteurs posés sur un élément (retirés à sa libération). */
const listeners = new WeakMap<HTMLAudioElement, Array<[string, EventListener]>>();

function listen(audio: HTMLAudioElement, type: string, fn: EventListener) {
  audio.addEventListener(type, fn);
  const l = listeners.get(audio) ?? [];
  l.push([type, fn]);
  listeners.set(audio, l);
}

/**
 * Libère un élément audio (A-04) : arrêt, écouteurs retirés (avant tout : sans cela, retirer la source déclenchait
 * l'écouteur d'erreur du préchargement), source retirée par `removeAttribute` (un `src = ''` fait charger l'URL de la
 * page), URL `blob:` révoquée.
 */
function releaseAudio(audio: HTMLAudioElement) {
  audio.pause();
  for (const [type, fn] of listeners.get(audio) ?? []) audio.removeEventListener(type, fn);
  listeners.delete(audio);
  audio.removeAttribute("src");
  audio.load();
  const url = blobUrls.get(audio);
  if (url) URL.revokeObjectURL(url);
  blobUrls.delete(audio);
}

/** Source d'un son : copie du Cache Storage du livre (URL `blob:`), sinon son URL. */
async function setSourceFromBook(audio: HTMLAudioElement, bookId: string, path: string) {
  try {
    const { getAssetFromCache } = await import("@/components/book/install/bookCache");
    const blob = await getAssetFromCache(bookId, path);
    if (blob) {
      const url = URL.createObjectURL(blob);
      blobUrls.set(audio, url);
      audio.src = url;
      return;
    }
  } catch {
    /* cache indisponible : URL */
  }
  audio.src = path;
}

function findPOIRecursively(poisList: POI[], id: string): POI | null {
  for (const poi of poisList) {
    if (poi.id === id) return poi;
    if (poi.children) {
      const found = findPOIRecursively(poi.children, id);
      if (found) return found;
    }
  }
  return null;
}

export default function useUnifiedAudio({ pois, currentPOI, audioState, bookId, volume, muted }: UseUnifiedAudioProps) {
  const ambientAudioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const sceneAudioRef = useRef<HTMLAudioElement | null>(null);
  const allAudiosRef = useRef<Set<HTMLAudioElement>>(new Set());
  const volumeRef = useRef({ volume, muted });
  volumeRef.current = { volume, muted };
  const [startSoundReady, setStartSoundReady] = useState(false);
  const previousPOIRef = useRef<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const playPromisesRef = useRef<Map<string, Promise<void>>>(new Map());
  const preloadedSceneAudioRef = useRef<HTMLAudioElement | null>(null);
  const sceneAudioReadyRef = useRef<Promise<void> | null>(null);
  const preloadGenRef = useRef(0);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** Élément suivi (volume commun appliqué, libéré au nettoyage). */
  const track = useCallback((audio: HTMLAudioElement) => {
    audio.muted = volumeRef.current.muted;
    audio.volume = volumeRef.current.volume;
    allAudiosRef.current.add(audio);
    return audio;
  }, []);
  const untrack = useCallback((audio: HTMLAudioElement | null) => {
    if (!audio) return;
    releaseAudio(audio);
    allAudiosRef.current.delete(audio);
  }, []);

  // Libération au démontage du lecteur (A-04)
  useEffect(() => {
    const all = allAudiosRef.current;
    const ambients = ambientAudioRefs;
    const preloadGen = preloadGenRef; // compteur : l'incrément abandonne le préchargement en cours
    const transitionTimer = transitionTimerRef;
    return () => {
      clearTimeout(transitionTimer.current);
      preloadGen.current++;
      all.forEach(releaseAudio);
      all.clear();
      ambients.current = {};
    };
  }, []);

  /** Geste de l'écran de démarrage : l'audio de la fixture peut jouer. */
  const enableAudio = useCallback(() => {
    setStartSoundReady(true);
  }, []);

  const getOrCreateAmbientAudio = useCallback(
    (poiId: string, audioUrl: string) => {
      const existing = ambientAudioRefs.current[poiId];
      if (existing) {
        if (existing.src === audioUrl || existing.src.endsWith(audioUrl)) return existing;
        untrack(existing);
      }
      const audio = new Audio();
      audio.src = audioUrl;
      audio.loop = true;
      audio.preload = "auto";
      ambientAudioRefs.current[poiId] = track(audio);
      return audio;
    },
    [track, untrack],
  );

  // Préchargement du son de scène (ligne de temps)
  const preloadSceneAudio = useCallback(
    async (sceneSound: string) => {
      const current = preloadedSceneAudioRef.current;
      if (current && current.dataset.sound === sceneSound) return;

      // Génération (A-13) : un préchargement remplacé par un plus récent est abandonné et libéré
      const gen = ++preloadGenRef.current;
      if (current && current !== sceneAudioRef.current) untrack(current);
      preloadedSceneAudioRef.current = null;

      const audio = new Audio();
      audio.dataset.sound = sceneSound;
      audio.loop = false;
      await setSourceFromBook(audio, bookId, sceneSound);
      if (gen !== preloadGenRef.current) {
        releaseAudio(audio);
        return;
      }
      track(audio);

      sceneAudioReadyRef.current = new Promise((resolve, reject) => {
        listen(audio, "canplaythrough", () => {
          if (gen !== preloadGenRef.current) return;
          preloadedSceneAudioRef.current = audio;
          resolve();
        });
        listen(audio, "error", () => {
          // Échec réel du chargement (fichier absent : 404, format refusé) : code MediaError et adresse demandée
          console.error(
            `❌ [AUDIO] Erreur préchargement « ${sceneSound} » (MediaError ${audio.error?.code ?? "?"}, ${audio.currentSrc || audio.src})`,
          );
          reject(audio.error);
        });
        audio.load();
      });

      await sceneAudioReadyRef.current;
    },
    [bookId, track, untrack],
  );

  // A-14 (Î10b) : attente bornée. `canplaythrough` peut ne jamais arriver (préchargement refusé sans geste, iOS) ;
  // l'animation part alors sans attendre le son. Le lanceur vérifie son jeton après l'attente (usePOIScenePlayer, P-04).
  const waitForSceneAudio = useCallback(async () => {
    const ready = sceneAudioReadyRef.current;
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        console.warn("⚠️ [AUDIO] Son de scène pas prêt après 5 s, lancement sans attendre");
        resolve();
      }, SCENE_AUDIO_WAIT_MS);
    });
    try {
      await Promise.race([ready, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }, []);

  // Ambiance du POI courant (hors scène)
  useEffect(() => {
    if (isTransitioning || !currentPOI || !startSoundReady) return;

    const poiHasChanged = previousPOIRef.current !== currentPOI;
    const isScenePlaying = audioState.isPlaying && !audioState.isEnded;

    // Arrêt de l'ambiance de l'ancien POI (après sa promesse de lecture)
    if (previousPOIRef.current && poiHasChanged) {
      const oldId = previousPOIRef.current;
      const oldAmbient = ambientAudioRefs.current[oldId];
      if (oldAmbient) {
        const stop = () => {
          oldAmbient.pause();
          oldAmbient.currentTime = 0;
        };
        const oldPromise = playPromisesRef.current.get(oldId);
        if (oldPromise) oldPromise.then(stop, stop).finally(() => playPromisesRef.current.delete(oldId));
        else stop();
      }
    }

    // Scène en cours : pas d'ambiance
    if (isScenePlaying) {
      previousPOIRef.current = currentPOI;
      return;
    }

    const poi = findPOIRecursively(pois, currentPOI);
    if (poi?.ambientSound) {
      const ambient = getOrCreateAmbientAudio(currentPOI, poi.ambientSound);
      const playPromise = ambient
        .play()
        .catch((err) => {
          console.error("❌ [AMBIENT] Erreur play:", err);
        })
        .finally(() => {
          playPromisesRef.current.delete(currentPOI);
        });
      playPromisesRef.current.set(currentPOI, playPromise);
    }

    previousPOIRef.current = currentPOI;
  }, [currentPOI, startSoundReady, audioState.isPlaying, audioState.isEnded, pois, getOrCreateAmbientAudio, isTransitioning]);

  // Changement de POI pendant une scène : arrêt du son de scène
  useEffect(() => {
    const a = sceneAudioRef.current;
    if (a && !a.paused) {
      a.pause();
      a.currentTime = 0;
      sceneAudioRef.current = null;
    }
  }, [currentPOI]);

  // Son de scène synchronisé avec le lecteur de la ligne de temps (création, lecture, pause)
  useEffect(() => {
    const isScenePlaying = audioState.isPlaying && !audioState.isEnded;

    if (isScenePlaying && !audioState.isPaused && audioState.currentSceneSound) {
      Object.values(ambientAudioRefs.current).forEach((audio) => audio.pause());

      const pre = preloadedSceneAudioRef.current;
      if (pre && pre.dataset.sound === audioState.currentSceneSound) {
        if (sceneAudioRef.current !== pre) sceneAudioRef.current = pre;
        if (pre.paused) pre.play().catch(() => {});
        return;
      }

      // Pas de préchargement prêt : nouvel élément (l'ancien est libéré)
      untrack(sceneAudioRef.current);
      const audio = new Audio();
      audio.dataset.sound = audioState.currentSceneSound;
      audio.loop = false;
      sceneAudioRef.current = track(audio);
      const sound = audioState.currentSceneSound;
      void (async () => {
        await setSourceFromBook(audio, bookId, sound);
        if (sceneAudioRef.current !== audio) return;
        listen(audio, "loadedmetadata", () => {
          audio.play().catch(() => {});
        });
        audio.load();
      })();
    } else if (audioState.isPaused && sceneAudioRef.current) {
      if (!sceneAudioRef.current.paused) sceneAudioRef.current.pause();
    } else if (audioState.isEnded && !isTransitioning) {
      if (sceneAudioRef.current) {
        sceneAudioRef.current.pause();
        sceneAudioRef.current.currentTime = 0;
        sceneAudioRef.current = null;
      }
      if (currentPOI) {
        const poi = findPOIRecursively(pois, currentPOI);
        if (poi?.ambientSound) {
          const ambient = getOrCreateAmbientAudio(currentPOI, poi.ambientSound);
          if (ambient.paused) ambient.play().catch(() => {});
        }
      }
    }
  }, [
    audioState.isPlaying,
    audioState.isPaused,
    audioState.isEnded,
    audioState.currentSceneSound,
    currentPOI,
    pois,
    getOrCreateAmbientAudio,
    isTransitioning,
    bookId,
    track,
    untrack,
  ]); // volume et sourdine : effet séparé

  // Volume et sourdine communs appliqués à tous les éléments de la fixture. Sur iOS, `HTMLAudioElement.volume` est
  // ignoré (A-28) : seule la sourdine y agit (fixture seulement ; une scène v1 passe par le gain Web Audio).
  useEffect(() => {
    for (const audio of allAudiosRef.current) {
      audio.volume = volume;
      audio.muted = muted;
    }
  }, [volume, muted]);

  // Seek (ligne de temps, module réservé `timeline`)
  const seekSceneAudio = useCallback((time: number) => {
    const audio = sceneAudioRef.current;
    if (!audio) return;
    const applySeek = () => {
      audio.currentTime = Math.min(time, audio.duration || 0);
    };
    if (audio.readyState >= 2) applySeek();
    else audio.addEventListener("canplay", applySeek, { once: true });
  }, []);

  // Avant un changement de POI (navigation entre POI, module réservé)
  const prepareForPOIChange = useCallback(() => {
    setIsTransitioning(true);
    Object.values(ambientAudioRefs.current).forEach((audio) => audio.pause());
    clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = setTimeout(() => setIsTransitioning(false), 1500);
  }, []);

  // useCallback([]) : ne dépend que de refs et d'un setter stable. Une fonction recréée à chaque
  // rendu faisait démonter/remonter les listeners de cycle de vie de WebDioramaLoader.
  const cleanup = useCallback(() => {
    setStartSoundReady(false);
    clearTimeout(transitionTimerRef.current);
    // Préchargement en cours abandonné ; élément de scène, ambiances et éléments suivis libérés (A-04)
    preloadGenRef.current++;
    allAudiosRef.current.forEach(releaseAudio);
    allAudiosRef.current.clear();
    sceneAudioRef.current = null;
    preloadedSceneAudioRef.current = null;
    sceneAudioReadyRef.current = null;
    ambientAudioRefs.current = {};
    playPromisesRef.current.clear();
  }, []);

  return {
    startSoundReady,
    enableAudio,
    seekSceneAudio,
    cleanup,
    sceneAudioRef,
    prepareForPOIChange,
    preloadSceneAudio,
    waitForSceneAudio,
  };
}
