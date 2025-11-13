"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "@/contexts/TranslationContext";

interface IndexEntry {
  path: string;
  token: string;
}

interface BookIndex {
  [key: string]: IndexEntry;
}

interface BookCacheManagerProps {
  bookId: string;
  isPortrait?: boolean;
  variant?: "scene" | "loader";
}

export default function BookCacheManager({ 
  bookId, 
  isPortrait = false,
  variant = "scene" 
}: BookCacheManagerProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalSize, setTotalSize] = useState(0);
  const [downloadedSize, setDownloadedSize] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const { t } = useTranslation();

  // ✅ Clé localStorage pour l'état du téléchargement
  const downloadingKey = `book-${bookId}-downloading`;

  // ✅ Initialisation : vérifier cache + restaurer téléchargement en cours
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const cached = localStorage.getItem(`book-${bookId}-cached`) === 'true';
    setIsCached(cached);
    
    // Restaurer l'état du téléchargement si interrompu
    const isDownloading = localStorage.getItem(downloadingKey) === 'true';
    if (isDownloading && !cached) {
      setDownloading(true);
      const savedProgress = localStorage.getItem(`${downloadingKey}-progress`);
      if (savedProgress) {
        const { progress: p, downloaded, total } = JSON.parse(savedProgress);
        setProgress(p);
        setDownloadedSize(downloaded);
        setTotalSize(total);
      }
    }
  }, [bookId, downloadingKey]);

  // ✅ Écouter les changements
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `book-${bookId}-cached`) {
        setIsCached(e.newValue === 'true');
      }
      if (e.key === downloadingKey) {
        setDownloading(e.newValue === 'true');
      }
    };

    const handleCacheUpdate = () => {
      setIsCached(localStorage.getItem(`book-${bookId}-cached`) === 'true');
      setDownloading(false);
    };

    const handleDownloadStarted = () => {
      setDownloading(true);
    };

    const handleProgressUpdate = ((e: CustomEvent) => {
      const { progress: p, downloaded, total } = e.detail;
      setProgress(p);
      setDownloadedSize(downloaded);
      setTotalSize(total);
    }) as EventListener;

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('book-cache-updated', handleCacheUpdate);
    window.addEventListener('book-download-started', handleDownloadStarted);
    window.addEventListener('book-download-progress', handleProgressUpdate);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('book-cache-updated', handleCacheUpdate);
      window.removeEventListener('book-download-started', handleDownloadStarted);
      window.removeEventListener('book-download-progress', handleProgressUpdate);
    };
  }, [bookId, downloadingKey]);

  const cleanUrl = (url: string): string => {
    return url.replace(/\?v=.*$/, '').replace(/\?v=\$\{Date\.now\(\)\}$/, '');
  };

  const getCacheName = (url: string): string => {
    if (/\.glb$/.test(url)) return 'diorama-models';
    if (/\.(mp4|webm)$/.test(url)) return 'diorama-videos';
    if (/\.(jpg|jpeg|png|webp|gif|svg)$/.test(url)) return 'diorama-images';
    if (/\.(mp3|wav|ogg)$/.test(url)) return 'diorama-audio';
    if (/webdiorama-proxy/.test(url)) return 'diorama-r2-assets';
    return 'diorama-r2-assets';
  };

  const downloadBook = async () => {
    setShowModal(false);
    setDownloading(true);
    
    localStorage.setItem(downloadingKey, 'true');
    window.dispatchEvent(new Event('book-download-started'));
    
    const baseUrl = process.env.NEXT_PUBLIC_ASSETS_URL;

    try {
      const indexRes = await fetch(`${baseUrl}/assets/${bookId}/index.json`);
      if (!indexRes.ok) throw new Error(`Index HTTP ${indexRes.status}`);
      
      const index = await indexRes.json() as BookIndex;
      const allUrls: string[] = [];

      for (const [dioramaId, entry] of Object.entries(index)) {
        const configRes = await fetch(`${baseUrl}/assets/${bookId}/${entry.path}`);
        if (!configRes.ok) continue;
        
        const config = await configRes.json();

        if (config.glb) allUrls.push(config.glb);
        if (config.loaderImage) allUrls.push(config.loaderImage);
        
        const extractFromPOI = (poi: any) => {
          if (poi.icon) allUrls.push(poi.icon);
          if (poi.ambientSound) allUrls.push(poi.ambientSound);
          if (poi.sceneSound) allUrls.push(poi.sceneSound);
          poi.dialogue?.characters?.forEach((char: any) => {
            if (char.image) allUrls.push(char.image);
          });
          if (poi.children) poi.children.forEach((child: any) => extractFromPOI(child));
        };
        
        config.pois?.forEach((poi: any) => extractFromPOI(poi));
        config.videos?.forEach((video: any) => {
          if (video.src) allUrls.push(video.src);
        });
      }

      const uniqueUrls = [...new Set(allUrls)];
      const total = uniqueUrls.length;
      setTotalSize(total);

      for (let i = 0; i < uniqueUrls.length; i++) {
        try {
          const url = uniqueUrls[i];
          const cleanedUrl = cleanUrl(url);
          const cacheName = getCacheName(cleanedUrl);
          
          const response = await fetch(url);
          
          if (response.ok) {
            const cache = await caches.open(cacheName);
            await cache.put(cleanedUrl, response.clone());
          }
          
          const downloaded = i + 1;
          const prog = Math.round((downloaded / total) * 100);
          
          setDownloadedSize(downloaded);
          setProgress(prog);
          
          // ✅ Sauvegarder progression + dispatcher event
          const progressData = { progress: prog, downloaded, total };
          localStorage.setItem(`${downloadingKey}-progress`, JSON.stringify(progressData));
          window.dispatchEvent(new CustomEvent('book-download-progress', { detail: progressData }));
          
        } catch (err) {
          console.warn(`❌ Échec: ${uniqueUrls[i]}`);
        }
      }

      // ✅ Nettoyer + marquer comme caché
      localStorage.removeItem(downloadingKey);
      localStorage.removeItem(`${downloadingKey}-progress`);
      localStorage.setItem(`book-${bookId}-cached`, 'true');
      
      window.dispatchEvent(new Event('book-cache-updated'));
      setIsCached(true);
      setDownloading(false);
      
    } catch (err) {
      console.error("❌ Erreur:", err);
      localStorage.removeItem(downloadingKey);
      localStorage.removeItem(`${downloadingKey}-progress`);
      setDownloading(false);
    }
  };

  if (isCached && !downloading) return null;

  const buttonPosition = variant === "loader" 
    ? "w-8 h-8 absolute top-4 right-20 z-50" 
    : isPortrait 
      ? "w-10 h-10 absolute top-14 right-2 z-50" 
      : "w-10 h-10 absolute top-2 right-14 z-50";

  return (
    <>
      {!downloading && (
        <motion.button
          onClick={() => setShowModal(true)}
          className={`${buttonPosition} bg-black/60 border-2 border-white border-solid rounded-full flex items-center justify-center shadow-lg`}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          title={t.bookDownload.modalTitle}
        >
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </motion.button>
      )}

      <AnimatePresence>
        {downloading && variant === "scene" && (
          <motion.div
            className={`${
              isPortrait
                ? "absolute bottom-28 right-2 z-[9900]"
                : "absolute top-14 right-2 z-[9900]"
            } bg-black/60 text-white p-3 rounded-2xl shadow-2xl min-w-[200px]`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <p className="text-xs font-semibold mb-2">📥 {t.bookDownload.downloading}</p>
            <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden mb-1">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-400">
              {downloadedSize} / {totalSize} {t.bookDownload.filesProgress} ({progress}%)
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/60 z-[200]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
            />
            
            <motion.div
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-br from-gray-900 to-black p-6 rounded-2xl shadow-2xl z-[201] max-w-sm w-[90vw]"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <h3 className="text-white font-bold text-lg mb-3">
                📚 {t.bookDownload.modalTitle} {bookId}
              </h3>
              <p className="text-gray-300 text-sm mb-2">
                {t.bookDownload.modalMessage}
              </p>
              <p className="text-yellow-400 font-semibold text-sm mb-5">
                {t.bookDownload.modalSize}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-full font-semibold"
                >
                  {t.bookDownload.cancel}
                </button>
                <button
                  onClick={downloadBook}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full font-semibold"
                >
                  {t.bookDownload.download}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}