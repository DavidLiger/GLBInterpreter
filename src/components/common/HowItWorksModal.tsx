'use client'

import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from 'qrcode.react';
import { getAssetUrl } from "../diorama/lib/assets";
import { useHomeTranslation } from "@/contexts/HomeTranslationContext";

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
  const { t } = useHomeTranslation();
  const [scrolled, setScrolled] = useState(false);
  
  // États pour la détection
  const [isMobileWidth, setIsMobileWidth] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  
  const lastState = useRef(false);

  // ✅ Détection unique et sûre (taille écran + type d'appareil)
  useEffect(() => {
    const handleResize = () => {
      // 1. Vérifie la largeur (pour le CSS/Layout)
      setIsMobileWidth(window.innerWidth < 768);
    };

    const checkUserAgent = () => {
      // 2. Vérifie si c'est un appareil mobile (pour la logique QR Code vs Bouton)
      // On le fait ici pour éviter l'erreur "navigator is not defined" côté serveur
      const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
      const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
      setIsMobileDevice(isMobileUA);
    };
    
    // Initialisation
    handleResize();
    checkUserAgent();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Bloquer le scroll du body et reset état
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
        const threshold = isMobileWidth ? 1 : 2; // Utilisation de isMobileWidth ici
        
        if (!lastState.current && scrollTop > threshold) {
          setScrolled(true);
          lastState.current = true;
        } else if (lastState.current && scrollTop < threshold) {
          setScrolled(false);
          lastState.current = false;
        }
      });
    };

    modal.addEventListener("scroll", handleScroll);
    return () => modal.removeEventListener("scroll", handleScroll);
  }, [isOpen, isMobileWidth]); // Dépendance mise à jour

  if (!isOpen) return null;

  // Logique d'affichage :
  // On affiche le QR Code SEULEMENT SI :
  // 1. L'écran est assez large (!isMobileWidth)
  // 2. ET ce n'est pas un téléphone/tablette (!isMobileDevice)
  const showQRCode = !isMobileWidth && !isMobileDevice;

  return (
    <div
      className="fixed inset-0 z-60 bg-black/70 flex justify-end lg:justify-center overflow-hidden"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="fixed right-3 top-3 text-4xl font-bold text-gray-100 z-50 cursor-pointer hover:text-white transition"
      >
        &times;
      </button>

      <div
        id="how-it-works-modal-content"
        className="bg-white w-full sm:w-[80%] lg:max-w-[60%] h-full overflow-auto relative transform transition-transform duration-500"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`sticky top-0 w-full transition-all duration-300 ${
          scrolled ? "h-20" : isMobileWidth ? "h-32" : "h-48"
        }`}>
          <img
            src={getAssetUrl(content.image)}
            alt={t.howItWorks.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-2">
            <p className={`text-white font-semibold transition-all duration-300 ${
              scrolled 
                ? "text-xl" 
                : isMobileWidth 
                  ? "text-2xl text-center" 
                  : "text-3xl text-center mb-5"
            }`}>
              {t.howItWorks.title}
            </p>
          </div>
        </div>

        {/* Contenu */}
        <div className={`mt-6 flex flex-col gap-6 px-6 ${isMobileWidth ? "pb-32" : "pb-24"}`}>
          <div className="text-gray-700 text-lg leading-relaxed whitespace-pre-line">
            {t.howItWorks.text}
          </div>

          <div className="flex flex-col items-center gap-6 mt-8 p-8 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl">
            {showQRCode ? (
              // ✅ Desktop uniquement (PC)
              <>
                <h3 className="text-2xl font-bold text-indigo-900 mb-2">
                  {t.howItWorks.scanTitle}
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
                  {t.howItWorks.scanSubtitle}<br/>{t.howItWorks.scanSubtitle2}
                </p>
              </>
            ) : (
              // ✅ Mobile (Portrait) OU Mobile (Paysage)
              <>
                <h3 className="text-2xl font-bold text-indigo-900 mb-2 text-center">
                  {t.howItWorks.demoTitle}
                </h3>
                <a
                  href={content.demoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full max-w-md bg-yellow-400 text-black text-center font-bold text-xl px-8 py-4 rounded-2xl shadow-lg hover:bg-yellow-300 transition-all"
                >
                  {t.howItWorks.demoButton}
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}