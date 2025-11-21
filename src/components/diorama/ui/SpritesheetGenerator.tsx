// src/components/diorama/ui/SpritesheetGenerator.tsx
"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SpritesheetGeneratorProps {
  onOpenChange?: (isOpen: boolean) => void; // ✅
}

interface SpritesheetResult {
  imageBlob: Blob;
  config: {
    columns: number;
    rows: number;
    totalFrames: number;
    fps: number;
  };
  filename: string;
}

type DitheringAlgorithm = 'none' | 'floyd-steinberg' | 'threshold' | 'atkinson';

export default function SpritesheetGenerator({ onOpenChange }: SpritesheetGeneratorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sourceType, setSourceType] = useState<'video' | 'images'>('video');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SpritesheetResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Options de base
  const [fps, setFps] = useState(24);
  const [maxFrames, setMaxFrames] = useState(48);
  const [frameWidth, setFrameWidth] = useState(256);
  const [frameHeight, setFrameHeight] = useState(256);
  const [columns, setColumns] = useState(8);
  const [quality, setQuality] = useState(0.8);
  const [filename, setFilename] = useState('spritesheet');

  // ✅ Nouvelles options
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [dithering, setDithering] = useState<DitheringAlgorithm>('none');
  const [forceBlackAndWhite, setForceBlackAndWhite] = useState(false);
  const [invertColors, setInvertColors] = useState(false);
  const [forceOneLine, setForceOneLine] = useState(false);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const handleSetIsOpen = (value: boolean) => {
    setIsOpen(value);
    onOpenChange?.(value); // ✅ Notifier le parent
  };

  // ✅ Algorithmes de dithering
  const applyDithering = (imageData: ImageData, algorithm: DitheringAlgorithm): ImageData => {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;

    if (algorithm === 'none') return imageData;

    // Conversion en niveaux de gris d'abord
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = data[i + 1] = data[i + 2] = gray;
    }

    const getPixel = (x: number, y: number) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return 0;
      const idx = (y * width + x) * 4;
      return data[idx];
    };

    const setPixel = (x: number, y: number, value: number) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const idx = (y * width + x) * 4;
      data[idx] = data[idx + 1] = data[idx + 2] = value;
    };

    if (algorithm === 'threshold') {
      // Simple threshold
      for (let i = 0; i < data.length; i += 4) {
        const value = data[i] > 127 ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = value;
      }
    } else if (algorithm === 'floyd-steinberg') {
      // Floyd-Steinberg dithering
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const oldPixel = getPixel(x, y);
          const newPixel = oldPixel > 127 ? 255 : 0;
          setPixel(x, y, newPixel);

          const error = oldPixel - newPixel;
          setPixel(x + 1, y, getPixel(x + 1, y) + error * 7 / 16);
          setPixel(x - 1, y + 1, getPixel(x - 1, y + 1) + error * 3 / 16);
          setPixel(x, y + 1, getPixel(x, y + 1) + error * 5 / 16);
          setPixel(x + 1, y + 1, getPixel(x + 1, y + 1) + error * 1 / 16);
        }
      }
    } else if (algorithm === 'atkinson') {
      // Atkinson dithering
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const oldPixel = getPixel(x, y);
          const newPixel = oldPixel > 127 ? 255 : 0;
          setPixel(x, y, newPixel);

          const error = (oldPixel - newPixel) / 8;
          setPixel(x + 1, y, getPixel(x + 1, y) + error);
          setPixel(x + 2, y, getPixel(x + 2, y) + error);
          setPixel(x - 1, y + 1, getPixel(x - 1, y + 1) + error);
          setPixel(x, y + 1, getPixel(x, y + 1) + error);
          setPixel(x + 1, y + 1, getPixel(x + 1, y + 1) + error);
          setPixel(x, y + 2, getPixel(x, y + 2) + error);
        }
      }
    }

    return imageData;
  };

  // ✅ Effets de post-traitement
  const applyEffects = (imageData: ImageData): ImageData => {
    const data = imageData.data;

    // Force black and white
    if (forceBlackAndWhite) {
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = data[i + 1] = data[i + 2] = gray;
      }
    }

    // Invert colors
    if (invertColors) {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
    }

    return imageData;
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      setVideoFile(file);
      setError(null);

      // Charger la vidéo pour obtenir la durée
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.onloadedmetadata = () => {
        setEndTime(video.duration);
        URL.revokeObjectURL(video.src);
      };
    } else {
      setError("Veuillez sélectionner un fichier vidéo valide");
    }
  };

  const handleImagesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setImageFiles(files);
      setError(null);
    } else {
      setError("Veuillez sélectionner au moins une image");
    }
  };

  const extractFramesFromVideo = async (video: HTMLVideoElement): Promise<ImageData[]> => {
    const canvas = document.createElement('canvas');
    canvas.width = frameWidth;
    canvas.height = frameHeight;
    const ctx = canvas.getContext('2d')!;

    const frames: ImageData[] = [];
    const duration = Math.min(endTime, video.duration) - startTime;
    const frameInterval = 1 / fps;
    const totalPossibleFrames = Math.floor(duration * fps);
    const framesToExtract = Math.min(maxFrames, totalPossibleFrames);

    for (let i = 0; i < framesToExtract; i++) {
      const time = startTime + (i * frameInterval);
      
      video.currentTime = time;
      await new Promise(resolve => {
        video.onseeked = resolve;
      });

      ctx.drawImage(video, 0, 0, frameWidth, frameHeight);
      let imageData = ctx.getImageData(0, 0, frameWidth, frameHeight);

      // ✅ Appliquer les effets
      imageData = applyEffects(imageData);
      imageData = applyDithering(imageData, dithering);

      frames.push(imageData);
      setProgress(Math.round((i / framesToExtract) * 50));
    }

    return frames;
  };

  const loadImagesAsFrames = async (files: File[]): Promise<ImageData[]> => {
    const canvas = document.createElement('canvas');
    canvas.width = frameWidth;
    canvas.height = frameHeight;
    const ctx = canvas.getContext('2d')!;

    const frames: ImageData[] = [];
    const filesToProcess = files.slice(0, maxFrames);

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      const img = await createImageBitmap(file);
      
      ctx.clearRect(0, 0, frameWidth, frameHeight);
      ctx.drawImage(img, 0, 0, frameWidth, frameHeight);
      let imageData = ctx.getImageData(0, 0, frameWidth, frameHeight);

      // ✅ Appliquer les effets
      imageData = applyEffects(imageData);
      imageData = applyDithering(imageData, dithering);

      frames.push(imageData);
      setProgress(Math.round((i / filesToProcess.length) * 50));
    }

    return frames;
  };

  const createSpritesheet = async (frames: ImageData[]): Promise<Blob> => {
    const totalFrames = frames.length;
    
    // ✅ Force one line si demandé
    let finalColumns = columns;
    let finalRows = Math.ceil(totalFrames / columns);
    
    if (forceOneLine) {
      finalColumns = totalFrames;
      finalRows = 1;
    }

    const spritesheetWidth = finalColumns * frameWidth;
    const spritesheetHeight = finalRows * frameHeight;

    const canvas = document.createElement('canvas');
    canvas.width = spritesheetWidth;
    canvas.height = spritesheetHeight;
    const ctx = canvas.getContext('2d')!;

    for (let i = 0; i < totalFrames; i++) {
      const col = i % finalColumns;
      const row = Math.floor(i / finalColumns);
      const x = col * frameWidth;
      const y = row * frameHeight;

      ctx.putImageData(frames[i], x, y);
      setProgress(50 + Math.round((i / totalFrames) * 50));
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Échec conversion WebP"));
        },
        'image/webp',
        quality
      );
    });

    return blob;
  };

  const generateSpritesheet = async () => {
    setIsProcessing(true);
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      let frames: ImageData[];

      if (sourceType === 'video' && videoFile) {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(videoFile);
        video.muted = true;
        
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve;
          video.onerror = reject;
        });

        frames = await extractFramesFromVideo(video);
        URL.revokeObjectURL(video.src);

      } else if (sourceType === 'images' && imageFiles.length > 0) {
        frames = await loadImagesAsFrames(imageFiles);
      } else {
        throw new Error("Aucune source sélectionnée");
      }

      const blob = await createSpritesheet(frames);
      const finalColumns = forceOneLine ? frames.length : columns;
      const finalRows = forceOneLine ? 1 : Math.ceil(frames.length / columns);

      setResult({
        imageBlob: blob,
        config: {
          columns: finalColumns,
          rows: finalRows,
          totalFrames: frames.length,
          fps,
        },
        filename,
      });

      setProgress(100);
    } catch (err) {
      console.error("Erreur génération spritesheet:", err);
      setError(err instanceof Error ? err.message : "Erreur lors de la génération");
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadSpritesheet = () => {
    if (!result) return;

    const url = URL.createObjectURL(result.imageBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.filename}.webp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyConfig = () => {
    if (!result) return;

    const config = {
      type: 'spritesheet',
      spritesheet: result.config,
    };

    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
  };

  const formatSize = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const setCurrentTimeAsStart = () => {
    if (videoPreviewRef.current) {
      setStartTime(videoPreviewRef.current.currentTime);
    }
  };

  const setCurrentTimeAsEnd = () => {
    if (videoPreviewRef.current) {
      setEndTime(videoPreviewRef.current.currentTime);
    }
  };

  return (
    <>
      {/* Bouton flottant */}
      <button
        onClick={() => handleSetIsOpen(true)}
        className="fixed bottom-126 right-4 z-[9998] bg-gradient-to-r from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700 text-white px-4 py-3 rounded-full shadow-lg font-bold flex items-center gap-2 transition-all hover:scale-105"
        title="Générateur Spritesheet"
      >
        <span className="text-xl">🎞️</span>
        <span className="hidden sm:inline">Spritesheet</span>
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
              className="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[900px] sm:max-h-[90vh] bg-gray-900 rounded-2xl z-[9999] overflow-hidden flex flex-col shadow-2xl border border-green-500/30"
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-green-600 to-teal-700 p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🎞️</span>
                  <h2 className="text-white font-bold text-xl">Générateur de Spritesheet</h2>
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
                {/* Source Type */}
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <h3 className="text-white font-bold mb-3">Type de source</h3>
                  <div className="flex gap-4">
                    <button
                      onClick={() => setSourceType('video')}
                      className={`flex-1 py-3 rounded-lg font-medium transition ${
                        sourceType === 'video'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      🎬 Vidéo MP4
                    </button>
                    <button
                      onClick={() => setSourceType('images')}
                      className={`flex-1 py-3 rounded-lg font-medium transition ${
                        sourceType === 'images'
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      🖼️ Série d'images
                    </button>
                  </div>
                </div>

                {/* File Upload */}
                {sourceType === 'video' ? (
                  <div className="bg-gray-800 rounded-lg p-6 border-2 border-dashed border-gray-600 hover:border-green-500 transition">
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/*"
                      onChange={handleVideoSelect}
                      className="hidden"
                    />
                    {!videoFile ? (
                      <button
                        onClick={() => videoInputRef.current?.click()}
                        className="w-full flex flex-col items-center gap-3"
                      >
                        <div className="text-6xl">🎬</div>
                        <p className="text-white font-bold">Sélectionner une vidéo MP4</p>
                        <p className="text-gray-400 text-sm">Cliquez pour parcourir</p>
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium truncate">{videoFile.name}</p>
                            <p className="text-gray-400 text-sm">{formatSize(videoFile.size)}</p>
                          </div>
                          <button
                            onClick={() => setVideoFile(null)}
                            className="text-red-400 hover:text-red-300 ml-2"
                          >
                            ✕
                          </button>
                        </div>
                        
                        {/* Prévisualisation vidéo */}
                        <video
                          ref={videoPreviewRef}
                          src={URL.createObjectURL(videoFile)}
                          controls
                          className="w-full rounded bg-black"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-gray-800 rounded-lg p-6 border-2 border-dashed border-gray-600 hover:border-green-500 transition">
                    <input
                      ref={imagesInputRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      multiple
                      onChange={handleImagesSelect}
                      className="hidden"
                    />
                    {imageFiles.length === 0 ? (
                      <button
                        onClick={() => imagesInputRef.current?.click()}
                        className="w-full flex flex-col items-center gap-3"
                      >
                        <div className="text-6xl">🖼️</div>
                        <p className="text-white font-bold">Sélectionner des images PNG/JPG</p>
                        <p className="text-gray-400 text-sm">Cliquez pour parcourir (multi-sélection)</p>
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-white font-medium">{imageFiles.length} images sélectionnées</p>
                          <button
                            onClick={() => setImageFiles([])}
                            className="text-red-400 hover:text-red-300"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Options */}
                {((sourceType === 'video' && videoFile) || (sourceType === 'images' && imageFiles.length > 0)) && !isProcessing && !result && (
                  <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 space-y-4">
                    <h3 className="text-white font-bold mb-3 flex items-center gap-2">
                      <span>⚙️</span>
                      Options de génération
                    </h3>

                    {/* Nom du fichier */}
                    <div>
                      <label className="text-gray-300 text-sm mb-1 block">Filename (without extension)</label>
                      <input
                        type="text"
                        value={filename}
                        onChange={(e) => setFilename(e.target.value)}
                        className="w-full bg-gray-700 text-white rounded px-3 py-2"
                        placeholder="spritesheet"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {/* Dimensions */}
                      <div>
                        <label className="text-gray-300 text-sm mb-1 block">Width (px)</label>
                        <select
                          value={frameWidth}
                          onChange={(e) => setFrameWidth(parseInt(e.target.value))}
                          className="w-full bg-gray-700 text-white rounded px-3 py-2"
                        >
                          <option value={128}>128</option>
                          <option value={256}>256</option>
                          <option value={512}>512</option>
                          <option value={1024}>1024</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-gray-300 text-sm mb-1 block">Height (px)</label>
                        <select
                          value={frameHeight}
                          onChange={(e) => setFrameHeight(parseInt(e.target.value))}
                          className="w-full bg-gray-700 text-white rounded px-3 py-2"
                        >
                          <option value={128}>128</option>
                          <option value={256}>256</option>
                          <option value={512}>512</option>
                          <option value={1024}>1024</option>
                        </select>
                      </div>

                      {/* FPS */}
                      <div>
                        <label className="text-gray-300 text-sm mb-1 block">Frames per second</label>
                        <select
                          value={fps}
                          onChange={(e) => setFps(parseInt(e.target.value))}
                          className="w-full bg-gray-700 text-white rounded px-3 py-2"
                        >
                          <option value={6}>6 FPS</option>
                          <option value={12}>12 FPS</option>
                          <option value={15}>15 FPS</option>
                          <option value={24}>24 FPS</option>
                          <option value={30}>30 FPS</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-gray-300 text-sm mb-1 block">Max frames</label>
                        <input
                          type="number"
                          value={maxFrames}
                          onChange={(e) => setMaxFrames(parseInt(e.target.value))}
                          className="w-full bg-gray-700 text-white rounded px-3 py-2"
                          min="1"
                          max="200"
                        />
                      </div>
                    </div>

                    {/* ✅ Start/End Time (vidéo uniquement) */}
                    {sourceType === 'video' && videoFile && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-gray-300 text-sm mb-1 block">Start time (seconds)</label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={startTime.toFixed(2)}
                              onChange={(e) => setStartTime(parseFloat(e.target.value))}
                              className="flex-1 bg-gray-700 text-white rounded px-3 py-2"
                              min="0"
                              step="0.1"
                            />
                            <button
                              onClick={setCurrentTimeAsStart}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-xs"
                              title="Use current video time"
                            >
                              📋
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="text-gray-300 text-sm mb-1 block">End time (seconds)</label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={endTime.toFixed(2)}
                              onChange={(e) => setEndTime(parseFloat(e.target.value))}
                              className="flex-1 bg-gray-700 text-white rounded px-3 py-2"
                              min="0"
                              step="0.1"
                            />
                            <button
                              onClick={setCurrentTimeAsEnd}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-xs"
                              title="Use current video time"
                            >
                              📋
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ✅ Dithering */}
                    <div>
                      <label className="text-gray-300 text-sm mb-1 block">Dithering algorithm</label>
                      <select
                        value={dithering}
                        onChange={(e) => setDithering(e.target.value as DitheringAlgorithm)}
                        className="w-full bg-gray-700 text-white rounded px-3 py-2"
                      >
                        <option value="none">None</option>
                        <option value="floyd-steinberg">Floyd-Steinberg</option>
                        <option value="threshold">Threshold</option>
                        <option value="atkinson">Atkinson</option>
                      </select>
                    </div>

                    {/* ✅ Layout */}
                    {!forceOneLine && (
                      <div>
                        <label className="text-gray-300 text-sm mb-1 block">Columns</label>
                        <input
                          type="number"
                          value={columns}
                          onChange={(e) => setColumns(parseInt(e.target.value))}
                          className="w-full bg-gray-700 text-white rounded px-3 py-2"
                          min="1"
                          max="20"
                        />
                      </div>
                    )}

                    {/* ✅ Checkboxes */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-gray-300 cursor-pointer hover:text-white transition">
                        <input
                          type="checkbox"
                          checked={forceBlackAndWhite}
                          onChange={(e) => setForceBlackAndWhite(e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-sm">Force black and white</span>
                      </label>

                      <label className="flex items-center gap-2 text-gray-300 cursor-pointer hover:text-white transition">
                        <input
                          type="checkbox"
                          checked={invertColors}
                          onChange={(e) => setInvertColors(e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-sm">Invert colors</span>
                      </label>

                      <label className="flex items-center gap-2 text-gray-300 cursor-pointer hover:text-white transition">
                        <input
                          type="checkbox"
                          checked={forceOneLine}
                          onChange={(e) => setForceOneLine(e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-sm">Force one line (avoid empty cells)</span>
                      </label>
                    </div>

                    {/* Qualité */}
                    <div>
                      <label className="text-gray-300 text-sm mb-1 block">Qualité WebP</label>
                      <input
                        type="range"
                        value={quality}
                        onChange={(e) => setQuality(parseFloat(e.target.value))}
                        className="w-full"
                        min="0.1"
                        max="1"
                        step="0.1"
                      />
                      <p className="text-gray-400 text-xs text-center">{Math.round(quality * 100)}%</p>
                    </div>

                    <div className="bg-blue-900/30 border border-blue-500/30 rounded p-3 text-sm text-blue-200">
                      <p>📐 Taille finale : {forceOneLine ? maxFrames : columns} × {forceOneLine ? 1 : Math.ceil(maxFrames / columns)} = {(forceOneLine ? maxFrames : columns) * frameWidth}×{(forceOneLine ? 1 : Math.ceil(maxFrames / columns)) * frameHeight}px</p>
                    </div>

                    <button
                      onClick={generateSpritesheet}
                      className="w-full bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white font-bold py-3 rounded-lg transition-all transform hover:scale-105"
                    >
                      🎞️ Générer la Spritesheet
                    </button>
                  </div>
                )}

                {/* Processing */}
                {isProcessing && (
                  <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <div className="text-center space-y-4">
                      <div className="text-6xl animate-pulse">⚙️</div>
                      <p className="text-white font-bold text-xl">Génération en cours...</p>
                      <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-green-500 to-teal-600 transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="text-gray-400 text-sm">{progress}%</p>
                    </div>
                  </div>
                )}

                {/* Results */}
                {result && !isProcessing && (
                  <div className="space-y-4">
                    <div className="bg-gradient-to-br from-green-900/30 to-teal-900/30 border border-green-500/30 rounded-lg p-6">
                      <h3 className="text-green-300 font-bold text-lg mb-4 flex items-center gap-2">
                        <span>✅</span>
                        Spritesheet générée !
                      </h3>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-gray-400 text-sm mb-1">Dimensions</p>
                          <p className="text-white font-bold">{result.config.columns}×{result.config.rows} ({result.config.totalFrames} frames)</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-sm mb-1">Taille</p>
                          <p className="text-green-300 font-bold">{formatSize(result.imageBlob.size)}</p>
                        </div>
                      </div>

                      {/* Preview */}
                      <div className="bg-black/50 rounded p-2 mb-4">
                        <img
                          src={URL.createObjectURL(result.imageBlob)}
                          alt="Spritesheet preview"
                          className="w-full h-auto"
                          style={{ imageRendering: 'pixelated' }}
                        />
                      </div>

                      {/* Config */}
                      <div className="bg-gray-800 rounded p-3 mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-gray-300 text-sm font-bold">Configuration</p>
                          <button
                            onClick={copyConfig}
                            className="text-cyan-400 hover:text-cyan-300 text-xs"
                          >
                            📋 Copier
                          </button>
                        </div>
                        <pre className="text-xs text-green-400 font-mono overflow-x-auto">
{JSON.stringify({
  type: 'spritesheet',
  spritesheet: result.config
}, null, 2)}
                        </pre>
                      </div>
                    </div>

                    <button
                      onClick={downloadSpritesheet}
                      className="w-full bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white font-bold py-4 rounded-lg transition-all transform hover:scale-105 flex items-center justify-center gap-2"
                    >
                      <span className="text-xl">⬇️</span>
                      Télécharger {result.filename}.webp
                    </button>

                    <button
                      onClick={() => {
                        setResult(null);
                        setVideoFile(null);
                        setImageFiles([]);
                      }}
                      className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-lg transition"
                    >
                      Générer une autre spritesheet
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