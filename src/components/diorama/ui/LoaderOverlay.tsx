"use client";

import React from "react";
import { motion } from "framer-motion";

interface LoaderOverlayProps {
  isPortrait: boolean;
  isMobile: boolean;
  loadingProgress: number;
  sceneName?: string;
  loaderImage?: string;
  fontClassName?: string;
}

export default function LoaderOverlay({
  isPortrait,
  isMobile,
  loadingProgress,
  sceneName,
  loaderImage,
  fontClassName,
}: LoaderOverlayProps) {
  return (
    <motion.div
      className="absolute inset-0 flex bg-black z-100 px-4"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div
        className={`w-full flex flex-col items-center ${
          !isPortrait ? "h-screen justify-center gap-4 py-4" : "justify-center gap-8 py-8"
        }`}
        style={{ minHeight: 0 }}
      >
        <h1
          className={`${fontClassName} text-white font-bold`}
          style={{ fontSize: !isPortrait ? "clamp(20px, 4.5vw, 28px)" : "clamp(28px, 6vw, 48px)" }}
        >
          {sceneName ?? "Scene Diorama"}
        </h1>

        <div className={`relative flex items-center justify-center w-full max-w-3xl px-4 ${!isPortrait ? "h-[60vh]" : "flex-col gap-6"}`}>
          <img
            src={loaderImage ?? "/icons/dioramas/UI/scene-preview.png"}
            alt="Scene Preview"
            className="object-contain flex-shrink-0"
            style={{
              width: !isPortrait ? "clamp(140px, 30vw, 240px)" : "clamp(180px, 36vw, 320px)",
              height: !isPortrait ? "clamp(140px, 30vw, 240px)" : "clamp(180px, 36vw, 320px)",
            }}
          />

          {!isPortrait ? (
            <div className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col gap-4 text-white">
              <div className="flex flex-col items-center gap-1">
                <img src={isMobile ? "/icons/dioramas/UI/one-finger.png" : "/icons/dioramas/UI/mouse-left-click.png"} className="w-8 h-8" />
                <span className="text-sm">{isMobile ? "Tourner" : "Cliquer / Glisser"}</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <img src={isMobile ? "/icons/dioramas/UI/two-fingers.png" : "/icons/dioramas/UI/mouse-scroll.png"} className="w-8 h-8" />
                <span className="text-sm">Zoomer</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-row gap-12 mt-6 text-white">
              <div className="flex flex-col items-center gap-1">
                <img src={isMobile ? "/icons/dioramas/UI/one-finger.png" : "/icons/dioramas/UI/mouse-left-click.png"} className="w-8 h-8" />
                <span className="text-sm">{isMobile ? "Tourner" : "Cliquer / Glisser"}</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <img src={isMobile ? "/icons/dioramas/UI/two-fingers.png" : "/icons/dioramas/UI/mouse-scroll.png"} className="w-8 h-8" />
                <span className="text-sm">Zoomer</span>
              </div>
            </div>
          )}
        </div>

        <div className="w-full max-w-2xl flex flex-col items-center mt-3">
          <div className="w-64 h-3 bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-green-500"
              initial={{ width: 0 }}
              animate={{ width: `${loadingProgress}%` }}
              transition={{ ease: "easeOut", duration: 0.2 }}
            />
          </div>
          <span className="text-white mt-2 text-sm">{Math.round(loadingProgress)}%</span>
        </div>
      </div>
    </motion.div>
  );
}
