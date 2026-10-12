import type { Metadata, Viewport } from "next";
import "./globals.css";

// Métadonnées minimales. Le build du livre (scripts/build-book.ts) remplace manifest.webmanifest et les icônes par
// ceux du livre (Î9 : icon.png, icon-192/512, icon-maskable-192/512, apple-touch-icon.png) et ajoute og:title /
// og:image et apple-mobile-web-app-title dans index.html. En `npm run dev`, seul public/icon.png existe.
// Chemins relatifs (D-8.4) : le dossier exporté doit fonctionner sous `/` comme sous `/<dépôt>/`.
// Balises Apple écrites telles quelles (`other`) : `appleWebApp.capable` de Next ne produit que `mobile-web-app-capable`.
// Fichiers et balises seulement : le parcours iOS est en Î16 (D-8.8).
export const metadata: Metadata = {
  title: 'GLBInterpreter',
  description: 'Lecteur 3D pour livres augmentés.',
  manifest: './manifest.webmanifest',
  icons: { icon: './icon.png', apple: './apple-touch-icon.png' },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black',
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
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
        {children}
      </body>
    </html>
  );
}
