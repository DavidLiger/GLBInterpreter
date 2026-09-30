'use client'

import { getAssetUrl } from "../diorama/lib/assets";

interface BookCoverProps {
  image: string;
  title: string;
  publisherText: string;
  disclaimerText: string;
  coverImage?: string;
}

export default function BookCover({ image, title, publisherText, disclaimerText, coverImage }: BookCoverProps) {
  // ✅ Si on a une vraie couverture, l'afficher directement
  if (coverImage) {
    return (
      <div className="relative w-full aspect-[2/3] bg-white shadow-2xl overflow-hidden rounded-lg">
        <img
          src={getAssetUrl(coverImage)}
          alt={title}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }
  
  return (
    <div className="relative w-full aspect-[2/3] bg-white shadow-2xl overflow-hidden rounded-lg">
      {/* Titre en haut */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4">
        <h3 className="text-white text-xl sm:text-2xl font-bold text-center drop-shadow-lg">
          {title}
        </h3>
      </div>

      {/* Image de couverture */}
      <img
        src={getAssetUrl(image)}
        alt={title}
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Footer "Éditions Liger" */}
      <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-4">
        <p className="text-white text-base font-semibold text-center drop-shadow-lg">
          {publisherText}
        </p>
      </div>

      {/* Bandeau diagonal "Image non contractuelle" */}
      <div className="absolute top-12 -right-16 z-20 rotate-45 bg-red-600 text-white px-20 py-2 shadow-lg">
        <p className="text-xs font-bold uppercase tracking-wider whitespace-nowrap">
          {disclaimerText}
        </p>
      </div>
    </div>
  );
}