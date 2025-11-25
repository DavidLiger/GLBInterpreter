import Image from "next/image";
import { useHomeTranslation } from "@/contexts/HomeTranslationContext";

interface AmazonButtonProps {
  href: string;
  label?: string; 
}

// ⚠️ Ajout de "label" ici dans les accolades
export default function AmazonButton({ href, label }: AmazonButtonProps) {
  const { t } = useHomeTranslation();

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 bg-white text-[#FF9900] shadow-lg font-semibold px-4 py-2 rounded-lg hover:bg-[#e68a00] hover:text-white transition"
    >
      <Image
        src="/icons/amazon-color-svgrepo-com.svg"
        alt="Amazon"
        width={20}
        height={20}
      />
      {/* 
         Si un label est fourni (ex: version courte quand on scroll), on l'affiche.
         Sinon, on affiche le titre par défaut du fichier de traduction.
      */}
      {label || t.amazonButton.title} 
    </a>
  );
}