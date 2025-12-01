'use client';

import { useEffect, useState } from 'react';

type Props = {
  params: Promise<{ bookId: string; dioramaId: string }>;
  searchParams: Promise<{ t?: string }>;
};

export default function ScanLauncher({ params, searchParams }: Props) {
  const [mounted, setMounted] = useState(false);
  const [resolvedParams, setResolvedParams] = useState<{ bookId: string; dioramaId: string } | null>(null);
  const [resolvedToken, setResolvedToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'opening' | 'blocked' | 'success'>('opening');
  const [isReusingViewer, setIsReusingViewer] = useState(false);

  useEffect(() => {
    Promise.all([params, searchParams]).then(([p, sp]) => {
      setResolvedParams(p);
      setResolvedToken(sp.t || null);
      setMounted(true);
    });
  }, [params, searchParams]);

  useEffect(() => {
    if (!mounted || !resolvedParams || !resolvedToken) return;

    // ✅ NOUVEAU : Vérifier la validité du heartbeat
    const cleanupStaleData = () => {
      const existingViewer = localStorage.getItem('webdiorama-viewer-alive');
      
      if (existingViewer) {
        try {
          const { timestamp } = JSON.parse(existingViewer);
          const age = Date.now() - timestamp;
          
          // Si heartbeat > 5s = viewer mort
          if (age > 5000) {
            console.log('🧹 LAUNCHER: Viewer zombie détecté, nettoyage');
            localStorage.removeItem('webdiorama-viewer-alive');
            localStorage.removeItem('webdiorama-change-scene');
            localStorage.removeItem('webdiorama-scene-processed');
            localStorage.removeItem('webdiorama-changing-scene');
          }
        } catch {
          // JSON invalide, nettoyer
          console.log('🧹 LAUNCHER: Données corrompues, nettoyage');
          localStorage.removeItem('webdiorama-viewer-alive');
          localStorage.removeItem('webdiorama-change-scene');
          localStorage.removeItem('webdiorama-scene-processed');
          localStorage.removeItem('webdiorama-changing-scene');
        }
      }
    };
    
    // ✅ Nettoyer AVANT de vérifier
    cleanupStaleData();

    const sceneUrl = `/webdiorama/${resolvedParams.bookId}/${resolvedParams.dioramaId}?t=${resolvedToken}`;
    
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
            
            localStorage.setItem('webdiorama-change-scene', JSON.stringify({
              url: sceneUrl,
              timestamp: Date.now(),
              requestId,
              bookId: resolvedParams.bookId,
              dioramaId: resolvedParams.dioramaId
            }));
            
            console.log('📤 Demande envoyée:', requestId, sceneUrl);
            
            setStatus('success');
            
            // ✅ CORRIGÉ : Juste fermer le launcher, pas de redirection
            setTimeout(() => {
              console.log('🚪 Fermeture launcher après envoi demande');
              window.close();
              
              // ✅ Fallback : Si window.close() échoue, NE PAS rediriger, juste rester sur success
              setTimeout(() => {
                console.log('⚠️ Fermeture échouée, rester sur page success');
                // Ne rien faire, l'utilisateur verra "C'est parti !" et pourra fermer manuellement
              }, 500);
            }, 1000); // ✅ Attendre 1s pour que le viewer reçoive le message
            
            return true;
          }
        } catch {}
      }
      return false;
    };
    
    // ✅ Vérifier immédiatement
    if (checkExistingViewer()) return;
    
    // ✅ Attendre un peu au cas où le viewer se lance
    const checkTimeout = setTimeout(() => {
        if (checkExistingViewer()) return;
        
        console.log('🆕 Création nouveau viewer');
        
        const viewer = window.open(sceneUrl, 'webdiorama-viewer');
        
        if (viewer) {
          viewer.focus();
          setStatus('success');
          
          // ✅ Juste fermer, pas de redirection
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
    }, [mounted, resolvedParams, resolvedToken]);

  if (!mounted) {
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
                // ✅ Après ouverture, recharger ce launcher pour détecter le viewer
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