'use client'

import { useEffect, useState } from "react";
import content from "../../content/content.json";
import localFont from "next/font/local";
import HowItWorksModal from "./HowItWorksModal";
import { getAssetUrl } from "../diorama/lib/assets";
import { useHomeTranslation } from "@/contexts/HomeTranslationContext";

const HandyGeorge = localFont({
  src: "../../../public/fonts/HandyGeorge.ttf",
  variable: "--font-HandyGeorge",
});

interface HeaderProps {
  header: {
    titleLine1: string;
    titleLine2: string;
    subtitle: string;
    cta: { label: string };
    backgroundImage: string;
    logo: string;
  };
  howItWorks: {
    title: string;
    image: string;
    text: string;
    demoUrl: string;
  };
  onScrollChange?: (scrolled: boolean) => void;
}


export default function Header({ header, howItWorks, onScrollChange }: HeaderProps) {
  const { t } = useHomeTranslation();
  const { titleLine1, titleLine2, subtitle, cta, backgroundImage, logo } = content.header;
  const [scrolled, setScrolled] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const isScrolled = window.scrollY > 50;
      setScrolled(isScrolled);
      onScrollChange?.(isScrolled); 
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [onScrollChange]);

  // Fonction pour remonter en haut de page
  const handleLogoClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
  <>
    <header
      className={`fixed top-0 left-0 w-full z-50 transition-all duration-700 ease-in-out ${
        scrolled ? "h-24 shadow-xl" : "h-56"
      }`}
    >
      {/* --- 1. FONDS --- */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-700"
        style={{ backgroundImage: `url(${getAssetUrl(backgroundImage)})` }}
      ></div>

      <div className={`absolute inset-0 bg-gradient-to-r from-purple-800 to-indigo-700 transition-all duration-700 ${scrolled ? "opacity-60" : "opacity-30"}`}></div>

      {/* --- 2. GROUPE LOGO + TEXTE "IGER" (ANIMATION SYNCHRO) --- */}
      
      {/* A. Le Logo "L" */}
      <img 
        src={getAssetUrl(logo)} 
        alt="Logo Liger" 
        onClick={handleLogoClick} // Ajout de l'action au clic
        className={`absolute z-20 object-contain transition-all duration-700 ease-in-out cursor-pointer
          ${scrolled 
            ? "left-4 top-2 h-20 w-auto"  // SCROLLÉ : À gauche, grand
            : "left-1/2 top-1/2 -translate-y-[4.4rem] -translate-x-[4.8rem] h-14 w-auto" // NON-SCROLLÉ
          }
        `}
      />

      {/* B. Le Texte "iger" */}
      {/* Il est maintenant ABSOLUTE pour pouvoir glisser physiquement vers la gauche comme l'image */}
      <h1 
        // Optionnel : Tu peux aussi ajouter le onClick ici si tu veux que cliquer sur le texte remonte aussi la page
        // onClick={handleLogoClick} 
        // className={`... cursor-pointer ...`}
        className={`${HandyGeorge.className} font-bold text-black absolute z-20 transition-all duration-700 ease-in-out whitespace-nowrap
          ${scrolled 
            /* --- POSITION SCROLLÉE --- */
            /* Mobile : on cache. Desktop (md) : on affiche à gauche du logo */
            ? "opacity-0 scale-60 left-4 top-10 md:opacity-100 md:scale-100 md:left-20 md:top-10 md:text-5xl" 
            
            /* --- POSITION NON-SCROLLÉE --- */
            /* On le place au centre. */
            : "opacity-100 scale-90 text-5xl left-1/2 top-31 -translate-y-[4.4rem] -translate-x-[2.3rem]" 
          }
        `}
      >
        {t.header.titleLine2.slice(1)}
      </h1>

      {/* --- 3. AUTRES ÉLÉMENTS DU CONTENU --- */}
      <div
        className="relative z-10 w-full h-full px-4 flex flex-col items-center mt-2 pointer-events-none" // pointer-events-none pour laisser cliquer les éléments absolute si besoin
      >
        {/* Titre ligne 1 ("Éditions") */}
          <div className={`overflow-hidden transition-all duration-300 ${scrolled ? "max-h-0 opacity-0 mb-0" : "max-h-20 opacity-100"} mb-2 mr-3 -translate-x-[0.3rem]`}>
          <p className={`${HandyGeorge.className} font-bold text-white text-3xl text-center`}>
              {t.header.titleLine1}
          </p>
        </div>

        {/* Sous-titre ("Livres augmentés") */}
        <div 
          className={`transition-all duration-700 ease-in-out pointer-events-auto
            ${scrolled 
              /* SCROLLÉ : Absolute au centre (Desktop uniquement) */
              ? "max-h-0 opacity-0 md:max-h-20 md:opacity-100 md:absolute md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2" 
              /* NON-SCROLLÉ : Dans le flux, sous le titre */
              : "max-h-20 opacity-100 mt-14 relative" 
            }
          `}
        >
          <p className={`${HandyGeorge.className} text-white text-center ${scrolled ? "text-3xl" : "text-2xl sm:text-3xl"}`}>
            {t.header.subtitle}
          </p>
        </div>

      </div>

      {/* --- 4. BOUTON CTA --- */}
      <div className={`absolute z-30 transition-all duration-700 ease-in-out ${scrolled ? "right-4 top-9" : "right-4 top-38"}`}>
        <button
          onClick={() => setIsModalOpen(true)}
          className={`bg-yellow-400 text-black font-semibold px-6 py-3 rounded-2xl shadow hover:bg-yellow-300 transition-all cursor-pointer duration-300`}
        >
          {scrolled ? t.header.cta.shortLabel : t.header.cta.label}
        </button>
      </div>
      
    </header>
          {/* Modale "C'est quoi un livre augmenté ?" */}
        <HowItWorksModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          content={howItWorks}
        />
  </>
);
}