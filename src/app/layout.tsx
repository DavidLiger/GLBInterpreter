import type { Metadata } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/book/ServiceWorkerRegister";

// Métadonnées minimales. Le build du livre (scripts/build-book.ts, Î6) remplace manifest.webmanifest par celui du
// livre et ajoute og:title / og:image dans index.html ; icônes et plein écran complets en Î9.
// Chemins relatifs (D-8.4) : le dossier exporté doit fonctionner sous `/` comme sous `/<dépôt>/`.
export const metadata: Metadata = {
  title: 'GLBInterpreter',
  description: 'Lecteur 3D pour livres augmentés.',
  manifest: './manifest.webmanifest',
  icons: { icon: './icon.png' },
};

// Police déclarée ici et non dans le CSS compilé : une URL de `public/` dans le CSS serait résolue depuis
// `_next/static/css/`, et `next/font` refuse un `assetPrefix` relatif (spike Î5).
const fontFaces = `@font-face{font-family:HandyGeorge;src:url(fonts/HandyGeorge.ttf) format("truetype");font-display:swap}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <style dangerouslySetInnerHTML={{ __html: fontFaces }} />
      </head>
      <body className="antialiased">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
