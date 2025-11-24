'use client'

import { useEffect, useRef, useState } from "react";
import localFont from "next/font/local";
import CollectionModal from "./CollectionModal";
import { getAssetUrl } from "../diorama/lib/assets";

const HandyGeorge = localFont({
  src: "../../../public/fonts/HandyGeorge.ttf",
  variable: "--font-HandyGeorge",
});

// 1. Définir le détail (utilisé dans Book et Collection)
interface Detail {
  image: string;
  text: string;
}

// 2. Définir la structure d'un Livre
interface Book {
  id: number;
  onForeground?: boolean; // Optionnel (?) ou obligatoire selon tes besoins
  title: string;
  summary: string;
  image: string;
  link?: string;
  details?: Detail[];
}

// 3. Mettre à jour la Collection pour inclure les livres complets
interface Collection {
  id: number;
  name: string;
  image: string;
  description?: string;
  // C'est ici que ça change : ce n'est plus "number[]" mais "Book[]"
  books: Book[]; 
  details?: Detail[];
}

interface CollectionsSectionProps {
  title: string;
  collections: Collection[];
}

export default function CollectionsSection({ title, collections }: CollectionsSectionProps) {
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
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
          {collections.map((collection) => (
            <div
              key={collection.id}
              className="flex-shrink-0 w-80 md:w-96 relative rounded-2xl overflow-hidden shadow-lg mb-6 md:mb-0 cursor-pointer hover:scale-105 transition-transform"
              onClick={() => setSelectedCollection(collection)}
            >
              <img
                src={getAssetUrl(collection.image)}
                alt={collection.name}
                className="w-full h-64 md:h-72 object-cover"
              />
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-4">
                <p className="text-white font-semibold text-2xl text-center">{collection.name}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Modale */}
      <CollectionModal
        isOpen={selectedCollection !== null}
        onClose={() => setSelectedCollection(null)}
        collection={selectedCollection || undefined}
      />
    </>
  );
}