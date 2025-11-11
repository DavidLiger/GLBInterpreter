"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import BackButton from "./BackButton";
import type { POI } from "@/types/diorama";
import { useTranslation } from "@/contexts/TranslationContext";

interface POIButtonsProps {
  parentPOI: POI | null;
  visiblePOIs: POI[];
  goToPOI: (poi: POI) => void;
}

export default function POIButtons({ parentPOI, visiblePOIs, goToPOI }: POIButtonsProps) {
  const { lang } = useTranslation();
  return (
    <div className="absolute top-4 left-4 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {parentPOI && <BackButton onClick={() => goToPOI(parentPOI)} />}
      </AnimatePresence>

      <AnimatePresence>
        {visiblePOIs.map((poi) => (
          <motion.button
            key={poi.id}
            onClick={() => goToPOI(poi)}
            title={poi.label[lang]}
            className="bg-white rounded-full w-12 h-12 flex items-center justify-center"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.img
              src={poi.icon}
              alt={poi.label[lang]}
              className="w-8 h-8 object-contain"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ duration: 0.3 }}
            />
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
