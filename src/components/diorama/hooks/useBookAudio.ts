// src/components/diorama/hooks/useBookAudio.ts
//
// Audio Web Audio du lecteur (Î11, `lib/audioEngine.ts`) : un moteur par montage du lecteur, libéré au démontage
// (changement de scène, remontage par l'atelier) ou à la page masquée (`release`). Réglages (volume, sourdine) partagés
// avec l'ancien audio de la fixture (`useUnifiedAudio`, modules réservés) et persistés par livre.
import { useCallback, useEffect, useRef, useState } from "react";
import { AudioEngine, parseAudioSettings, audioSettingsKey, type ActionPhase, type AudioSettings, type SceneSounds } from "../lib/audioEngine";

function readSettings(bookId: string): AudioSettings {
  try {
    return parseAudioSettings(typeof localStorage === "undefined" ? null : localStorage.getItem(audioSettingsKey(bookId)));
  } catch {
    return parseAudioSettings(null);
  }
}

export default function useBookAudio(bookId: string, sounds: SceneSounds) {
  const engineRef = useRef<AudioEngine | null>(null);
  const [settings, setSettings] = useState<AudioSettings>(() => readSettings(bookId));
  const soundsRef = useRef(sounds);
  soundsRef.current = sounds;

  useEffect(() => {
    const engine = new AudioEngine({ bookId });
    engineRef.current = engine;
    setSettings(engine.getSettings());
    const off = engine.subscribe(setSettings);
    engine.setSounds(soundsRef.current);
    return () => {
      off();
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
  const onAction = useCallback((id: string, phase: ActionPhase) => engineRef.current?.onAction(id, phase), []);
  const setVolume = useCallback((v: number) => engineRef.current?.setVolume(v), []);
  const toggleMute = useCallback(() => engineRef.current?.toggleMute(), []);
  /** Page masquée : le lecteur est libéré puis rechargé (WebDioramaLoader) ; l'audio s'arrête avec lui. */
  const release = useCallback(() => {
    engineRef.current?.dispose();
    engineRef.current = null;
  }, []);

  return { settings, unlock, onAction, setVolume, toggleMute, release };
}
