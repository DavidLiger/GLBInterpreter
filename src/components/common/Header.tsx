'use client'

import { useEffect, useState } from "react";
import content from "../../content/content.json";
import localFont from "next/font/local";

interface HeaderProps {
  onDiscoverClick?: () => void; // on passe la fonction scroll ici
}

const VictorianPolice = localFont({
  src: "../../../public/fonts/Victorian_Art_Magic_Remains.ttf",
  variable: "--font-Victorian_Art_Magic_Remains", // optionnel si tu veux l'utiliser avec Tailwind
});

const BullstandRegular = localFont({
  src: "../../../public/fonts/Bullstand-Regular.ttf",
  variable: "--font-Bullstand-Regular", // optionnel si tu veux l'utiliser avec Tailwind
});

const Alstoria = localFont({
  src: "../../../public/fonts/Alstoria.ttf",
  variable: "--font-Alstoria", // optionnel si tu veux l'utiliser avec Tailwind
});

const HandyGeorge = localFont({
  src: "../../../public/fonts/HandyGeorge.ttf",
  variable: "--font-HandyGeorge", // optionnel si tu veux l'utiliser avec Tailwind
});


export default function Header({ onDiscoverClick }: HeaderProps) {
  const { titleLine1, titleLine2, subtitle, cta, backgroundImage, logo } = content.header;
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 w-full z-50 transition-all duration-700 ease-in-out ${
        scrolled ? "h-28 shadow-xl" : "h-52 sm:h-56 xs:h-48"
      }`}
    >
      {/* --- 1. FONDS --- */}
      {/* Image de fond */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-700"
        style={{ backgroundImage: `url(${backgroundImage})` }}
      ></div>

      {/* Overlay gradient */}
      <div className={`absolute inset-0 bg-gradient-to-r from-purple-800 to-indigo-700 transition-all duration-700 ${scrolled ? "opacity-60" : "opacity-30"}`}></div>

      {/* --- 2. LOGO VOLANT (L) --- */}
      {/* C'est lui qui fait l'animation Centre -> Gauche */}
      <img 
        src={logo} 
        alt="Logo Liger" 
        className={`absolute z-10 object-contain transition-all duration-700 ease-in-out
          ${scrolled 
            ? "left-4 top-2 h-24 w-auto"  // SCROLLÉ : Collé à gauche, GRANDE taille (h-24 = 96px)
            : "left-1/2 top-1/2 -translate-y-[4.4rem] -translate-x-[4.8rem] h-14 w-auto" // NON-SCROLLÉ : Au centre (ajusté pour coller au texte), taille normale
          }
        `}
      />

      {/* --- 3. CONTENU TEXTE --- */}
      <div
        className={`relative z-50 w-full h-full px-4 flex flex-col items-center transition-all duration-700 mt-2`}
      >
        {/* Titre ligne 1 ("Éditions") */}
        <div className={`overflow-hidden transition-all duration-300 ${scrolled ? "max-h-0 opacity-0 mb-0" : "max-h-20 opacity-100"} mb-2 mr-3`}>
          <p className={`${HandyGeorge.className} font-bold text-white text-3xl text-center`}>
              {titleLine1}
          </p>
        </div>

        {/* Reste du titre ("iger") */}
        {/* On ajoute un ml-10 (margin-left) ou translate quand non-scrollé pour compenser le trou laissé par le L */}
        <div className={`transition-all duration-700 flex items-center ${scrolled ? "opacity-0" : "opacity-100"} translate-x-4`}>
          <h1 className={`${HandyGeorge.className} font-bold text-black text-5xl`}>
            {titleLine2.slice(1)}
          </h1>
        </div>

        {/* Sous-titre */}
        <div className={`overflow-hidden transition-all duration-300 ${scrolled ? "max-h-0 opacity-0 mt-0" : "max-h-20 opacity-100 mt-2"}`}>
          <p className={`${HandyGeorge.className} text-3xl text-white sm:text-4xl text-center`}>
            {subtitle}
          </p>
        </div>

        {/* Bouton CTA (Apparaît à droite au scroll) */}
        <div className={`absolute  ${scrolled ? "right-4 top-10" : "right-4 top-38"} transition-all duration-700 `}>
          <button
            onClick={onDiscoverClick}
            className={`bg-yellow-400 text-black font-semibold px-6 py-3 rounded-2xl shadow hover:bg-yellow-300 transition-all cursor-pointer duration-300 ${
              scrolled ? "ml-auto" : ""
            }`}
          >
            {scrolled ? "Découvrir l'univers..." : cta.label}
          </button>
        </div>
        
      </div>
    </header>
  );

  return (
    <header
      className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${scrolled ? "h-25" : "h-52 sm:h-56 xs:h-48"}`}
    >
      {/* Image de fond */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${backgroundImage})` }}
      ></div>

      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-purple-800 to-indigo-700 opacity-30"></div>

      {/* Contenu */}
      <div
        className={`relative z-10 w-full px-2 flex items-center justify-between transition-all duration-300 ${scrolled ? "h-25" : "flex-col justify-center h-full text-center"}`}
      >
        {!scrolled &&
          <p className={`${HandyGeorge.className} font-bold transition-all duration-300 text-white ${scrolled ? "text-2xl text-left" : "text-3xl"}`}>
            {titleLine1}
          </p>
        }
        <h1 className={`${HandyGeorge.className} font-bold transition-all duration-300 text-white ${scrolled ? "text-4xl text-left" : "text-5xl"}`}>
          {titleLine2}
        </h1>

        {!scrolled && (
          <p className={`${HandyGeorge.className} text-3xl text-white sm:text-4xl mb-2`}>
            {subtitle}
          </p>
        
        )}

      <button
        onClick={onDiscoverClick}
        className={`bg-yellow-400 text-black font-semibold px-6 py-3 rounded-2xl shadow hover:bg-yellow-300 transition-all cursor-pointer duration-300 ${
          scrolled ? "ml-auto" : ""
        }`}
      >
        {scrolled ? "Découvrir l'univers..." : cta.label}
      </button>

      </div>
    </header>
  );
}
