'use client'

import HeaderV2 from "@/components/common/Header";
import BooksSection from "@/components/books/BooksSection";
import CollectionsSection from "@/components/books/CollectionsSection";
import Footer from "@/components/common/Footer";
import Copyright from "@/components/common/Copyright";
import content from "../content/content.json";
import { HomeTranslationProvider } from "@/contexts/HomeTranslationContext";
import HomeLanguageSelector from "@/components/common/HomeLanguageSelector";
import { useState } from "react";

export default function Home() {
  const [headerScrolled, setHeaderScrolled] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-gray-300 text-gray-900">
      <HomeTranslationProvider>
        <HeaderV2 
          header={content.header}
          howItWorks={content.howItWorks}
          onScrollChange={setHeaderScrolled} // ✅ Passer le callback
        />
        
        {/* ✅ Afficher seulement quand pas scrolled */}
        {!headerScrolled && <HomeLanguageSelector />}
        
        <main className="pt-48">
          <BooksSection />
          <CollectionsSection 
            title={content.collectionsSection.title}
            collections={content.collections}
          />
          <Copyright />
        </main>
        
        <Footer />
      </HomeTranslationProvider>
    </div>
  );
}