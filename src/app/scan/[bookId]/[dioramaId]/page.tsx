'use client';

import { useEffect, useState } from 'react';

type Props = {
  params: Promise<{ bookId: string; dioramaId: string }>;
  searchParams: Promise<{ t?: string }>;
};

// ✅ Constantes
const COOLDOWN_KEY = 'webdiorama-last-scan';
const COOLDOWN_DURATION = 5000; // 5 secondes

export default function ScanLauncher({ params, searchParams }: Props) {
  const [mounted, setMounted] = useState(false);
  const [resolvedParams, setResolvedParams] = useState<{ bookId: string; dioramaId: string } | null>(null);
  const [resolvedToken, setResolvedToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'opening' | 'blocked' | 'success' | 'manual-redirect' | 'cooldown'>('opening');
  const [isReusingViewer, setIsReusingViewer] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [sceneUrl, setSceneUrl] = useState<string>('');

  // Résoudre les params async
  useEffect(() => {
    Promise.all([params, searchParams]).then(([p, sp]) => {
      setResolvedParams(p);
      setResolvedToken(sp.t || null);
      setMounted(true);
    });
  }, [params, searchParams]);

  useEffect(() => {
    if (!mounted || !resolvedParams || !resolvedToken) return;

    const url = `/webdiorama/${resolvedParams.bookId}/${resolvedParams.dioramaId}?t=${resolvedToken}`;
    setSceneUrl(url);

    // ✅ Vérifier le cooldown
    const lastScan = localStorage.getItem(COOLDOWN_KEY);
    if (lastScan) {
      const timeSinceLastScan = Date.now() - parseInt(lastScan);
      
      if (timeSinceLastScan < COOLDOWN_DURATION) {
        const remaining = Math.ceil((COOLDOWN_DURATION - timeSinceLastScan) / 1000);
        console.log(`⏱️ Cooldown actif: ${remaining}s restantes`);
        setStatus('cooldown');
        setCooldownRemaining(remaining);
        
        // Countdown
        const countdown = setInterval(() => {
          const newRemaining = Math.ceil((COOLDOWN_DURATION - (Date.now() - parseInt(lastScan))) / 1000);
          
          if (newRemaining <= 0) {
            clearInterval(countdown);
            console.log('✅ Cooldown terminé, lancement scan');
            localStorage.setItem(COOLDOWN_KEY, Date.now().toString());
            proceedWithScan();
          } else {
            setCooldownRemaining(newRemaining);
          }
        }, 1000);
        
        return () => clearInterval(countdown);
      }
    }
    
    // ✅ Pas de cooldown, enregistrer et continuer
    localStorage.setItem(COOLDOWN_KEY, Date.now().toString());
    proceedWithScan();
    
    function proceedWithScan() {
      if (!resolvedParams || !resolvedToken) return; // ✅ Guard clause
      // ✅ Nettoyer les données zombies
      const cleanupStaleData = () => {
        const existingViewer = localStorage.getItem('webdiorama-viewer-alive');
        
        if (existingViewer) {
          try {
            const { timestamp } = JSON.parse(existingViewer);
            const age = Date.now() - timestamp;
            
            if (age > 5000) {
              console.log('🧹 LAUNCHER: Viewer zombie détecté, nettoyage');
              localStorage.removeItem('webdiorama-viewer-alive');
              localStorage.removeItem('webdiorama-change-scene');
              localStorage.removeItem('webdiorama-scene-processed');
              localStorage.removeItem('webdiorama-changing-scene');
            }
          } catch {
            console.log('🧹 LAUNCHER: Données corrompues, nettoyage');
            localStorage.removeItem('webdiorama-viewer-alive');
            localStorage.removeItem('webdiorama-change-scene');
            localStorage.removeItem('webdiorama-scene-processed');
            localStorage.removeItem('webdiorama-changing-scene');
          }
        }
      };
      
      cleanupStaleData();
      
      const checkExistingViewer = () => {
        const existingViewer = localStorage.getItem('webdiorama-viewer-alive');
        
        if (existingViewer) {
          try {
            const { timestamp } = JSON.parse(existingViewer);
            const age = Date.now() - timestamp;
            
            if (age < 3000) {
              console.log('♻️ Viewer existant détecté, envoi changement de scène');
              
              setIsReusingViewer(true);
              
              const requestId = `${Date.now()}-${Math.random()}`;
              
              // ✅ Utiliser 'url' (variable locale) au lieu de 'sceneUrl' (state)
              localStorage.setItem('webdiorama-change-scene', JSON.stringify({
                url: url, // ✅ Variable locale du useEffect
                timestamp: Date.now(),
                requestId,
                bookId: resolvedParams.bookId,
                dioramaId: resolvedParams.dioramaId
              }));
              
              console.log('📤 Demande envoyée:', requestId, url);
              
              // ✅ TOUJOURS afficher le bouton manuel
              setStatus('manual-redirect');
              
              return true;
            }
          } catch {}
        }
        return false;
      };
      
      // Vérifier immédiatement
      if (checkExistingViewer()) return;
      
      // Attendre un peu
      const checkTimeout = setTimeout(() => {
        if (checkExistingViewer()) return;
        
        console.log('🆕 Création nouveau viewer');
        
        const viewer = window.open(sceneUrl, 'webdiorama-viewer');
        
        if (viewer) {
          viewer.focus();
          setStatus('success');
          
          setTimeout(() => {
            console.log('🚪 Fermeture launcher après création viewer');
            window.close();
          }, 1500);
        } else {
          console.warn('⚠️ Popup bloqué');
          setStatus('blocked');
        }
      }, 500);
      
      return () => clearTimeout(checkTimeout);
    }
  }, [mounted, resolvedParams, resolvedToken]);

  if (!mounted || !resolvedParams || !resolvedToken) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-blue-900 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        {status === 'opening' && (
          <>
            <div className="text-6xl mb-6 animate-pulse">🎬</div>
            <h1 className="text-3xl font-bold text-white mb-4">
              Ouverture de la scène...
            </h1>
            <p className="text-gray-300">
              La scène s'ouvre dans un onglet dédié
            </p>
          </>
        )}
        
        {status === 'cooldown' && (
          <>
            <div className="text-6xl mb-6 animate-pulse">⏱️</div>
            <h1 className="text-3xl font-bold text-white mb-4">
              Préparation en cours...
            </h1>
            <div className="text-6xl font-bold text-purple-400 mb-4">
              {cooldownRemaining}s
            </div>
            <p className="text-gray-300 mb-2">
              La scène précédente se prépare
            </p>
            <p className="text-sm text-gray-400">
              (Optimisation mémoire GPU)
            </p>
          </>
        )}
        
        {status === 'blocked' && (
          <>
            <div className="text-6xl mb-6">🚫</div>
            <h1 className="text-3xl font-bold text-white mb-4">
              Action requise
            </h1>
            <p className="text-gray-300 mb-6">
              Cliquez ci-dessous pour ouvrir la scène :
            </p>
            <a
              href={`/webdiorama/${resolvedParams?.bookId}/${resolvedParams?.dioramaId}?t=${resolvedToken}`}
              target="webdiorama-viewer"
              onClick={() => {
                setTimeout(() => {
                  window.location.reload();
                }, 1000);
              }}
              className="inline-block px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-full font-bold transition"
            >
              🎬 Ouvrir la scène
            </a>
          </>
        )}

        {status === 'manual-redirect' && sceneUrl && (
          <>
            <div className="text-6xl mb-6 animate-bounce">✅</div>
            <h1 className="text-3xl font-bold text-white mb-4">
              Changement de scène...
            </h1>
            <p className="text-gray-300 mb-6">
              Retournez sur l'onglet de la scène
            </p>
            <button
              onClick={() => {
                // ✅ Juste fermer cette page
                // L'utilisateur basculera manuellement sur le viewer
                window.close();
                
                // ✅ Si window.close() échoue, rediriger après 500ms
                setTimeout(() => {
                  if (!window.closed) {
                    // Fallback : rediriger cette page vers le viewer
                    window.location.href = sceneUrl;
                  }
                }, 500);
              }}
              className="px-8 py-4 bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 text-white text-lg font-bold rounded-full shadow-lg transition transform hover:scale-105"
            >
              OK, compris 👍
            </button>
            <p className="text-sm text-gray-400 mt-4">
              (La scène change automatiquement)
            </p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div className="text-6xl mb-6 animate-bounce">✅</div>
            <h1 className="text-3xl font-bold text-white mb-4">
              C'est parti !
            </h1>
            <p className="text-gray-300">
              {isReusingViewer ? 'Changement de scène...' : 'Ouverture...'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}