"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { POI } from "@/types/diorama";

interface POIBreadcrumbsProps {
  currentPOI: string | null;
  goToPOI: (poi: POI) => void;
  findPOIRecursively: (id: string) => POI | null;
  findParentPOI: (id: string) => POI | null;
  configPOIs: POI[];
}

export default function POIBreadcrumbs({
  currentPOI,
  goToPOI,
  findPOIRecursively,
  findParentPOI,
  configPOIs,
}: POIBreadcrumbsProps) {
  if (!currentPOI) return null;

  const activePOI = findPOIRecursively(currentPOI);
  const parent = activePOI ? findParentPOI(activePOI.id) : null;

  // ── Construire la liste ordonnée des POIs ──
  const breadcrumbList: { poi: POI; type: "sibling" | "parent" | "active" | "child" }[] = [];

  // 1️⃣ Parent à gauche si présent
  if (parent) {
    breadcrumbList.push({ poi: parent, type: "parent" });

    // Siblings du parent, sauf le POI actif
    parent.children?.forEach((sibling) => {
      if (sibling.id !== activePOI?.id) breadcrumbList.push({ poi: sibling, type: "sibling" });
    });
  } else {
    // Racines si pas de parent
    configPOIs.forEach((p) => {
      if (p.id !== activePOI?.id) breadcrumbList.push({ poi: p, type: "sibling" });
    });
  }

  // 2️⃣ POI actif
  if (activePOI) breadcrumbList.push({ poi: activePOI, type: "active" });

  // 3️⃣ Enfants du POI actif
  activePOI?.children?.forEach((child) => breadcrumbList.push({ poi: child, type: "child" }));

  // ── Rendu ──
  return (
    <div className="absolute top-4 left-4 z-50 flex items-center gap-2 bg-zinc-900/70 backdrop-blur-md rounded-xl px-4 py-2 shadow-lg border border-white/10">
      <AnimatePresence>
        {breadcrumbList.map((item, index) => {
          const prevItem = breadcrumbList[index - 1];
          let separator = "";

          if (index > 0) {
            // Parent < Actif
            if (prevItem?.type === "parent" && item.type === "active") separator = "<";
            // Actif > Enfants
            else if (prevItem?.type === "active" && item.type === "child") separator = ">";
            // Siblings | Siblings
            else separator = "|";
          }

          return (
            <React.Fragment key={item.poi.id}>
              {separator && <span className="text-white/50">{separator}</span>}

              <motion.button
                onClick={() => item.type !== "active" && goToPOI(item.poi)}
                disabled={item.type === "active"}
                className={`flex flex-col items-center justify-center px-2 py-1 rounded-lg transition ${
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
                <span className="text-xs mt-1 truncate max-w-[80px]">
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
