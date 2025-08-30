import Image from "next/image";
import content from "../content/content.json";

interface AmazonButtonProps {
  href: string;
  label?: string; // <-- option pour changer le texte
}

export default function AmazonButton({ href, label }: AmazonButtonProps) {
  const { title } = content.amazonButton;

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
      {label || title} {/* si on passe label="Acheter", il prend le dessus */}
    </a>
  );
}
