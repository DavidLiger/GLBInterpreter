import Image from "next/image";

interface AmazonButtonProps {
  href: string;
}

export default function AmazonButton({ href }: AmazonButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 bg-[#FF9900] text-white font-semibold px-4 py-2 rounded-lg hover:bg-[#e68a00] transition"
    >
      <Image
        src="/icons/amazon-color-svgrepo-com.svg"
        alt="Amazon"
        width={20}
        height={20}
      />
      Acheter sur Amazon
    </a>
  );
}
