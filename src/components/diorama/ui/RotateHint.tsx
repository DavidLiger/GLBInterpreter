"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

interface RotateHintProps {
  show: boolean;
}

export default function RotateHint({ show }: RotateHintProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="absolute top-24 inset-x-0 z-50 flex justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <img
            src="icons/dioramas/UI/rotate-phone.png"
            alt="Tournez le téléphone"
            className="w-32 h-20 opacity-60 rounded-lg"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
