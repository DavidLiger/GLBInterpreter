import React, { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";

type Props = {
  isPlaying: boolean;
  isPaused: boolean;
  isEnded: boolean;
  isWaitingAudio?: boolean;
  progress: number;
  duration: number;
  onTogglePlayPause: () => void;
  onSeek: (time: number) => void;
  onStop: () => void; 
  isPortrait?: boolean; // <- nouveau
  autoplayEnabled?: boolean; // ✅ NOUVEAU
  onToggleAutoplay?: () => void;
};

export default function POIPlayer({
  isPlaying,
  isPaused,
  isEnded,
  isWaitingAudio = false,
  progress,
  duration,
  onTogglePlayPause,
  onSeek,
  onStop,
  isPortrait = false,
  autoplayEnabled = true, // ✅ NOUVEAU
  onToggleAutoplay,
}: Props) {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const playerWidth = isPortrait ? 60 : 75; // en %
  const buttonGap = 8; // gap en pixels

  const handleSeek = (clientX: number) => {
    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const newTime = Math.min(Math.max(0, (x / rect.width) * duration), duration);
    console.log("🎯 [POIPlayer] handleSeek appelé, newTime:", newTime); // ✅ LOG
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

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  const renderControlButton = () => {
    if (isWaitingAudio) {
      return (
        <div className="w-6 h-6 flex items-center justify-center">
          <div className="animate-spin text-lg">⚙️</div>
        </div>
      );
    }
    if (isEnded) {
      return (
        <button onClick={onTogglePlayPause}>
          <img src="icons/dioramas/UI/replay_btn.png" alt="Replay" className="w-6 h-6" />
        </button>
      );
    }

    if (!isPlaying || isPaused) {
      return (
        <button onClick={onTogglePlayPause}>
          <img src="icons/dioramas/UI/play_btn.png" alt="Play" className="w-6 h-6" />
        </button>
      );
    }

    return (
      <button onClick={onTogglePlayPause}>
        <img src="icons/dioramas/UI/pause_btn.png" alt="Pause" className="w-6 h-6" />
      </button>
    );
  };

   return (
    <>
      {/* ✅ Bouton autoplay à droite, 20px du bas */}
      {onToggleAutoplay && (
        <button
          onClick={onToggleAutoplay}
          className={`
            fixed bottom-14 right-2 z-40
            px-3 py-1.5 rounded-full 
            backdrop-blur-md
            flex items-center justify-center gap-1.5
            transition-all duration-200
            ${autoplayEnabled 
              ? 'bg-blue-500/30 hover:bg-blue-500/40 border border-blue-400/30 text-blue-200' 
              : 'bg-gray-700/30 hover:bg-gray-700/40 border border-gray-600/30 text-gray-400'
            }
          `}
          title={autoplayEnabled ? "Désactiver l'autoplay" : "Activer l'autoplay"}
        >
          <span className={`text-sm transition-opacity ${autoplayEnabled ? 'opacity-100' : 'opacity-40'}`}>
            🎬
          </span>
          <span className="text-xs font-medium uppercase tracking-wide whitespace-nowrap">
            Autoplay
          </span>
        </button>
      )}

      {/* Player principal */}
      <div 
      className="absolute bottom-2 -translate-x-1/2 w-3/4 max-w-2xl bg-black/30 backdrop-blur-xl rounded-full px-4 py-2 flex items-center justify-between shadow-lg text-white gap-3"
        style={{
          width: isPortrait ? "60%" : "75%",
          left: isPortrait ? "35%" : "40%",
        }}
      >
        <div className="flex items-center gap-1">
          {progress > 0 && !isEnded && (
            <button onClick={onStop}>
              <img src="icons/dioramas/UI/stop_btn.png" alt="Stop" className="w-5 h-5" />
            </button>
          )}
          {renderControlButton()}
        </div>

        <div
          ref={progressBarRef}
          className="relative flex-1 h-2 bg-gray-600 rounded-full cursor-pointer mx-3 touch-none"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          <motion.div
            className="absolute top-0 left-0 h-2 bg-white rounded-full"
            style={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.05 }}
          />
          <motion.div
            className="absolute -top-1 w-4 h-4 bg-white rounded-full shadow-md pointer-events-auto touch-none"
            style={{ left: `calc(${progressPercent}% - 8px)` }}
          />
        </div>

        <div className="text-xs text-gray-300 whitespace-nowrap">
          {formatTime(progress)} / {formatTime(duration)}
        </div>
      </div>
    </>
  );
}
