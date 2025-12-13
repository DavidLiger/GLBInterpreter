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
        audio.muted = false;  // ✅ Valeur fixe
        audio.volume = 0.3;   // ✅ Valeur fixe
        audio.preload = "auto";
        ambientAudioRefs.current[poiId] = audio;
        allAudiosRef.current.push(audio);
        return audio;
    }, []); // ✅ AUCUNE dépendance !

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
            ambient.volume = volume;
            
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

    // ✅ useEffect pour CRÉER/PLAY/PAUSE uniquement (PAS de volume/mute/seek ici)
    useEffect(() => {
        const isScenePlaying = audioState.isPlaying && !audioState.isEnded;
        
        // ─── Démarrage scène ───
        if (isScenePlaying && !audioState.isPaused && audioState.currentSceneSound) {
            Object.values(ambientAudioRefs.current).forEach(audio => {
                audio.pause();
            });

            // Si l'audio existe déjà ET c'est le même src
            if (sceneAudioRef.current && sceneAudioRef.current.src.includes(audioState.currentSceneSound)) {
                if (sceneAudioRef.current.paused) {
                    console.log("▶️ [SCENE] Resume");
                    sceneAudioRef.current.play().catch(() => {});
                }
                return; // ✅ NE PAS recréer
            }
            
            // Sinon, créer nouvel audio
            console.log("🆕 [SCENE] Création nouvel audio");

            if (sceneAudioRef.current) {
                sceneAudioRef.current.pause();
                sceneAudioRef.current.src = '';
            }

            const audio = new Audio();  // ✅ PAS d'URL ici
            audio.loop = false;
            audio.muted = muted;
            audio.volume = volume;
            sceneAudioRef.current = audio;
            allAudiosRef.current.push(audio);

            // ✅ CHARGER DEPUIS CACHE
            (async () => {
                try {
                    const { getAssetFromCache } = await import('@/components/diorama/lib/downloadManager');
                    const bookId = 'folio';
                    
                    const cachedBlob = await getAssetFromCache(bookId, audioState.currentSceneSound!);
                    
                    if (cachedBlob) {
                        console.log("✅ [SCENE] Chargé depuis cache (Blob URL)");
                        const blobUrl = URL.createObjectURL(cachedBlob);
                        audio.src = blobUrl;
                    } else {
                        console.log("⚠️ [SCENE] Pas en cache, URL directe");
                        audio.src = audioState.currentSceneSound!;
                    }
                    
                    audio.load();
                    
                    audio.addEventListener('loadedmetadata', () => {
                        console.log("▶️ [SCENE] Métadonnées chargées, play");
                        audio.play().catch(() => {});
                    }, { once: true });
                    
                } catch (error) {
                    console.error("❌ Erreur cache:", error);
                    audio.src = audioState.currentSceneSound!;
                    audio.load();
                    audio.addEventListener('loadedmetadata', () => {
                        audio.play().catch(() => {});
                    }, { once: true });
                }
            })();
        }
        // ─── Pause scène ───
        else if (audioState.isPaused && sceneAudioRef.current) {
            if (!sceneAudioRef.current.paused) {
                console.log("⏸️ [SCENE] Pause");
                sceneAudioRef.current.pause();
            }
        }
        // ─── Fin de scène ───
        else if (audioState.isEnded && !isTransitioning) {
            console.log("🏁 [SCENE] Fin");
            
            if (sceneAudioRef.current) {
                sceneAudioRef.current.pause();
                sceneAudioRef.current.currentTime = 0;
                sceneAudioRef.current = null;
            }

            if (currentPOI) {
                const poi = pois.find(p => p.id === currentPOI) || 
                            findPOIRecursively(pois, currentPOI);
                
                if (poi?.ambientSound) {
                    const ambient = getOrCreateAmbientAudio(currentPOI, poi.ambientSound);
                    ambient.muted = muted;
                    ambient.volume = volume; // ✅ AJOUTER
                    if (ambient.paused) {
                        ambient.play().catch(() => {});
                    }
                }
            }
        }
    }, [
        audioState.isPlaying, 
        audioState.isPaused, 
        audioState.isEnded, 
        audioState.currentSceneSound, // ✅ SEULEMENT ces deps !
        currentPOI,
        pois,
        getOrCreateAmbientAudio,
        isTransitioning
    ]); // ✅ RETIRER: volume, muted, currentTime

    // ✅ useEffect séparé pour VOLUME et MUTE
    useEffect(() => {
        if (sceneAudioRef.current) {
            sceneAudioRef.current.volume = volume;
            sceneAudioRef.current.muted = muted;
        }
    }, [volume, muted]);

    // ✅ NOUVEAU : Appliquer le volume à tous les audios
    const applyVolumeToAll = useCallback((vol: number, shouldMute: boolean) => {
        Object.values(ambientAudioRefs.current).forEach(audio => {
            audio.volume = vol;
            audio.muted = shouldMute; // ✅ Appliquer muted aussi
        });
        
        if (sceneAudioRef.current) {
            sceneAudioRef.current.volume = vol;
            sceneAudioRef.current.muted = shouldMute; // ✅ Appliquer muted aussi
        }
    }, []);

    // ✅ NOUVEAU : Setter de volume
    const setAudioVolume = useCallback((vol: number) => {
        const clampedVolume = Math.max(0, Math.min(1, vol));
        const shouldBeMuted = clampedVolume === 0;
        
        setVolume(clampedVolume);
        setMuted(shouldBeMuted);
        
        // ✅ Appliquer volume ET muted ensemble
        applyVolumeToAll(clampedVolume, shouldBeMuted);
    }, [applyVolumeToAll]);

  // ══════════════════════════════════════
  // 4. TOGGLE MUTE GLOBAL
  // ══════════════════════════════════════
    const toggleMute = useCallback(() => {
        setMuted(prev => {
            const next = !prev;
            
            // ✅ Utiliser applyVolumeToAll pour appliquer partout
            applyVolumeToAll(volume, next);

            if (!next && currentPOI && !audioState.isPlaying) {
                const ambient = ambientAudioRefs.current[currentPOI];
                if (ambient) {
                    ambient.muted = false;
                    ambient.play().catch(() => {});
                }
            }

            return next;
        });
    }, [currentPOI, audioState.isPlaying, volume, applyVolumeToAll]);

    // ══════════════════════════════════════
    // 5. SEEK AUDIO (synchronisation externe)
    // ══════════════════════════════════════
    const seekSceneAudio = useCallback((time: number) => {
        if (!sceneAudioRef.current) return;
        
        const audio = sceneAudioRef.current;
        
        console.log("🎯 [SEEK] Seek à:", time, "readyState:", audio.readyState);
        
        const applySeek = () => {
            audio.currentTime = Math.min(time, audio.duration || 0);
            console.log("✅ [SEEK] Appliqué, currentTime:", audio.currentTime);
        };
        
        if (audio.readyState >= 2) { // HAVE_CURRENT_DATA
            applySeek();
        } else {
            audio.addEventListener('canplay', applySeek, { once: true });
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