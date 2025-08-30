'use client'

import { useEffect, useRef, useState } from "react";

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
  const [scrolled, setScrolled] = useState(false);
  const lastState = useRef(false); // ✅ Mémorise l'état du scroll

  // Bloquer le scroll du body
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Détection du scroll avec hystérésis
  useEffect(() => {
    if (!isOpen) return;
    const modal = document.getElementById("discover-modal-content");

    const handleScroll = () => {
      if (!modal) return;
      const scrollTop = modal.scrollTop;

      if (!lastState.current && scrollTop > 250) {
        setScrolled(true);
        lastState.current = true;
      } else if (lastState.current && scrollTop < 5) {
        setScrolled(false);
        lastState.current = false;
      }
    };

    modal?.addEventListener("scroll", handleScroll);
    return () => modal?.removeEventListener("scroll", handleScroll);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setScrolled(false);       // ← reset état scroll
      lastState.current = false; // ← reset l’hystérésis
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen || !item) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex justify-end lg:justify-center overflow-hidden"
      onClick={onClose}
    >
      {/* Bouton croix */}
      <button
        onClick={onClose}
        className="fixed right-3 text-4xl font-bold text-gray-100 z-50 cursor-pointer"
      >
        &times;
      </button>

      {/* Contenu de la modale */}
      <div
        id="discover-modal-content"
        className={`bg-white w-full sm:w-[80%] lg:max-w-[60%] h-full overflow-auto relative transform transition-transform duration-500
                    ${isOpen ? "translate-x-0" : "translate-x-full"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header sticky */}
        <div
          className={`sticky top-0 w-full transition-all duration-300 ${
            scrolled ? "h-20" : "h-48"
          }`}
        >
          {/* Image */}
          <img
            src={item.image}
            alt={item.text}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div
            className={`absolute inset-0 bg-black/50 flex items-center justify-center p-2`}
          >
            <p
              className={`text-white font-semibold transition-all duration-300 ${
                scrolled ? "text-2xl text-center" : "text-3xl text-center mb-5"
              }`}
            >
              {item.text}
            </p>
          </div>
        </div>

        {/* Contenu scrollable */}
        <div className="mt-6 flex flex-col gap-6 px-4 pb-24">
          {item.details?.map((detail, idx) => (
            <div key={idx} className="w-full">
              <img
                src={detail.image}
                alt={detail.text}
                className="w-full h-auto object-cover rounded-lg"
              />
              <p className="mt-2 text-center font-medium">{detail.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
