import content from "../content/content.json";

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-white text-center py-8 mt-auto">
        <p className="mb-4">© 2025 Mon Univers Fantasy — Tous droits réservés</p>
        <div className="flex justify-center gap-6 text-lg">
          <a href="https://instagram.com/moncompte" target="_blank" rel="noopener noreferrer" className="hover:underline">
            Instagram
          </a>
          <a href="https://facebook.com/moncompte" target="_blank" rel="noopener noreferrer" className="hover:underline">
            Facebook
          </a>
          <a href="https://tiktok.com/@moncompte" target="_blank" rel="noopener noreferrer" className="hover:underline">
            TikTok
          </a>
          <a href="https://pinterest.com/moncompte" target="_blank" rel="noopener noreferrer" className="hover:underline">
            Pinterest
          </a>
        </div>
    </footer>
  );
}
