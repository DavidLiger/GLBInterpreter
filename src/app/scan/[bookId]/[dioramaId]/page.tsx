'use client';

import { useEffect, useState } from 'react';

type Props = {
  params: Promise<{ bookId: string; dioramaId: string }>;
  searchParams: Promise<{ t?: string }>;
};

const COOLDOWN_KEY = 'webdiorama-last-scan';
const COOLDOWN_DURATION = 5000; // 5 secondes

export default function ScanLauncher({ params, searchParams }: Props) {
  const [mounted, setMounted] = useState(false);
  const [resolvedParams, setResolvedParams] = useState<{ bookId: string; dioramaId: string } | null>(null);
  const [resolvedToken, setResolvedToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'opening' | 'blocked' | 'success' | 'manual-redirect' | 'cooldown'>('opening');
  const [isReusingViewer, setIsReusingViewer] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

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

    // Vérifier le cooldown
    const lastScan = localStorage.getItem(COOLDOWN_KEY);
    if (lastScan) {
      const timeSinceLastScan = Date.now() - parseInt(lastScan);
      
      if (timeSinceLastScan < COOLDOWN_DURATION) {
        const remaining = Math.ceil((COOLDOWN_DURATION - timeSinceLastScan) / 1000);
        setStatus('cooldown');
        setCooldownRemaining(remaining);
        
        const countdown = setInterval(() => {
          const newRemaining = Math.ceil((COOLDOWN_DURATION - (Date.now() - parseInt(lastScan))) / 1000);
          
          if (newRemaining <= 0) {
            clearInterval(countdown);
            localStorage.setItem(COOLDOWN_KEY, Date.now().toString());
            proceedWithScan();
          } else {
            setCooldownRemaining(newRemaining);
          }
        }, 1000);
        
        return () => clearInterval(countdown);
      }
    }
    
    localStorage.setItem(COOLDOWN_KEY, Date.now().toString());
    proceedWithScan();
    
    function proceedWithScan() {
      if (!resolvedParams || !resolvedToken) return;
      
      // Nettoyer les données zombies
      const existingViewer = localStorage.getItem('webdiorama-viewer-alive');
      if (existingViewer) {
        try {
          const { timestamp } = JSON.parse(existingViewer);
          const age = Date.now() - timestamp;
          
          if (age > 5000) {
            localStorage.removeItem('webdiorama-viewer-alive');
            localStorage.removeItem('webdiorama-change-scene');
            localStorage.removeItem('webdiorama-scene-processed');
            localStorage.removeItem('webdiorama-changing-scene');
          }
        } catch {
          localStorage.removeItem('webdiorama-viewer-alive');
          localStorage.removeItem('webdiorama-change-scene');
          localStorage.removeItem('webdiorama-scene-processed');
          localStorage.removeItem('webdiorama-changing-scene');
        }
      }
      
      const checkExistingViewer = () => {
        const existingViewer = localStorage.getItem('webdiorama-viewer-alive');
        
        if (existingViewer) {
          try {
            const { timestamp } = JSON.parse(existingViewer);
            const age = Date.now() - timestamp;
            
            if (age < 3000) {
              setIsReusingViewer(true);
              
              const requestId = `${Date.now()}-${Math.random()}`;
              
              localStorage.setItem('webdiorama-change-scene', JSON.stringify({
                url: url,
                timestamp: Date.now(),
                requestId,
                bookId: resolvedParams.bookId,
                dioramaId: resolvedParams.dioramaId
              }));
              
              setStatus('manual-redirect');
              return true;
            }
          } catch {}
        }
        return false;
      };
      
      if (checkExistingViewer()) return;
      
      setTimeout(() => {
        if (checkExistingViewer()) return;
        
        const viewer = window.open(url, 'webdiorama-viewer');
        
        if (viewer) {
          viewer.focus();
          setStatus('success');
          
          setTimeout(() => {
            window.close();
          }, 1500);
        } else {
          setStatus('blocked');
        }
      }, 500);
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
              Optimisation mémoire GPU
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
              Cliquez ci-dessous pour ouvrir la scène
            </p>
            <a
              href={`/webdiorama/${resolvedParams.bookId}/${resolvedParams.dioramaId}?t=${resolvedToken}`}
              target="webdiorama-viewer"
              className="inline-block px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-full font-bold transition"
            >
              🎬 Ouvrir la scène
            </a>
          </>
        )}

        {status === 'manual-redirect' && (
          <>
            <div className="text-6xl mb-6 animate-bounce">✅</div>
            <h1 className="text-3xl font-bold text-white mb-4">
              Changement de scène en cours
            </h1>
            <p className="text-gray-300 mb-4">
              Retournez sur l'onglet de la scène 3D
            </p>
            <p className="text-sm text-gray-400">
              (Vous pouvez fermer cette page)
            </p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div className="text-6xl mb-6 animate-bounce">✅</div>
            <h1 className="text-3xl font-bold text-white mb-4">
              C'est parti !
            </h1>
          </>
        )}
      </div>
    </div>
  );
}