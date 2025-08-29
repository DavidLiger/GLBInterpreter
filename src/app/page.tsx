'use client'

import { useRef } from "react";
import Header from "../components/Header";
import BooksSection from "../components/BooksSection";
import Extrait from "../components/Extrait";
import Footer from "../components/Footer";
import DiscoverSection from "../components/DiscoverSection";

export default function Home() {
  const discoverRef = useRef<HTMLDivElement>(null);

  // Fonction pour scroller vers DiscoverSection
  const scrollToDiscover = () => {
    if (discoverRef.current) {
      const yOffset = -120; // hauteur approximative du header + marge
      const y = discoverRef.current.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
      <Header onDiscoverClick={scrollToDiscover} />
      <main className="pt-64"> {/* Ajuste selon la hauteur du header */}
        <BooksSection />
        {/* <Extrait /> */}
        <div ref={discoverRef}>
          <DiscoverSection />
        </div>
      </main>
      <Footer />
    </div>
  );
}
