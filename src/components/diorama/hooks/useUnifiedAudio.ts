// src/components/diorama/hooks/useUnifiedAudio.ts

import { useCallback, useEffect, useRef, useState } from "react";
import type { POI } from "@/types/diorama";

interface AudioState {
  isPlaying: boolean;
  isPaused: boolean;
  isEnded: boolean;
  currentSceneSound?: string;
  currentTime?: number;
}

interface UseUnifiedAudioProps {
  pois: POI[];
  currentPOI: string | null;
  audioState: AudioState;
}

export default function useUnifiedAudio({ 
  pois, 
  currentPOI, 
  audioState 
}: UseUnifiedAudioProps) {
  
  const ambientAudioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const sceneAudioRef = useRef<HTMLAudioElement | null>(null);
  const allAudiosRef = useRef<HTMLAudioElement[]>([]);
  const [muted, setMuted] = useState(false);
  const [startSoundReady, setStartSoundReady] = useState(false);
  const previousPOIRef = useRef<string | null>(null);

    // ══════════════════════════════════════
    // 1. CRÉATION LAZY DES AUDIOS (au lieu de preload)
    // ══════════════════════════════════════
    useEffect(() => {
        // ✅ On ne fait rien au montage, on crée les audios au moment du play
        // setStartSoundReady(true);
        
        return () => {
            // Cleanup
            Object.values(ambientAudioRefs.current).forEach(audio => {
                audio.pause();
                audio.src = '';
            });
            allAudiosRef.current.forEach(audio => {
                audio.pause();
                audio.src = '';
            });
        };
    }, []);

    // ✅ AJOUTER une fonction pour activer après interaction
    const enableAudio = useCallback(() => {
        console.log("🔓 [AUDIO] Activation après interaction utilisateur");
        setStartSoundReady(true);
    }, []);

    // ══════════════════════════════════════
    // 2. FONCTION HELPER pour créer/récupérer audio
    // ══════════════════════════════════════
    const getOrCreateAmbientAudio = useCallback((poiId: string, audioUrl: string) => {
    // Si existe déjà et src correct, retourner
    if (ambientAudioRefs.current[poiId]) {
        const existing = ambientAudioRefs.current[poiId];
        if (existing.src === audioUrl || existing.src.endsWith(audioUrl)) {
        console.log("♻️ [AMBIENT] Audio existant réutilisé:", poiId);
        return existing;
        } else {
        // Src invalide, recréer
        console.log("🔄 [AMBIENT] Src corrompu, recréation:", poiId);
        existing.pause();
        existing.src = '';
        }
    }
    
    // Créer nouveau
    console.log("🆕 [AMBIENT] Création audio:", poiId, audioUrl);
    const audio = new Audio();
    audio.src = audioUrl;
    audio.loop = true;
    audio.muted = true;
    audio.preload = "auto";
    ambientAudioRefs.current[poiId] = audio;
    allAudiosRef.current.push(audio);
    return audio;
    }, []);

    // ══════════════════════════════════════
    // 3. GESTION AMBIENT (avec création lazy)
    // ══════════════════════════════════════
    useEffect(() => {
    console.log("🎵 [AMBIENT] Check:", { 
        currentPOI, 
        startSoundReady, 
        isPlaying: audioState.isPlaying, 
        isEnded: audioState.isEnded,
        muted 
    });
    
    if (!currentPOI || !startSoundReady) {
        console.log("⏸️ [AMBIENT] Early return (pas de POI ou pas ready)");
        return;
    }

    const isScenePlaying = audioState.isPlaying && !audioState.isEnded;
    console.log("🎵 [AMBIENT] isScenePlaying:", isScenePlaying);
    
    // Arrêter ancien POI
    if (previousPOIRef.current && previousPOIRef.current !== currentPOI) {
        const oldAmbient = ambientAudioRefs.current[previousPOIRef.current];
        if (oldAmbient) {
        console.log("⏹️ [AMBIENT] Stop ancien:", previousPOIRef.current);
        oldAmbient.pause();
        oldAmbient.currentTime = 0;
        }
    }

    // Play nouveau POI (sauf si scène en cours)
    if (!isScenePlaying) {
        // ✅ Trouver l'URL dans la config
        const poi = pois.find(p => p.id === currentPOI) || 
                    findPOIRecursively(pois, currentPOI);
        
        if (poi?.ambientSound) {
        const ambient = getOrCreateAmbientAudio(currentPOI, poi.ambientSound);
        console.log("▶️ [AMBIENT] Play:", currentPOI, "src:", ambient.src, "muted:", muted);
        ambient.muted = muted;
        ambient.play()
            .then(() => console.log("✅ [AMBIENT] Lecture démarrée"))
            .catch((err) => {
            console.error("❌ [AMBIENT] Erreur play:", err);
            console.log("🔍 [AMBIENT] Audio state:", {
                src: ambient.src,
                readyState: ambient.readyState,
                networkState: ambient.networkState,
                error: ambient.error
            });
            });
        } else {
        console.warn("⚠️ [AMBIENT] Pas d'ambientSound pour POI:", currentPOI);
        }
    } else {
        console.log("⏸️ [AMBIENT] Scène en cours, pas de lecture ambient");
    }

    previousPOIRef.current = currentPOI;
    }, [currentPOI, muted, startSoundReady, audioState.isPlaying, audioState.isEnded, pois, getOrCreateAmbientAudio]);

    // Helper pour trouver POI récursivement
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

    // Détecter changement POI pendant scène :

    useEffect(() => {
    // ✅ Si le POI change pendant qu'une scène joue, stopper la scène
    if (sceneAudioRef.current && !sceneAudioRef.current.paused) {
        console.log("🔄 [SCENE] POI changé pendant lecture → Stop scene audio");
        sceneAudioRef.current.pause();
        sceneAudioRef.current.currentTime = 0;
        sceneAudioRef.current = null;
    }
    }, [currentPOI]);

  // ══════════════════════════════════════
  // 3. GESTION SCENE SOUND (sync avec player)
  // ══════════════════════════════════════

    useEffect(() => {
        const isScenePlaying = audioState.isPlaying && !audioState.isEnded;
        
        // ─── Démarrage scène ───
        if (isScenePlaying && !audioState.isPaused && audioState.currentSceneSound) {
            Object.values(ambientAudioRefs.current).forEach(audio => {
            audio.pause();
            });

            if (!sceneAudioRef.current || sceneAudioRef.current.src !== audioState.currentSceneSound) {
                if (sceneAudioRef.current) {
                    sceneAudioRef.current.pause();
                    sceneAudioRef.current.src = '';
                }

                const audio = new Audio(audioState.currentSceneSound);
                audio.loop = false;
                audio.muted = muted;
                sceneAudioRef.current = audio;
                allAudiosRef.current.push(audio);
                
                // ✅ Attendre metadata PUIS repositionner PUIS play
                audio.addEventListener('loadedmetadata', () => {
                    const seekTime = audioState.currentTime || 0;
                    
                    if (seekTime > 0) {
                        console.log("⏩ [SCENE] Repositionnement audio à:", seekTime);
                        audio.currentTime = Math.min(seekTime, audio.duration);
                    }
                    
                    console.log("▶️ [SCENE] Play scene audio depuis:", audio.currentTime);
                    audio.play().catch(() => {});
                }, { once: true });
                
                audio.load(); // ✅ Déclenche le chargement
                } else if (sceneAudioRef.current.paused) {
                    console.log("▶️ [SCENE] Resume scene audio depuis:", sceneAudioRef.current.currentTime);
                    sceneAudioRef.current.play().catch(() => {});
            }
        }
        // ─── Pause scène ───
        else if (audioState.isPaused && sceneAudioRef.current) {
            if (!sceneAudioRef.current.paused) {
            console.log("⏸️ [SCENE] Pause scene audio");
            sceneAudioRef.current.pause();
            }
        }
        // ─── Fin de scène ───
        else if (audioState.isEnded) {
            console.log("🏁 [SCENE] Fin détectée");
            
            if (sceneAudioRef.current) {
            console.log("⏹️ [SCENE] Stop scene audio");
            sceneAudioRef.current.pause();
            sceneAudioRef.current.currentTime = 0;
            sceneAudioRef.current = null;
            }

            if (currentPOI) {
            const poi = pois.find(p => p.id === currentPOI) || 
                        findPOIRecursively(pois, currentPOI);
            
            if (poi?.ambientSound) {
                const ambient = getOrCreateAmbientAudio(currentPOI, poi.ambientSound);
                console.log("▶️ [AMBIENT] Relance après scène:", currentPOI);
                ambient.muted = muted;
                ambient.play().catch(() => {});
            }
            }
        }
    }, [
        audioState.isPlaying, 
        audioState.isPaused, 
        audioState.isEnded, 
        audioState.currentSceneSound,
        audioState.currentTime,
        currentPOI,
        muted,
        pois,
        getOrCreateAmbientAudio
    ]);

  // ══════════════════════════════════════
  // 4. TOGGLE MUTE GLOBAL
  // ══════════════════════════════════════
  const toggleMute = () => {
    setMuted(prev => {
      const next = !prev;
      
      Object.values(ambientAudioRefs.current).forEach(a => {
        a.muted = next;
      });
      
      if (sceneAudioRef.current) {
        sceneAudioRef.current.muted = next;
      }

      if (!next && currentPOI && !audioState.isPlaying) {
        const ambient = ambientAudioRefs.current[currentPOI];
        if (ambient) {
          ambient.muted = false;
          ambient.play().catch(() => {});
        }
      }

      return next;
    });
  };

    // ══════════════════════════════════════
    // 5. SEEK AUDIO (synchronisation externe)
    // ══════════════════════════════════════
    const seekSceneAudio = useCallback((time: number) => {
    if (!sceneAudioRef.current) return;
    
    const audio = sceneAudioRef.current;
    
    // Attendre que l'audio soit prêt
    const applySeek = () => {
        audio.currentTime = Math.min(time, audio.duration || 0);
    };
    
    if (audio.readyState >= 1 && !isNaN(audio.duration)) {
        applySeek();
    } else {
        audio.addEventListener('loadedmetadata', applySeek, { once: true });
    }
    }, []);

    // ══════════════════════════════════════
    // 6. CLEANUP (déplacé après seekSceneAudio)
    // ══════════════════════════════════════

    const cleanup = () => {
        console.log("🔇 Cleanup audio unifié - Début");
        
        // ✅ 0. DÉSACTIVER startSoundReady pour éviter re-trigger
        setStartSoundReady(false);
        
        // 1. Scene audio
        if (sceneAudioRef.current) {
            console.log("🔇 Stop scene audio:", sceneAudioRef.current.src);
            sceneAudioRef.current.pause();
            sceneAudioRef.current.muted = true;
            sceneAudioRef.current.volume = 0;
            sceneAudioRef.current.currentTime = 0;
            sceneAudioRef.current.src = '';
            sceneAudioRef.current.load();
            sceneAudioRef.current = null;
        }
        
        // 2. Ambients
        Object.entries(ambientAudioRefs.current).forEach(([id, audio]) => {
            console.log("🔇 Stop ambient:", id);
            audio.pause();
            audio.muted = true;
            audio.volume = 0;
            audio.currentTime = 0;
            audio.src = '';
            audio.load();
        });
        
        // 3. Tous trackés
        allAudiosRef.current.forEach((audio, index) => {
            console.log("🔇 Stop audio tracké:", index);
            audio.pause();
            audio.muted = true;
            audio.volume = 0;
            audio.currentTime = 0;
            audio.src = '';
            audio.load();
        });
        
        // 4. Reset refs
        ambientAudioRefs.current = {};
        allAudiosRef.current = [];
        
        console.log("✅ Cleanup audio unifié terminé");
    };

    // ══════════════════════════════════════
    // RETURN
    // ══════════════════════════════════════
    return {
        muted,
        toggleMute,
        startSoundReady,
        enableAudio,
        seekSceneAudio, // ✅ AJOUTER
        cleanup,
        sceneAudioRef,
    };
}