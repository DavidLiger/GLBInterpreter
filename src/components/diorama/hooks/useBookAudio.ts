// src/components/diorama/hooks/useBookAudio.ts
//
// Audio Web Audio du lecteur (Î11, `lib/audioEngine.ts`) : un moteur par montage du lecteur, libéré au démontage
// (changement de scène, remontage par l'atelier) ou à la page masquée (`release`). Réglages (volume, sourdine) partagés
// avec l'ancien audio de la fixture (`useUnifiedAudio`, modules réservés) et persistés par livre.
//
// Déblocage (Î13bis) : `unlock` est appelé dans le geste de l'écran de démarrage (fixture, atelier). Pour une scène v1 du
// livre, sans écran de démarrage, `autoUnlock` le fait au lancement de la scène, hors geste ; si le navigateur garde
// l'`AudioContext` suspendu (`blocked` : aucun geste encore reçu par la page), le premier geste de la page (toucher, clic,
// touche du clavier, écouté en capture sans être retenu) le reprend.
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioEngine, parseAudioSettings, audioSettingsKey, type ActionPhase, type AudioSettings, type SceneSounds } from "../lib/audioEngine";

function readSettings(bookId: string): AudioSettings {
  try {
    return parseAudioSettings(typeof localStorage === "undefined" ? null : localStorage.getItem(audioSettingsKey(bookId)));
  } catch {
    return parseAudioSettings(null);
  }
}

/** Gestes qui donnent à la page le droit de jouer du son (activation) : `pointerup` au doigt, `mousedown` à la souris. */
const GESTURE_EVENTS = ["pointerup", "touchend", "mousedown", "keydown", "click"] as const;

/** Geste reconnu par le navigateur : Échap ne compte pas (règle d'activation). */
export const isActivationGesture = (e: Event) => !(e instanceof KeyboardEvent && e.key === "Escape");

export default function useBookAudio(bookId: string, sounds: SceneSounds, autoUnlock = false) {
  const engineRef = useRef<AudioEngine | null>(null);
  const [settings, setSettings] = useState<AudioSettings>(() => readSettings(bookId));
  const [blocked, setBlocked] = useState(false);
  const soundsRef = useRef(sounds);
  soundsRef.current = sounds;

  useEffect(() => {
    const engine = new AudioEngine({ bookId });
    engineRef.current = engine;
    setSettings(engine.getSettings());
    const off = engine.subscribe(setSettings);
    const offBlocked = engine.onBlockedChange(setBlocked);
    engine.setSounds(soundsRef.current);
    return () => {
      off();
      offBlocked();
      engine.dispose();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [bookId]);

  // Sons changés sans remontage (atelier : saisie d'un son dans l'onglet Actions ou Ambiance)
  const soundsKey = JSON.stringify(sounds);
  useEffect(() => {
    engineRef.current?.setSounds(soundsRef.current);
  }, [soundsKey]);

  /** Dans le geste de l'écran de démarrage. */
  const unlock = useCallback(() => engineRef.current?.unlock(), []);

  // Scène v1 du livre (Î13bis) : déblocage au lancement, puis au premier geste de la page tant que le son est bloqué
  useEffect(() => {
    if (!autoUnlock) return;
    engineRef.current?.unlock();
    const onGesture = (e: Event) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (!isActivationGesture(e)) return;
      if (engine.blocked) engine.unlock();
    };
    for (const type of GESTURE_EVENTS) window.addEventListener(type, onGesture, true);
    return () => {
      for (const type of GESTURE_EVENTS) window.removeEventListener(type, onGesture, true);
    };
  }, [autoUnlock]);
  const onAction = useCallback((id: string, phase: ActionPhase) => engineRef.current?.onAction(id, phase), []);
  const setVolume = useCallback((v: number) => engineRef.current?.setVolume(v), []);
  const toggleMute = useCallback(() => engineRef.current?.toggleMute(), []);
  /** Page masquée : le lecteur est libéré puis rechargé (WebDioramaLoader) ; l'audio s'arrête avec lui. */
  const release = useCallback(() => {
    engineRef.current?.dispose();
    engineRef.current = null;
    setBlocked(false);
  }, []);

  return { settings, blocked, unlock, onAction, setVolume, toggleMute, release };
}
