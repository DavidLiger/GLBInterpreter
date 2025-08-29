'use client'

import { useEffect, useRef, useState } from "react";
import content from "../content/content.json";

interface DiscoverItem {
  id: number;
  image: string;
  text: string;
  details?: { image: string; text: string }[];
}

import DiscoverModal from "./DiscoverModal";

export default function DiscoverSection() {
  const { title } = content.discoverSection;
  const { universe } = content;
  const [selectedItem, setSelectedItem] = useState<DiscoverItem | null>(null);
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
      <h2 className="text-3xl font-bold text-center mb-8">{title}</h2>

      <div
        ref={containerRef}
        className={`flex flex-col items-center space-y-6 md:flex-row md:space-x-8 md:space-y-0 overflow-x-auto md:overflow-x-auto 
                    ${isOverflowing ? "justify-start" : "justify-center"}`}
      >
        {universe.map((item: DiscoverItem) => (
          <div
            key={item.id}
            className="flex-shrink-0 w-80 md:w-96 relative rounded-2xl overflow-hidden shadow-lg mb-6 md:mb-0 cursor-pointer"
            onClick={() => setSelectedItem(item)}
          >
            <img
              src={item.image}
              alt={item.text}
              className="w-full h-64 md:h-72 object-cover"
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-4">
              <p className="text-white font-semibold text-2xl text-center">{item.text}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Gradients pour indiquer scroll */}
      {/* <div className="hidden md:block absolute top-0 left-0 w-12 h-full bg-gradient-to-r from-gray-50 pointer-events-none"></div>
      <div className="hidden md:block absolute top-0 right-0 w-12 h-full bg-gradient-to-l from-gray-50 pointer-events-none"></div> */}
    </section>

    {/* Modale */}
    <DiscoverModal
      isOpen={selectedItem !== null}
      onClose={() => setSelectedItem(null)}
      item={selectedItem || undefined}
    />
  </>
);

}
