"use client";

import React from "react";

type POIPlayerProps = {
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  onReplay: () => void;
};

const POIPlayer: React.FC<POIPlayerProps> = ({
  isPlaying,
  onPlay,
  onStop,
  onReplay,
}) => {
  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/50 p-2 rounded flex gap-2 z-50">
      <button
        onClick={isPlaying ? onStop : onPlay}
        className="bg-white/20 px-3 py-1 rounded hover:bg-white/40"
      >
        {isPlaying ? "Pause" : "Play"}
      </button>
      <button
        onClick={onReplay}
        className="bg-white/20 px-3 py-1 rounded hover:bg-white/40"
      >
        Replay
      </button>
    </div>
  );
};

export default POIPlayer;
