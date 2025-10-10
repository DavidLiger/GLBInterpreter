import React, { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";

type Props = {
  isPlaying: boolean;
  isPaused: boolean;
  isEnded: boolean; // ✅ nouveau
  progress: number;
  duration: number;
  onTogglePlayPause: () => void;
  onSeek: (time: number) => void;
};

export default function POIPlayer({
  isPlaying,
  isPaused,
  isEnded,
  progress,
  duration,
  onTogglePlayPause,
  onSeek,
}: Props) {
  const progressPercent = (progress / duration) * 100;
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleSeek = (clientX: number) => {
    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const newTime = Math.min(Math.max(0, (x / rect.width) * duration), duration);
    onSeek(newTime);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleSeek(e.clientX);
  };
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    handleSeek(e.touches[0].clientX);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    handleSeek(e.clientX);
  };
  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging) return;
    handleSeek(e.touches[0].clientX);
  };

  const handleEnd = () => {
    if (isDragging) setIsDragging(false);
  };

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleEnd);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", handleEnd);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleEnd);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging]);

  // 🔘 Bouton de contrôle unique
  const renderControlButton = () => {
    if (isEnded) {
      // ✅ à la fin, afficher Replay
      return (
        <button onClick={() => onSeek(0)}>
          <img
            src="/icons/dioramas/UI/replay_btn.png"
            alt="Replay"
            className="w-6 h-6"
          />
        </button>
      );
    }

    if (!isPlaying) {
      return (
        <button onClick={onTogglePlayPause}>
          <img
            src="/icons/dioramas/UI/play_btn.png"
            alt="Play"
            className="w-6 h-6"
          />
        </button>
      );
    }

    if (isPaused) {
      return (
        <button onClick={onTogglePlayPause}>
          <img
            src="/icons/dioramas/UI/play_btn.png"
            alt="Resume"
            className="w-6 h-6"
          />
        </button>
      );
    }

    return (
      <button onClick={onTogglePlayPause}>
        <img
          src="/icons/dioramas/UI/pause_btn.png"
          alt="Pause"
          className="w-6 h-6"
        />
      </button>
    );
  };

  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-3/4 max-w-2xl bg-black/30 backdrop-blur-xl rounded-full px-4 py-2 flex items-center justify-between shadow-lg text-white gap-3">
      {/* 🔘 Bouton unique */}
      <div className="flex items-center gap-3">{renderControlButton()}</div>

      {/* 🕓 Timeline */}
      <div
        ref={progressBarRef}
        className="relative flex-1 h-2 bg-gray-600 rounded-full cursor-pointer mx-3"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <motion.div
          className="absolute top-0 left-0 h-2 bg-white rounded-full"
          style={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.05 }}
        />
        <motion.div
          className="absolute -top-1 w-4 h-4 bg-white rounded-full shadow-md"
          style={{ left: `calc(${progressPercent}% - 8px)` }}
        />
      </div>

      {/* ⏱️ Temps */}
      <div className="text-xs text-gray-300 whitespace-nowrap">
        {progress.toFixed(1)}s / {duration.toFixed(1)}s
      </div>
    </div>
  );
}
