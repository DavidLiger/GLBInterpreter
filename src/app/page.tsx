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

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Éditions Liger',
    url: 'https://editions-liger.com',
    logo: 'https://editions-liger.com/images/logo.png',
    description: 'Maison d\'édition spécialisée dans les livres augmentés avec expériences 3D immersives',
    sameAs: [
      'https://www.instagram.com/editionsliger',
      'https://www.facebook.com/editionsliger'
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="min-h-screen flex flex-col bg-gray-300 text-gray-900">
        <HomeTranslationProvider>
          <HeaderV2 
            header={content.header}
            howItWorks={content.howItWorks}
            onScrollChange={setHeaderScrolled}
          />
          
          {!headerScrolled && <HomeLanguageSelector />}
          
          <main className="pt-48">
            <BooksSection />
            <CollectionsSection 
              title={content.collectionsSection.title}
            />
            <Copyright />
          </main>
          
          <Footer />
        </HomeTranslationProvider>
      </div>
    </>
  );
}