'use client'

import { useEffect, useRef, useState } from "react";
import { getAssetUrl } from "../diorama/lib/assets";

interface Collection {
  id: number;
  name: string;
  image: string;
  description?: string;
  details?: { image: string; text: string }[];
}

interface CollectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  collection?: Collection;
}

export default function CollectionModal({ isOpen, onClose, collection }: CollectionModalProps) {
  const [scrolled, setScrolled] = useState(false);
  const lastState = useRef(false);

  const SCROLL_UP = 2;
  const SCROLL_DOWN = 2;

  // Bloquer le scroll du body et reset état à la fermeture
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setScrolled(false);
      lastState.current = false;
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Détection du scroll avec hystérésis
  useEffect(() => {
    if (!isOpen) return;
    const modal = document.getElementById("collection-modal-content");
    if (!modal) return;

    lastState.current = false;

    const handleScroll = () => {
      const scrollTop = modal.scrollTop;

      requestAnimationFrame(() => {
        if (!lastState.current && scrollTop > SCROLL_UP) {
          setScrolled(true);
          lastState.current = true;
        } else if (lastState.current && scrollTop < SCROLL_DOWN) {
          setScrolled(false);
          lastState.current = false;
        }
      });
    };

    modal.addEventListener("scroll", handleScroll);
    return () => modal.removeEventListener("scroll", handleScroll);
  }, [isOpen]);

  if (!isOpen || !collection) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex justify-end lg:justify-center overflow-hidden"
      onClick={onClose}
    >
      {/* Bouton croix */}
      <button
        onClick={onClose}
        className="fixed right-3 top-3 text-4xl font-bold text-gray-100 z-50 cursor-pointer hover:text-white transition"
      >
        &times;
      </button>

      {/* Contenu de la modale */}
      <div
        id="collection-modal-content"
        className="bg-white w-full sm:w-[80%] lg:max-w-[60%] h-full overflow-auto relative transform transition-transform duration-500"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header sticky */}
        <div className={`sticky top-0 w-full transition-all duration-300 ${scrolled ? "h-20" : "h-48"}`}>
          <img
            src={getAssetUrl(collection.image)}
            alt={collection.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-2">
            <p className={`text-white font-semibold transition-all duration-300 ${scrolled ? "text-2xl" : "text-3xl text-center mb-5"}`}>
              {collection.name}
            </p>
          </div>
        </div>

        {/* Contenu scrollable */}
        <div className="mt-6 flex flex-col gap-6 px-4 pb-24">
          {/* Description de la collection */}
          {collection.description && (
            <div className="text-gray-700 text-lg p-4 bg-gray-50 rounded-lg">
              {collection.description}
            </div>
          )}

          {/* Détails (images + textes) */}
          {collection.details?.map((detail, idx) => (
            <div key={idx} className="w-full">
              <img
                src={getAssetUrl(detail.image)}
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