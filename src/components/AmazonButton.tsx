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
      {/* Logo Amazon en SVG */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 256 256"
        className="w-5 h-5"
        fill="currentColor"
      >
        <path d="M212.9 184.1c-18.6 13.7-46.4 29.8-75.3 29.8-45.1 0-86.6-25-107.7-61.8a4.6 4.6 0 0 1 7.9-4.9c18.7 29.6 54.6 53.7 99.8 53.7 24.8 0 51.1-11.4 71.2-26.7a4.6 4.6 0 1 1 5.6 7.4ZM218 199.3a4.6 4.6 0 0 1-2.2 8.6c-17.9 5.3-49.9 13.7-82.3 13.7-36.2 0-68.7-7.2-96.6-21.5a4.6 4.6 0 0 1 4.1-8.3c25.8 12.8 56.4 19.6 92.4 19.6 30.9 0 61.8-7.7 78.9-12.8a4.6 4.6 0 0 1 5.7 3.2ZM159.7 120c0-17.6-9.9-32.4-28.6-32.4-10.8 0-21 6.5-25.5 15.9h-.3V89.6c0-1.7-1.3-3.1-3-3.1h-20c-1.7 0-3.1 1.4-3.1 3.1V181c0 1.7 1.4 3.1 3.1 3.1h20c1.7 0 3-1.4 3-3.1v-42.5c0-11.5 5.5-22.6 18-22.6 11.2 0 15.6 8 15.6 19.4v45.7c0 1.7 1.4 3.1 3.1 3.1h20.1c1.7 0 3.1-1.4 3.1-3.1Z" />
      </svg>
      Acheter sur Amazon
    </a>
  );
}
