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
  const [volume, setVolume] = useState(0.3);
  const [startSoundReady, setStartSoundReady] = useState(false);
  const previousPOIRef = useRef<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const playPromisesRef = useRef<Map<string, Promise<void>>>(new Map());

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
        if (ambientAudioRefs.current[poiId]) {
        const existing = ambientAudioRefs.current[poiId];
        if (existing.src === audioUrl || existing.src.endsWith(audioUrl)) {
            return existing;
        } else {
            existing.pause();
            existing.src = '';
        }
        }
        
        const audio = new Audio();
        audio.src = audioUrl;
        audio.loop = true;
        audio.muted = muted;
        audio.volume = volume; // ✅ NOUVEAU : Appliquer le volume
        audio.preload = "auto";
        ambientAudioRefs.current[poiId] = audio;
        allAudiosRef.current.push(audio);
        return audio;
    }, [muted, volume]); 

    // ══════════════════════════════════════
    // 3. GESTION AMBIENT (avec création lazy)
    // ══════════════════════════════════════
    useEffect(() => {
        console.log("🎵 [AMBIENT] Check:", { 
            currentPOI, 
            startSoundReady, 
            isPlaying: audioState.isPlaying, 
            isEnded: audioState.isEnded,
            muted,
            isTransitioning
        });
        
        if (isTransitioning) {
            console.log("⏸️ [AMBIENT] Transition en cours, skip");
            return;
        }

        if (!currentPOI || !startSoundReady) {
            console.log("⏸️ [AMBIENT] Early return (pas de POI ou pas ready)");
            return;
        }

        const poiHasChanged = previousPOIRef.current !== currentPOI;
        const isScenePlaying = audioState.isPlaying && !audioState.isEnded;
        
        console.log("🎵 [AMBIENT] isScenePlaying:", isScenePlaying);
        
        // ✅ Arrêter ancien POI avec gestion de la promesse
        if (previousPOIRef.current && poiHasChanged) {
            const oldAmbient = ambientAudioRefs.current[previousPOIRef.current];
            if (oldAmbient) {
                console.log("⏹️ [AMBIENT] Stop ancien:", previousPOIRef.current);
                
                const oldPromise = playPromisesRef.current.get(previousPOIRef.current);
                if (oldPromise) {
                    oldPromise
                        .then(() => {
                            oldAmbient.pause();
                            oldAmbient.currentTime = 0;
                        })
                        .catch(() => {
                            oldAmbient.pause();
                            oldAmbient.currentTime = 0;
                        })
                        .finally(() => {
                            playPromisesRef.current.delete(previousPOIRef.current!);
                        });
                } else {
                    oldAmbient.pause();
                    oldAmbient.currentTime = 0;
                }
            }
        }
        
        // ✅ SIMPLIFIÉ : Si scène en cours, NE JAMAIS jouer l'ambient
        if (isScenePlaying) {
            console.log("⏸️ [AMBIENT] Scène en cours, skip ambient");
            previousPOIRef.current = currentPOI;
            return;
        }
        
        // ✅ Sinon, jouer l'ambient du POI actuel
        const poi = pois.find(p => p.id === currentPOI) || 
                    findPOIRecursively(pois, currentPOI);
        
        if (poi?.ambientSound) {
            const ambient = getOrCreateAmbientAudio(currentPOI, poi.ambientSound);
            
            console.log("▶️ [AMBIENT] Play:", currentPOI, "muted:", muted);
            ambient.muted = muted;
            
            // ✅ Stocker la promesse
            const playPromise = ambient.play()
                .catch((err) => {
                    console.error("❌ [AMBIENT] Erreur play:", err);
                })
                .finally(() => {
                    playPromisesRef.current.delete(currentPOI);
                });
            
            playPromisesRef.current.set(currentPOI, playPromise);
        } else {
            console.warn("⚠️ [AMBIENT] Pas d'ambientSound pour POI:", currentPOI);
        }

        previousPOIRef.current = currentPOI;
    }, [currentPOI, muted, startSoundReady, audioState.isPlaying, audioState.isEnded, pois, getOrCreateAmbientAudio, isTransitioning]);

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
                audio.volume = volume;
                sceneAudioRef.current = audio;
                allAudiosRef.current.push(audio);
                
                audio.addEventListener('loadedmetadata', () => {
                    const seekTime = audioState.currentTime || 0;
                    
                    if (seekTime > 0) {
                        console.log("⏩ [SCENE] Repositionnement audio à:", seekTime);
                        audio.currentTime = Math.min(seekTime, audio.duration);
                    }
                    
                    console.log("▶️ [SCENE] Play scene audio depuis:", audio.currentTime);
                    audio.play().catch(() => {});
                }, { once: true });
                
                audio.load();
            } else if (sceneAudioRef.current.paused) {
                console.log("▶️ [SCENE] Resume scene audio depuis:", sceneAudioRef.current.currentTime);
                sceneAudioRef.current.volume = volume;
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
        // ─── Fin de scène ─── ✅ BLOQUER SI TRANSITION
        else if (audioState.isEnded && !isTransitioning) {
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
        volume,
        pois,
        getOrCreateAmbientAudio,
        isTransitioning // ✅ AJOUTÉ
    ]);

    // ✅ NOUVEAU : Appliquer le volume à tous les audios
    const applyVolumeToAll = useCallback((vol: number) => {
        Object.values(ambientAudioRefs.current).forEach(audio => {
        audio.volume = vol;
        });
        
        if (sceneAudioRef.current) {
        sceneAudioRef.current.volume = vol;
        }
    }, []);

    // ✅ NOUVEAU : Setter de volume
    const setAudioVolume = useCallback((vol: number) => {
        const clampedVolume = Math.max(0, Math.min(1, vol));
        setVolume(clampedVolume);
        applyVolumeToAll(clampedVolume);
        
        // ✅ Si volume = 0, considérer comme muted
        if (clampedVolume === 0 && !muted) {
        setMuted(true);
        } else if (clampedVolume > 0 && muted) {
        setMuted(false);
        }
    }, [muted, applyVolumeToAll]);

  // ══════════════════════════════════════
  // 4. TOGGLE MUTE GLOBAL
  // ══════════════════════════════════════
  const toggleMute = useCallback(() => {
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
  }, [currentPOI, audioState.isPlaying]);

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
    const prepareForPOIChange = useCallback(() => {
        console.log("🔄 [AUDIO] Préparation changement POI");
        setIsTransitioning(true);
        
        // Arrêter l'ambient actuel
        Object.values(ambientAudioRefs.current).forEach(audio => audio.pause());
        
        // Reset après un délai
        setTimeout(() => {
            setIsTransitioning(false);
            console.log("✅ [AUDIO] Transition terminée");
        }, 1500);
    }, []);

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
        volume,
        toggleMute,
        setAudioVolume,
        startSoundReady,
        enableAudio,
        seekSceneAudio, // ✅ AJOUTER
        cleanup,
        sceneAudioRef,
        prepareForPOIChange,
    };
}