// src/components/diorama/ui/GLBOptimizer.tsx
"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { 
  dedup, 
  prune, 
  resample,
  weld,
} from "@gltf-transform/functions";

interface GLBOptimizerProps {
  onOpenChange?: (isOpen: boolean) => void; // ✅
}

interface OptimizationOptions {
  dedup: boolean;
  prune: boolean;
  weld: boolean;
  resample: boolean;
}

export default function GLBOptimizer({ onOpenChange }: GLBOptimizerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [originalSize, setOriginalSize] = useState(0);
  const [optimizedSize, setOptimizedSize] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [optimizedBlob, setOptimizedBlob] = useState<Blob | null>(null);

  const [options, setOptions] = useState<OptimizationOptions>({
    dedup: true,
    prune: false,
    weld: true,
    resample: false,
  });

      // ✅ MODIFIER le setIsOpen
  const handleSetIsOpen = (value: boolean) => {
    setIsOpen(value);
    onOpenChange?.(value); // ✅ Notifier le parent
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.name.endsWith('.glb')) {
      setFile(selectedFile);
      setOriginalSize(selectedFile.size);
      setOptimizedBlob(null);
      setOptimizedSize(0);
      setError(null);
    } else {
      setError("Veuillez sélectionner un fichier .glb valide");
    }
  };

  const optimizeGLB = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgress(0);
    setError(null);

    try {
      // 1. Lire le fichier
      setProgress(10);
      const arrayBuffer = await file.arrayBuffer();
      
      // 2. Parser avec gltf-transform
      setProgress(20);
      const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
      const document = await io.readBinary(new Uint8Array(arrayBuffer));
      
      setProgress(30);

      // 3. Appliquer les optimisations
      let progressStep = 30;
      const stepIncrement = 60 / Object.values(options).filter(Boolean).length;

      if (options.dedup) {
        await document.transform(dedup());
        progressStep += stepIncrement;
        setProgress(Math.round(progressStep));
      }

      if (options.weld) {
        await document.transform(weld()); // ✅ Sans options
        progressStep += stepIncrement;
        setProgress(Math.round(progressStep));
      }

      if (options.prune) {
        await document.transform(prune());
        progressStep += stepIncrement;
        setProgress(Math.round(progressStep));
      }

      if (options.resample) {
        await document.transform(resample());
        progressStep += stepIncrement;
        setProgress(Math.round(progressStep));
      }

      setProgress(90);

      // 4. Exporter le résultat
      const glb = await io.writeBinary(document);
      
      setProgress(95);

      // 5. Créer le blob - ✅ Forcer le type correct
    const buffer = new Uint8Array(glb); // Crée une copie avec ArrayBuffer standard
    const blob = new Blob([buffer], { type: 'model/gltf-binary' });
    setOptimizedBlob(blob);
    setOptimizedSize(blob.size);
      
      setProgress(100);

    } catch (err) {
      console.error("Erreur d'optimisation:", err);
      setError(err instanceof Error ? err.message : "Erreur lors de l'optimisation");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadOptimized = () => {
    if (!optimizedBlob || !file) return;

    const url = URL.createObjectURL(optimizedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name.replace('.glb', '_optimized.glb');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getReduction = () => {
    if (originalSize === 0 || optimizedSize === 0) return 0;
    return Math.round(((originalSize - optimizedSize) / originalSize) * 100);
  };

  return (
    <>
      {/* Bouton flottant */}
      <button
        onClick={() => handleSetIsOpen(true)}
        className="fixed bottom-104 right-4 z-[9998] bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white px-4 py-3 rounded-full shadow-lg font-bold flex items-center gap-2 transition-all hover:scale-105"
        title="Optimiseur GLB"
      >
        <span className="text-xl">⚡</span>
        <span className="hidden sm:inline">Optimiseur</span>
      </button>

      {/* Modal */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => handleSetIsOpen(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9998]"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[700px] sm:max-h-[90vh] bg-gray-900 rounded-2xl z-[9999] overflow-hidden flex flex-col shadow-2xl border border-purple-500/30"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-600 to-pink-700 p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">⚡</span>
                  <h2 className="text-white font-bold text-xl">Optimiseur GLB</h2>
                </div>
                <button
                  onClick={() => handleSetIsOpen(false)}
                  className="text-white hover:bg-white/20 rounded-lg p-2 transition"
                >
                  ✕
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* File Upload */}
                <div className="bg-gray-800 rounded-lg p-6 border-2 border-dashed border-gray-600 hover:border-purple-500 transition">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".glb"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  
                  {!file ? (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex flex-col items-center gap-3"
                    >
                      <div className="text-6xl">📁</div>
                      <p className="text-white font-bold">Sélectionner un fichier GLB</p>
                      <p className="text-gray-400 text-sm">Cliquez pour parcourir vos fichiers</p>
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate">{file.name}</p>
                          <p className="text-gray-400 text-sm">{formatSize(originalSize)}</p>
                        </div>
                        <button
                          onClick={() => {
                            setFile(null);
                            setOptimizedBlob(null);
                            setOptimizedSize(0);
                          }}
                          className="text-red-400 hover:text-red-300 ml-2"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Options */}
                {file && !isProcessing && !optimizedBlob && (
                  <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                      <span>🔧</span>
                      Options d'optimisation
                    </h3>
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 text-gray-300 cursor-pointer hover:text-white transition">
                        <input
                          type="checkbox"
                          checked={options.dedup}
                          onChange={(e) => setOptions({ ...options, dedup: e.target.checked })}
                          className="rounded"
                        />
                        <div>
                          <p className="font-medium">Dédupliquer</p>
                          <p className="text-xs text-gray-500">Fusionne les meshes/textures identiques</p>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 text-gray-300 cursor-pointer hover:text-white transition">
                        <input
                          type="checkbox"
                          checked={options.weld}
                          onChange={(e) => setOptions({ ...options, weld: e.target.checked })}
                          className="rounded"
                        />
                        <div>
                          <p className="font-medium">Souder les vertices</p>
                          <p className="text-xs text-gray-500">Fusionne les vertices dupliqués</p>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 text-gray-300 cursor-pointer hover:text-white transition">
                        <input
                          type="checkbox"
                          checked={options.prune}
                          onChange={(e) => setOptions({ ...options, prune: e.target.checked })}
                          className="rounded"
                        />
                        <div>
                          <p className="font-medium">Nettoyer</p>
                          <p className="text-xs text-gray-500">Supprime les données inutilisées</p>
                          {/* ✅ AJOUTER CE WARNING */}
                          <p className="text-xs text-orange-400 mt-1">
                            ⚠️ Attention : supprime aussi les Empty (POIs, camera paths)
                          </p>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 text-gray-300 cursor-pointer hover:text-white transition">
                        <input
                          type="checkbox"
                          checked={options.resample}
                          onChange={(e) => setOptions({ ...options, resample: e.target.checked })}
                          className="rounded"
                        />
                        <div>
                          <p className="font-medium">Ré-échantillonner les animations</p>
                          <p className="text-xs text-gray-500">Réduit les keyframes (peut altérer légèrement)</p>
                        </div>
                      </label>
                    </div>

                    <button
                      onClick={optimizeGLB}
                      disabled={!Object.values(options).some(Boolean)}
                      className="w-full mt-6 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-all transform hover:scale-105"
                    >
                      ⚡ Optimiser le GLB
                    </button>
                  </div>
                )}

                {/* Processing */}
                {isProcessing && (
                  <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <div className="text-center space-y-4">
                      <div className="text-6xl animate-pulse">⚙️</div>
                      <p className="text-white font-bold text-xl">Optimisation en cours...</p>
                      <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-pink-600 transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="text-gray-400 text-sm">{progress}%</p>
                    </div>
                  </div>
                )}

                {/* Results */}
                {optimizedBlob && !isProcessing && (
                  <div className="space-y-4">
                    <div className="bg-gradient-to-br from-green-900/30 to-emerald-900/30 border border-green-500/30 rounded-lg p-6">
                      <h3 className="text-green-300 font-bold text-lg mb-4 flex items-center gap-2">
                        <span>✅</span>
                        Optimisation terminée !
                      </h3>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-gray-400 text-sm mb-1">Taille originale</p>
                          <p className="text-white text-2xl font-bold">{formatSize(originalSize)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-sm mb-1">Taille optimisée</p>
                          <p className="text-green-300 text-2xl font-bold">{formatSize(optimizedSize)}</p>
                        </div>
                      </div>
                      <div className="bg-green-500/20 rounded-lg p-3 text-center">
                        <p className="text-green-200 text-sm mb-1">Réduction</p>
                        <p className="text-green-300 text-3xl font-bold">
                          {getReduction() > 0 ? `-${getReduction()}%` : 'Aucune réduction'}
                        </p>
                        {getReduction() > 0 && (
                          <p className="text-green-400 text-sm mt-1">
                            Économie de {formatSize(originalSize - optimizedSize)}
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={downloadOptimized}
                      className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold py-4 rounded-lg transition-all transform hover:scale-105 flex items-center justify-center gap-2"
                    >
                      <span className="text-xl">⬇️</span>
                      Télécharger le GLB optimisé
                    </button>

                    <button
                      onClick={() => {
                        setFile(null);
                        setOptimizedBlob(null);
                        setOptimizedSize(0);
                      }}
                      className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg transition"
                    >
                      Optimiser un autre fichier
                    </button>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4">
                    <p className="text-red-300">❌ {error}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}