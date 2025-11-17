"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadManager, getBookManifest, isBookFullyCached } from '../lib/downloadManager';

interface BookDownloadModalProps {
  bookId: string;
  onComplete: () => void;
  onCancel?: () => void;
}

export default function BookDownloadModal({ bookId, onComplete, onCancel }: BookDownloadModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentAsset, setCurrentAsset] = useState('');
  const [loadedCount, setLoadedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<{available: number; quota: number} | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) {
      checkCache();
    }
  }, [mounted, bookId]);

  const checkCache = async () => {
    setChecking(true);
    await downloadManager.init();

    const storage = await downloadManager.checkStorageQuota();
    setStorageInfo(storage);

    const cached = await isBookFullyCached(bookId);
    
    if (cached) {
      console.log('✅ Livre déjà en cache complet');
      onComplete();
      setChecking(false);
      return;
    }

    // Assets manquants → afficher modale
    setIsOpen(true);
    setChecking(false);
  };

  const startDownload = async () => {
    setDownloading(true);
    setError(null);

    try {
      const manifest = await getBookManifest(bookId);
      setTotalCount(manifest.length);

      let completed = 0;

      for (const asset of manifest) {
        // Vérifier si déjà en cache
        const cached = await downloadManager.isAssetCached(asset.taskId);
        if (cached) {
          completed++;
          setLoadedCount(completed);
          setProgress((completed / manifest.length) * 100);
          continue;
        }

        // Extraire nom du fichier
        const fileName = asset.url.split('/').pop() || asset.taskId;
        setCurrentAsset(fileName);

        // Télécharger avec downloadManager
        await downloadManager.downloadAsset(
          asset.taskId,
          asset.url,
          asset.type,
          (prog) => {
            setSpeed(prog.speed);
            const assetProgress = (completed + prog.progress / 100) / manifest.length;
            setProgress(assetProgress * 100);
          }
        );

        completed++;
        setLoadedCount(completed);
      }

      console.log(`✅ Livre ${bookId} téléchargé (${manifest.length} assets)`);
      
      // Marquer dans localStorage (compatibilité avec ancien système)
      localStorage.setItem(`book-${bookId}-cached`, 'true');
      
      setIsOpen(false);
      onComplete();

    } catch (err: any) {
      console.error('❌ Erreur téléchargement:', err);
      setError(err.message || 'Erreur de téléchargement');
      setDownloading(false);
    }
  };

  const cancelDownload = async () => {
    const manifest = await getBookManifest(bookId);
    for (const asset of manifest) {
      await downloadManager.cancelDownload(asset.taskId);
    }
    
    setDownloading(false);
    setProgress(0);
    setCurrentAsset('');
    setSpeed(0);
    setError(null);
  };

  if (!mounted) return null;

  if (checking) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999]">
        <div className="text-white text-center">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p>Vérification du cache...</p>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/90 flex items-center justify-center z-[9999] p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-gray-900 rounded-2xl p-8 max-w-md w-full border border-gray-700"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
          >
            <h2 className="text-2xl font-bold text-white mb-4">
              📦 Téléchargement du livre
            </h2>

            {!downloading && !error && (
              <>
                <p className="text-gray-300 mb-6">
                  Télécharger toutes les scènes du livre pour une utilisation hors ligne
                </p>

                {storageInfo && (
                  <div className="bg-gray-800 rounded-lg p-3 mb-6 text-sm text-gray-400">
                    <p>Espace disponible : {(storageInfo.available / 1024 / 1024).toFixed(0)} MB</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={startDownload}
                    className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold py-3 rounded-full transition"
                  >
                    Télécharger
                  </button>
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      onCancel?.();
                    }}
                    className="px-6 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-full transition"
                  >
                    Annuler
                  </button>
                </div>
              </>
            )}

            {downloading && (
              <>
                <div className="mb-6">
                  <div className="flex justify-between text-sm text-gray-400 mb-2">
                    <span className="truncate max-w-[200px]">{currentAsset}</span>
                    <span>{progress.toFixed(0)}%</span>
                  </div>

                  <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-600"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>

                  <div className="flex justify-between text-xs text-gray-500 mt-2">
                    <span>{loadedCount} / {totalCount} fichiers</span>
                    <span>{(speed / 1024 / 1024).toFixed(2)} MB/s</span>
                  </div>
                </div>

                <button
                  onClick={cancelDownload}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-full transition"
                >
                  Annuler
                </button>
              </>
            )}

            {error && (
              <>
                <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 mb-6">
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={startDownload}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-full transition"
                  >
                    Réessayer
                  </button>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="px-6 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-full transition"
                  >
                    Fermer
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}