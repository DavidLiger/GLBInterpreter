'use client'

import { useEffect, useRef, useState } from "react";
import localFont from "next/font/local";
import CollectionModal from "./CollectionModal";
import { getAssetUrl } from "../diorama/lib/assets";
import content from "@/content/content.json";
import { useHomeTranslation } from "@/contexts/HomeTranslationContext";

const HandyGeorge = localFont({
  src: "../../../public/fonts/HandyGeorge.ttf",
  variable: "--font-HandyGeorge",
});

interface CollectionsSectionProps {
  title: string;
}

type CollectionId = 'scifi' | 'fantasy' | 'thriller';

export default function CollectionsSection({ title }: CollectionsSectionProps) {
  const { t } = useHomeTranslation();
  
  // ✅ Stocker l'ID au lieu de l'objet
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const checkOverflow = () => {
      setIsOverflowing(container.scrollWidth > container.clientWidth);
    };

    checkOverflow();
    window.addEventListener("resize", checkOverflow);
    return () => window.removeEventListener("resize", checkOverflow);
  }, []);

  return (
    <>
      <section className="py-12 px-6 max-w-full mx-auto relative">
        <h2 className={`${HandyGeorge.className} text-4xl font-bold text-center mb-8 tracking-tighter`}>
          {title}
        </h2>
        <div
          ref={containerRef}
          className={`flex flex-col items-center space-y-6 md:flex-row md:space-x-8 md:space-y-0 overflow-x-auto md:overflow-x-auto 
                      ${isOverflowing ? "justify-start" : "justify-center"}`}
        >
          {/* ✅ Utiliser content.json + traductions */}
          {content.collections.map((collection) => {
            const collectionInfo = t.collections[collection.id as CollectionId];
            
            return (
              <div
                key={collection.id}
                className="flex-shrink-0 w-80 md:w-96 relative rounded-2xl overflow-hidden shadow-lg mb-6 md:mb-0 cursor-pointer hover:scale-105 transition-transform"
                onClick={() => setSelectedCollectionId(collection.id)} // ✅ Stocker l'ID
              >
                <img
                  src={getAssetUrl(collection.image)}
                  alt={collectionInfo.name}
                  className="w-full h-64 md:h-72 object-cover"
                />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-4">
                  <p className="text-white font-semibold text-2xl text-center">
                    {collectionInfo.name} {/* ✅ Traduit */}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Modale */}
      <CollectionModal
        isOpen={selectedCollectionId !== null}
        onClose={() => setSelectedCollectionId(null)}
        collectionId={selectedCollectionId || undefined} // ✅ Passer l'ID
      />
    </>
  );
}