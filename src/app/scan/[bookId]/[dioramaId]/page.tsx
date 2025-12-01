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

    const sceneUrl = `/webdiorama/${resolvedParams.bookId}/${resolvedParams.dioramaId}?t=${resolvedToken}`;
    
    // ✅ Vérifier si un viewer existe déjà
    const checkExistingViewer = () => {
        const existingViewer = localStorage.getItem('webdiorama-viewer-alive');
        
        if (existingViewer) {
        try {
            const { timestamp } = JSON.parse(existingViewer);
            const age = Date.now() - timestamp;
            
            // Si heartbeat < 3s, le viewer est actif
            if (age < 3000) {
            console.log('♻️ Viewer existant détecté, envoi changement de scène');
            
            setIsReusingViewer(true);
            
            // ✅ Envoyer l'ordre de changer de scène
            localStorage.setItem('webdiorama-change-scene', JSON.stringify({
                url: sceneUrl,
                timestamp: Date.now()
            }));
            
            setStatus('success');
            
            setTimeout(() => {
                window.location.href = '/scan-success';
            }, 1500);
            
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
        
        // ✅ Pas de viewer actif après 500ms, en créer un nouveau
        console.log('🆕 Création nouveau viewer');
        
        const viewer = window.open(sceneUrl, 'webdiorama-viewer');
        
        if (viewer) {
        viewer.focus();
        setStatus('success');
        
        setTimeout(() => {
            window.location.href = '/scan-success';
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