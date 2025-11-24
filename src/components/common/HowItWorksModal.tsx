'use client'

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from 'qrcode.react';
import { getAssetUrl } from "../diorama/lib/assets";

interface HowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: {
    title: string;
    image: string;
    text: string;
    demoUrl: string;
  };
}

export default function HowItWorksModal({ isOpen, onClose, content }: HowItWorksModalProps) {
  const [scrolled, setScrolled] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const lastState = useRef(false);

  // Détecter si on est sur mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Bloquer le scroll du body et reset état à la fermeture
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setScrolled(false);
      lastState.current = false;
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Détection du scroll avec hystérésis
  useEffect(() => {
    if (!isOpen) return;
    const modal = document.getElementById("how-it-works-modal-content");
    if (!modal) return;

    lastState.current = false;

    const handleScroll = () => {
      const scrollTop = modal.scrollTop;

      requestAnimationFrame(() => {
        if (!lastState.current && scrollTop > 2) {
          setScrolled(true);
          lastState.current = true;
        } else if (lastState.current && scrollTop < 2) {
          setScrolled(false);
          lastState.current = false;
        }
      });
    };

    modal.addEventListener("scroll", handleScroll);
    return () => modal.removeEventListener("scroll", handleScroll);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex justify-end lg:justify-center overflow-hidden"
      onClick={onClose}
    >
      {/* Bouton croix */}
      <button
        onClick={onClose}
        className="fixed right-3 top-3 text-4xl font-bold text-gray-100 z-50 cursor-pointer hover:text-white transition"
      >
        &times;
      </button>

      {/* Contenu de la modale */}
      <div
        id="how-it-works-modal-content"
        className="bg-white w-full sm:w-[80%] lg:max-w-[60%] h-full overflow-auto relative transform transition-transform duration-500"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header sticky */}
        <div className={`sticky top-0 w-full transition-all duration-300 ${scrolled ? "h-20" : "h-48"}`}>
          <img
            src={getAssetUrl(content.image)}
            alt={content.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-2">
            <p className={`text-white font-semibold transition-all duration-300 ${scrolled ? "text-2xl" : "text-3xl text-center mb-5"}`}>
              {content.title}
            </p>
          </div>
        </div>

        {/* Contenu scrollable */}
        <div className="mt-6 flex flex-col gap-6 px-6 pb-24">
          {/* Texte explicatif */}
          <div className="text-gray-700 text-lg leading-relaxed whitespace-pre-line">
            {content.text}
          </div>

          {/* QR Code ou Bouton selon device */}
          <div className="flex flex-col items-center gap-6 mt-8 p-8 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl">
            {!isMobile ? (
              // Desktop : QR Code
              <>
                <h3 className="text-2xl font-bold text-indigo-900 mb-2">
                  Scannez avec votre téléphone
                </h3>
                <div className="bg-white p-6 rounded-xl shadow-lg">
                  <QRCodeSVG
                    value={content.demoUrl}
                    size={256}
                    level="H"
                    includeMargin={true}
                  />
                </div>
                <p className="text-sm text-gray-600 text-center mt-2">
                  Utilisez l'appareil photo de votre smartphone<br/>pour scanner ce QR code
                </p>
              </>
            ) : (
              // Mobile : Bouton
              <>
                <h3 className="text-2xl font-bold text-indigo-900 mb-2 text-center">
                  Essayez maintenant !
                </h3>
                <a
                  href={content.demoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full max-w-md bg-yellow-400 text-black text-center font-bold text-xl px-8 py-4 rounded-2xl shadow-lg hover:bg-yellow-300 transition-all"
                >
                  Lancer la démo 3D
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}