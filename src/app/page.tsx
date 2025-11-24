'use client'

import HeaderV2 from "@/components/common/Header";
import BooksSection from "@/components/books/BooksSection";
import CollectionsSection from "@/components/books/CollectionsSection";
import Footer from "@/components/common/Footer";
import Copyright from "@/components/common/Copyright";
import content from "../content/content.json";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-300 text-gray-900">
      <HeaderV2 
        header={content.header}
        howItWorks={content.howItWorks}
      />
      
      <main className="pt-48">
        {/* Section des livres */}
        <BooksSection />
        
        {/* Section des collections */}
        <CollectionsSection 
          title={content.collectionsSection.title}
          collections={content.collections}
        />
        
        <Copyright />
      </main>
      
      <Footer />
    </div>
  );
}