"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Maximize2, Minimize2, ExternalLink, Calendar, Code, Award } from "lucide-react";
import type { ExperienceContent } from "@/types/experience";
import ProjectTemplate from "./templates/ProjectTemplate";
import JobTemplate from "./templates/JobTemplate";
import AchievementTemplate from "./templates/AchievementTemplate";
import SkillsTemplate from "./templates/SkillsTemplate";
interface ExperienceModalProps {
  poiId: string;
  isOpen: boolean;
  onClose: () => void;
  baseUrl: "https://webdiorama-proxy.david-liger-pro.workers.dev/assets/folio/content"
  isPortrait: boolean;
}

export default function ExperienceModal({
  poiId,
  isOpen,
  onClose,
  baseUrl,
  isPortrait,
}: ExperienceModalProps) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState<ExperienceContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const lastLoadedPOIRef = useRef<string | null>(null);

  // 🔄 Charger le contenu depuis R2
  useEffect(() => {
    if (!isOpen || !poiId) return;
    
    // ✅ CRITIQUE : Ne charger que si différent du dernier
    if (lastLoadedPOIRef.current === poiId) {
      console.log("♻️ Contenu déjà chargé pour:", poiId);
      return;
    }

    const fetchContent = async () => {
      setLoading(true);
      setError(null);

      try {
        const url = `${baseUrl}/${poiId}.json`;
        console.log("📥 Chargement expérience:", url);

        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        setContent(data);
        lastLoadedPOIRef.current = poiId; // ✅ Mémoriser
      } catch (err) {
        console.error("❌ Erreur chargement expérience:", err);
        setError("Impossible de charger l'expérience");
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [isOpen, poiId, baseUrl]);

  // ✅ Reset expanded quand on change de POI (pas quand isOpen change)
  useEffect(() => {
    if (poiId !== lastLoadedPOIRef.current) {
      setExpanded(false);
    }
  }, [poiId]);

  // 🎨 Rendu selon le template
  const renderTemplate = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin text-4xl">⚙️</div>
        </div>
      );
    }

    if (error || !content) {
      return (
        <div className="text-center p-8 text-red-400">
          <p>{error || "Contenu introuvable"}</p>
        </div>
      );
    }

    switch (content.template) {
      case 'project':
        return <ProjectTemplate content={content} expanded={expanded} />;
      case 'job':
        return <JobTemplate content={content} expanded={expanded} />;
      case 'achievement':
        return <AchievementTemplate content={content} expanded={expanded} />;
      case 'skills':
        return <SkillsTemplate content={content} expanded={expanded} />;
      default:
        return <ProjectTemplate content={content} expanded={expanded} />;
    }
  };

  if (!isOpen) return null;

    // ✅ NOUVEAU : Configurations responsive
  const positionClasses = isPortrait
    ? "right-4 top-28" // Portrait : à droite
    : "top-2 left-1/2 -translate-x-1/2"; // Paysage : en haut centré
    // : "top-16 right-4";

  const animations = isPortrait
    ? {
        initial: { x: 400, opacity: 0 },
        animate: { x: 0, opacity: 1 },
        exit: { x: 400, opacity: 0 },
      }
    : {
        initial: { y: -100, opacity: 0 },
        animate: { y: 0, opacity: 1 },
        exit: { y: -100, opacity: 0 },
      };

  const sizeClasses = expanded
    ? isPortrait
      ? "w-[90vw] max-w-3xl h-[calc(90vh-5rem)]"
      : "w-[90vw] max-w-4xl h-[85vh]"
    : "w-80";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={poiId}
        initial={animations.initial}
        animate={animations.animate}
        exit={animations.exit}
        transition={{
          type: "tween",
          duration: 0.3,
          ease: [0.25, 0.1, 0.25, 1],
        }}
        onAnimationStart={() => setIsAnimating(true)}
        onAnimationComplete={() => setIsAnimating(false)}
        style={{
          willChange: isAnimating ? 'transform, opacity' : 'auto',
          transform: 'translateZ(0)',
        }}
        className={`
          fixed ${positionClasses} z-[100]
          bg-gradient-to-br from-gray-900/95 via-black/95 to-gray-900/95
          backdrop-blur-xl
          border border-white/10
          rounded-2xl
          shadow-2xl
          overflow-hidden
          transition-all duration-300
          ${sizeClasses}
        `}
      >
        {/* Header - TOUJOURS visible */}
        <div className="flex items-center justify-between p-2 border-b border-white/10 bg-white/5">
          <div className="flex-1 min-w-0">
            {content && (
              <>
                <h3 className="text-white font-bold text-md truncate">
                  {content.title}
                </h3>
                {content.subtitle && (
                  <p className="text-gray-400 text-xs truncate">
                    {content.subtitle}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2 ml-4">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-2 hover:bg-white/10 rounded-lg transition text-white"
              aria-label={expanded ? "Réduire" : "Agrandir"}
            >
              {expanded ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          </div>
        </div>

        {/* Contenu SEULEMENT si expanded */}
        {expanded && (
          <div className={`overflow-y-auto ${
            isPortrait ? 'h-[calc(90vh-9rem)]' : 'h-[calc(85vh-5rem)]'
          }`}>
            {renderTemplate()}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}