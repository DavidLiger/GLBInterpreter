'use client'

import { useEffect } from "react";

interface Detail {
  image: string;
  text: string;
}

interface Item {
  id: number;
  image: string;
  text: string;
  details?: Detail[];
}

interface DiscoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  item?: Item;
}

export default function DiscoverModal({ isOpen, onClose, item }: DiscoverModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !item) return null;

  return (
<div
  className="fixed inset-0 z-50 bg-black/70 flex justify-end lg:justify-center overflow-hidden"
  onClick={onClose}
>

      {/* Bouton croix indépendant */}
      <button
        onClick={onClose}
        className="fixed top-4 right-7 text-5xl font-bold text-gray-800 z-50 cursor-pointer"
      >
        &times;
      </button>

      {/* Modale principale */}
      <div
        className={`bg-white w-full sm:w-[80%] lg:max-w-[60%] h-full overflow-auto relative transform transition-transform duration-500
                    ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        onClick={(e) => e.stopPropagation()}
      >

        {/* Main image fixe */}
        <div className="sticky top-0 w-full h-[180px] z-10">
        <img src={item.image} alt={item.text} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-1">
            <p className="text-white font-semibold text-center text-sm">{item.text}</p>
        </div>
        </div>

        {/* Details scrollables */}
        <div className="mt-6 flex flex-col gap-6 px-4 pb-8">
          {item.details?.map((detail, idx) => (
            <div key={idx} className="w-full">
              <img src={detail.image} alt={detail.text} className="w-full h-auto object-cover rounded-lg" />
              <p className="mt-2 text-center font-medium">{detail.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
