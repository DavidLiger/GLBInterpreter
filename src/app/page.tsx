'use client'

import { useRef } from "react";
import Header from "../components/Header";
import BooksSection from "../components/BooksSection";
import Footer from "../components/Footer";
import DiscoverSection from "../components/DiscoverSection";
import content from "../content/content.json";
import Copyright from "@/components/Copyright";

export default function Home() {
  const discoverRef = useRef<HTMLDivElement>(null);

  // Fonction pour scroller vers DiscoverSection
  const scrollToDiscover = () => {
    if (discoverRef.current) {
      const yOffset = -60; // hauteur approximative du header + marge
      const y = discoverRef.current.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-300 text-gray-900">
      <Header onDiscoverClick={scrollToDiscover} />
      <main className="pt-48"> {/* Ajuste selon la hauteur du header */}
        <BooksSection />
        <div ref={discoverRef}>
          <DiscoverSection />
        </div>
        <Copyright />
      </main>
      <Footer />
    </div>
  );
}
