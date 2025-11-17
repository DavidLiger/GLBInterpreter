"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { downloadManager } from '../lib/downloadManager';

interface BookDownloadModalProps {
  bookId: string;
  assets: Array<{ id: string; url: string; type: 'glb' | 'video' | 'audio'; size: number }>;
  onComplete: () => void;
}

export default function BookDownloadModal({ bookId, assets, onComplete }: BookDownloadModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentAsset, setCurrentAsset] = useState('');
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<{available: number; quota: number} | null>(null);

  useEffect(() => {
    checkAssets();
  }, []);

  const checkAssets = async () => {
    setChecking(true);
    await downloadManager.init();

    // Vérifier l'espace disque
    const storage = await downloadManager.checkStorageQuota();
    setStorageInfo(storage);

    const totalSize = assets.reduce((sum, a) => sum + a.size, 0);
    
    if (storage.available < totalSize) {
      setError(`Espace insuffisant : ${(totalSize / 1024 / 1024).toFixed(0)} MB requis, ${(storage.available / 1024 / 1024).toFixed(0)} MB disponibles`);
      setIsOpen(true);
      setChecking(false);
      return;
    }

    // Vérifier quels assets sont déjà en cache
    const missingAssets = [];
    for (const asset of assets) {
      const cached = await downloadManager.isAssetCached(asset.id);
      if (!cached) {
        missingAssets.push(asset);
      }
    }

    if (missingAssets.length === 0) {
      console.log('✅ Tous les assets sont déjà en cache');
      onComplete();
      setChecking(false);
      return;
    }

    // Afficher la modale de téléchargement
    setIsOpen(true);
    setChecking(false);
  };

  const startDownload = async () => {
    setDownloading(true);
    setError(null);

    try {
      let completed = 0;
      const total = assets.length;

      for (const asset of assets) {
        const cached = await downloadManager.isAssetCached(asset.id);
        if (cached) {
          completed++;
          setProgress((completed / total) * 100);
          continue;
        }

        setCurrentAsset(asset.url.split('/').pop() || asset.id);

        await downloadManager.downloadAsset(
          asset.id,
          asset.url,
          asset.type,
          (prog) => {
            setSpeed(prog.speed);
            setEta(prog.eta);
            const assetProgress = (completed + prog.progress / 100) / total;
            setProgress(assetProgress * 100);
          }
        );

        completed++;
      }

      console.log('✅ Téléchargement terminé');
      setIsOpen(false);
      onComplete();
    } catch (err: any) {
      console.error('❌ Erreur téléchargement:', err);
      setError(err.message || 'Erreur de téléchargement');
      setDownloading(false);
    }
  };

  const cancelDownload = async () => {
    // Annuler tous les téléchargements en cours
    for (const asset of assets) {
      await downloadManager.cancelDownload(asset.id);
    }
    setIsOpen(false);
    setDownloading(false);
  };

  if (checking) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999]">
        <div className="text-white text-center">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p>Vérification des assets...</p>
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
              📦 Téléchargement requis
            </h2>

            {!downloading && !error && (
              <>
                <p className="text-gray-300 mb-6">
                  Cette scène nécessite le téléchargement de{' '}
                  <strong>{(assets.reduce((s, a) => s + a.size, 0) / 1024 / 1024).toFixed(0)} MB</strong> d'assets.
                </p>

                {storageInfo && (
                  <div className="bg-gray-800 rounded-lg p-3 mb-6 text-sm text-gray-400">
                    <p>Espace disponible : {(storageInfo.available / 1024 / 1024).toFixed(0)} MB</p>
                    <p>Espace total : {(storageInfo.quota / 1024 / 1024).toFixed(0)} MB</p>
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
                    onClick={() => setIsOpen(false)}
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
                    <span>{currentAsset}</span>
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
                    <span>{(speed / 1024 / 1024).toFixed(2)} MB/s</span>
                    <span>ETA : {Math.ceil(eta)}s</span>
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