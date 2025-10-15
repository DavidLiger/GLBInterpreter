"use client";

import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { POI } from "@/types/diorama";

interface POIBreadcrumbsProps {
  currentPOI: string | null;
  goToPOI: (poi: POI) => void;
  findPOIRecursively: (id: string) => POI | null;
  findParentPOI: (id: string) => POI | null;
  configPOIs: POI[];
  isPortrait: boolean;
  viewportHeight: number; 
}

export default function POIBreadcrumbs({
  currentPOI,
  goToPOI,
  findPOIRecursively,
  findParentPOI,
  configPOIs,
  isPortrait,
  viewportHeight
}: POIBreadcrumbsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  const activePOI = currentPOI ? findPOIRecursively(currentPOI) : null;
  const parent = activePOI ? findParentPOI(activePOI.id) : null;

  // ── Construire la liste ordonnée des POIs ──
  const breadcrumbList: { poi: POI; type: "sibling" | "parent" | "active" | "child" }[] = [];

  if (parent) {
    breadcrumbList.push({ poi: parent, type: "parent" });
    parent.children?.forEach((sibling) => {
      if (sibling.id !== activePOI?.id)
        breadcrumbList.push({ poi: sibling, type: "sibling" });
    });
  } else {
    configPOIs.forEach((p) => {
      if (p.id !== activePOI?.id)
        breadcrumbList.push({ poi: p, type: "sibling" });
    });
  }

  if (activePOI) breadcrumbList.push({ poi: activePOI, type: "active" });
  activePOI?.children?.forEach((child) =>
    breadcrumbList.push({ poi: child, type: "child" })
  );

  // ── Layout responsive ──
  const containerClass = isPortrait
    ? `
      absolute top-2 left-2 z-50 flex flex-row items-center gap-2 
      bg-zinc-900/70 backdrop-blur-md rounded-xl px-4 py-2 shadow-lg border border-white/10
      max-w-[calc(90vw-2rem)] overflow-x-auto scrollbar-none
    `
    : `
      absolute top-2 left-2 z-40 
      flex flex-col items-center gap-1
      bg-zinc-900/70 backdrop-blur-md rounded-2xl px-2 py-3 shadow-lg border border-white/10
      overflow-y-auto scrollbar-none
    `;


  const separatorClass = isPortrait ? "text-white/50" : "text-white/50 rotate-90";

  // 🪄 Centrer automatiquement l’actif dans la vue
  useEffect(() => {
    if (!currentPOI) return;
    const container = containerRef.current;
    const active = activeRef.current;
    if (container && active) {
      if (isPortrait) {
        const scrollLeft =
          active.offsetLeft -
          container.offsetWidth / 2 +
          active.offsetWidth / 2;
        container.scrollTo({ left: scrollLeft, behavior: "smooth" });
      } else {
        const scrollTop =
          active.offsetTop -
          container.offsetHeight / 2 +
          active.offsetHeight / 2;
        container.scrollTo({ top: scrollTop, behavior: "smooth" });
      }
    }
  }, [currentPOI, isPortrait]);

  // 🧱 Important : Rendu conditionnel APRÈS les hooks
  if (!currentPOI) return null;

  return (
    <div 
      ref={containerRef} 
      className={containerClass}
      style={{
      maxHeight: !isPortrait ? `${viewportHeight - 60}px` : undefined, // 👈 ajustement auto
    }}>
      <AnimatePresence mode="sync">
        {breadcrumbList.map((item, index) => {
          const prevItem = breadcrumbList[index - 1];
          let separator = "";

          if (index > 0) {
            if (prevItem?.type === "parent" && item.type === "active") separator = "<";
            else if (prevItem?.type === "active" && item.type === "child") separator = ">";
            else separator = "|";
          }

          return (
            <React.Fragment key={`${item.poi.id}-${item.type}`}>
              {separator && (
                <span className={separatorClass} key={`sep-${index}`}>
                  {separator}
                </span>
              )}

              <motion.button
                ref={item.type === "active" ? activeRef : null}
                key={`btn-${item.poi.id}`}
                onClick={() => item.type !== "active" && goToPOI(item.poi)}
                disabled={item.type === "active"}
                className={`flex flex-col items-center justify-center px-1 py-2 rounded-lg transition ${
                  item.type === "active"
                    ? "bg-white/20 text-white cursor-default"
                    : "hover:bg-white/10 text-white/80 hover:text-white"
                }`}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
              >
                {item.poi.icon && (
                  <img
                    src={item.poi.icon}
                    alt={item.poi.label}
                    className={`w-6 h-6 object-contain ${
                      item.type === "active" ? "opacity-100" : "opacity-80"
                    }`}
                  />
                )}
                <span className="text-xs mt-1 truncate max-w-[60px]">
                  {item.poi.label}
                </span>
              </motion.button>
            </React.Fragment>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
