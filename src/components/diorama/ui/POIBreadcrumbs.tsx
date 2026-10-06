// "use client";
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { POI } from "@/types/diorama";
import { useTranslation } from "@/contexts/TranslationContext";
import ExperienceModal from "./ExperienceModal";
import { usePOIContentCheck } from "../hooks/usePOIContentCheck";

interface POIBreadcrumbsProps {
  currentPOI: string | null;
  goToPOI: (poi: POI) => void;
  findPOIRecursively: (id: string) => POI | null;
  findParentPOI: (id: string) => POI | null;
  configPOIs: POI[];
  isPortrait: boolean;
  viewportHeight: number;
  experienceStarted?: boolean;
  bookId: string;
}

export default function POIBreadcrumbs({
  currentPOI,
  goToPOI,
  findPOIRecursively,
  findParentPOI,
  configPOIs,
  isPortrait,
  viewportHeight,
  experienceStarted = true,
  bookId,
}: POIBreadcrumbsProps) {
  const { lang } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  const activePOI = currentPOI ? findPOIRecursively(currentPOI) : null;
  const parent = activePOI ? findParentPOI(activePOI.id) : null;

  const [selectedPOI, setSelectedPOI] = useState<string | null>(null);
  const isFolioMode = process.env.NEXT_PUBLIC_SITE_TYPE === 'folio';

    // ✅ UTILISER le hook
  const { poisWithContent, contentChecked } = usePOIContentCheck({ 
    sceneId: bookId 
  });

  // ── Construire la liste des breadcrumbs
  const breadcrumbList: { poi: POI; type: "parent" | "active" | "sibling" | "child" }[] = [];

    // ✅ NOUVEAU : Ouvrir automatiquement au démarrage en mode folio
  useEffect(() => {
    // ✅ ATTENDRE que la vérification soit terminée
    if (!contentChecked) return;
    
    if (!isFolioMode || !currentPOI || !experienceStarted) return;
    
    // ✅ SI le POI a du contenu → ouvrir
    if (poisWithContent.has(currentPOI)) {
      console.log('🎬 POI a du contenu, ouvrir modal:', currentPOI);
      setSelectedPOI(currentPOI);
    } else {
      // ✅ SINON → fermer/ne rien faire
      console.log('❌ POI sans contenu, PAS de modal:', currentPOI);
      setSelectedPOI(null);
    }
  }, [contentChecked, isFolioMode, currentPOI, experienceStarted, poisWithContent]);


  if (!activePOI) {
    // 🔹 Aucun actif → afficher tous les POIs racine
    configPOIs.forEach((p) => breadcrumbList.push({ poi: p, type: "active" }));
  } else if (parent) {
    // 🔹 On est sur un enfant → parent > actif > enfants
    breadcrumbList.push({ poi: parent, type: "parent" });
    breadcrumbList.push({ poi: activePOI, type: "active" });

    activePOI.children?.forEach((child) => {
      breadcrumbList.push({ poi: child, type: "child" });
    });
    // Les frères de l’enfant actif ne sont pas affichés
  } else {
    // 🔹 On est sur un parent racine
    // 1️⃣ Ajouter d'abord les siblings racine (les autres parents)
    configPOIs.forEach((p) => {
      if (p.id !== activePOI.id) breadcrumbList.push({ poi: p, type: "sibling" });
    });

    // 2️⃣ Ajouter le parent actif
    breadcrumbList.push({ poi: activePOI, type: "active" });

    // 3️⃣ Ajouter ses enfants
    activePOI.children?.forEach((child) => {
      breadcrumbList.push({ poi: child, type: "child" });
    });
  }

  // ── Layout responsive
  const containerClass = isPortrait
    ? `
      absolute top-2 left-2 z-50 flex flex-row items-center gap-2 
      bg-zinc-900/70 backdrop-blur-md rounded-xl px-4 py-2 shadow-lg border border-white/10
      max-w-[calc(90vw-2rem)] overflow-x-auto
    `
    : `
      absolute top-2 left-2 z-40 
      flex flex-col items-center gap-1
      bg-zinc-900/70 backdrop-blur-md rounded-2xl px-2 py-3 shadow-lg border border-white/10
      overflow-y-auto
    `;

  const separatorClass = isPortrait ? "text-white/50" : "text-white/50 rotate-90";

  // ── Centrer automatiquement le POI actif
  useEffect(() => {
    if (!currentPOI) return;
    const container = containerRef.current;
    const active = activeRef.current;
    if (container && active) {
      if (isPortrait) {
        const scrollLeft =
          active.offsetLeft - container.offsetWidth / 2 + active.offsetWidth / 2;
        container.scrollTo({ left: scrollLeft, behavior: "smooth" });
      } else {
        const scrollTop =
          active.offsetTop - container.offsetHeight / 2 + active.offsetHeight / 2;
        container.scrollTo({ top: scrollTop, behavior: "smooth" });
      }
    }
  }, [currentPOI, isPortrait]);

  if (!currentPOI) return null;

  // ── Rendu
  return (
    <>
    <style jsx>{`
      div::-webkit-scrollbar {
        display: none;
      }
      div {
        -ms-overflow-style: none;
        scrollbar-width: none;
      }
    `}</style>
    <div
      ref={containerRef}
      className={containerClass}
      style={{ maxHeight: !isPortrait ? `${viewportHeight - 60}px` : undefined }}
    >
      <AnimatePresence mode="sync">
        {breadcrumbList.map((item, index) => {
          const prevItem = breadcrumbList[index - 1];
          let separator = "";

          if (index > 0) {
            if (prevItem?.type === "parent" && item.type === "active") separator = "<";
            else if (prevItem?.type === "active" && item.type === "child") separator = ">";
            else if (prevItem?.type === "active" && item.type === "sibling") separator = "|";
            else separator = "|";
          }

          const hasContent = poisWithContent.has(item.poi.id);

          return (
            <React.Fragment key={`${item.poi.id}-${item.type}`}>
              {separator && <span className={separatorClass}>{separator}</span>}

              <motion.button
                ref={item.type === "active" ? activeRef : null}
                key={`btn-${item.poi.id}`}
                title={item.poi.label[lang]}
                onClick={() => {
                  if (item.type !== "active") {
                    goToPOI(item.poi);
                  }
                  
                  // ✅ Ouvrir modal SEULEMENT si contenu vérifié ET existant
                  if (isFolioMode && contentChecked && poisWithContent.has(item.poi.id)) {
                    setSelectedPOI(item.poi.id);
                  }
                }}
                disabled={item.type === "active"}
                className={`flex flex-col items-center justify-center px-1 py-2 rounded-lg transition ${
                  item.type === "active"
                    ? "bg-white/20 text-white cursor-default"
                    : "hover:bg-white/10 text-white/80 hover:text-white"
                } relative`}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
              >
                {item.poi.icon && (
                  <img
                    src={item.poi.icon}
                    alt={item.poi.label[lang]}
                    className={`w-10 h-10 object-contain ${
                      item.type === "active" ? "opacity-100" : "opacity-80"
                    }`}
                  />
                )}
                <span className="text-xs mt-1 truncate max-w-[60px]">
                  {item.poi.label[lang]}
                </span>
              </motion.button>
            </React.Fragment>
          );
        })}
      </AnimatePresence>
    </div>
    {/* ✅ Modal expérience */}
    {isFolioMode && selectedPOI && poisWithContent.has(selectedPOI) ? (
      <ExperienceModal
        poiId={selectedPOI}
        isOpen={true}
        onClose={() => setSelectedPOI(null)}
        baseUrl="https://webdiorama-proxy.david-liger-pro.workers.dev/assets/folio/content"
        isPortrait={isPortrait}
      />
    ) : null}
    </>
  );
}
