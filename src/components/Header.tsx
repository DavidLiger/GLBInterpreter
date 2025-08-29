'use client'

import { useEffect, useState } from "react";
import content from "../content/content.json";
import localFont from "next/font/local";

interface HeaderProps {
  onDiscoverClick?: () => void; // on passe la fonction scroll ici
}

const VictorianPolice = localFont({
  src: "../../public/fonts/Victorian_Art_Magic_Remains.ttf",
  variable: "--font-Victorian_Art_Magic_Remains", // optionnel si tu veux l'utiliser avec Tailwind
});

const BullstandRegular = localFont({
  src: "../../public/fonts/Bullstand-Regular.ttf",
  variable: "--font-Bullstand-Regular", // optionnel si tu veux l'utiliser avec Tailwind
});

const Alstoria = localFont({
  src: "../../public/fonts/Alstoria.ttf",
  variable: "--font-Alstoria", // optionnel si tu veux l'utiliser avec Tailwind
});

export default function Header({ onDiscoverClick }: HeaderProps) {
  const { title, subtitle, cta, backgroundImage } = content.header;
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
      className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${scrolled ? "h-20" : "h-48 sm:h-56 xs:h-48"}`}
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
        className={`relative z-10 w-full px-6 flex items-center justify-between transition-all duration-300 ${scrolled ? "h-20" : "flex-col justify-center h-full text-center"}`}
      >
        <h1 className={`${Alstoria.className} font-bold transition-all duration-300 text-white ${scrolled ? "text-4xl text-left" : "text-7xl"}`}>
          {title}
        </h1>

        {!scrolled && (
          <p className={`${BullstandRegular.className} text-2xl text-white sm:text-3xl mb-2`}>
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
