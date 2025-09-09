"use client";

import React, { useState, useEffect, useRef } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

type Layer = { image: string; zIndex: number };
type MenuItem = {
  id: string;
  icon: string;
  label?: string;
  focus: { x: number; y: number; zoom?: number }; // Normalisé entre 0 et 1
  child?: DioramaConfig;
};

export type DioramaConfig = {
  layers: Layer[];
  menu?: MenuItem[];
};

export default function DioramaViewer2D({ config }: { config: DioramaConfig }) {
  const [target, setTarget] = useState<{ x: number; y: number; zoom: number } | null>(null);
  const transformRef = useRef<any>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // 🔍 Calcul et application du zoom/focus
  useEffect(() => {
    if (target && transformRef.current && imageContainerRef.current) {
      const { width, height } = imageContainerRef.current.getBoundingClientRect();
      const { x, y, zoom } = target;

      const absX = x * width; // Convertir coordonnée normalisée en pixels
      const absY = y * height;

      transformRef.current.setTransform(
        -absX + window.innerWidth / 2,
        -absY + window.innerHeight / 2,
        zoom
      );

      setTarget(null);
    }
  }, [target]);

  if (!config) {
    return <div className="flex items-center justify-center h-screen">Chargement...</div>;
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black">
      {/* Menu latéral */}
      {config.menu && (
        <div className="absolute top-1/2 left-4 transform -translate-y-1/2 z-50 flex flex-col gap-4">
          {config.menu.map((item) => (
            <button
              key={item.id}
              onClick={() =>
                setTarget({
                  x: item.focus.x,
                  y: item.focus.y,
                  zoom: item.focus.zoom || 2,
                })
              }
              className="bg-white rounded-full shadow-lg p-2 hover:scale-110 transition"
              title={item.label}
            >
              <img src={item.icon} alt={item.label} className="w-8 h-8" />
            </button>
          ))}
        </div>
      )}

      {/* Viewer principal */}
      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={1}
        maxScale={3}
        centerOnInit
        wheel={{ step: 0.1 }}
        doubleClick={{ disabled: true }}
      >
        <TransformComponent>
          <div ref={imageContainerRef} className="relative w-screen h-screen">
            {[...config.layers]
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((layer) => (
                <img
                  key={layer.image}
                  src={layer.image}
                  className="absolute top-0 left-0 w-full h-full object-contain"
                  style={{ zIndex: layer.zIndex }}
                  alt="Layer"
                />
              ))}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
