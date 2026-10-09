import Link from "next/link";

// Page d'accueil minimale du repo (Î4). La vitrine vit dans faerium-site ; la route d'entrée
// définitive (/s/<scène>) est posée en Î5.
export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-black text-white p-6 text-center">
      <h1 className="text-2xl font-bold">GLBInterpreter</h1>
      <p className="text-white/70">Lecteur 3D pour livres augmentés.</p>
      <Link
        href="/webdiorama/1/street"
        className="px-6 py-3 rounded-full bg-white/15 hover:bg-white/25 transition"
      >
        Ouvrir la scène de test
      </Link>
    </main>
  );
}
