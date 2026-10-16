import type { Metadata, Viewport } from "next";
import "./globals.css";

// Métadonnées minimales. Le build du livre (scripts/build-book.ts) remplace manifest.webmanifest et les icônes par
// ceux du livre (Î9 : icon.png, icon-192/512, icon-maskable-192/512, apple-touch-icon.png) et ajoute og:title /
// og:image et apple-mobile-web-app-title dans index.html. En `npm run dev`, seul public/icon.png existe.
// Chemins relatifs (D-8.4) : le dossier exporté doit fonctionner sous `/` comme sous `/<dépôt>/`.
// Balises Apple écrites telles quelles (`other`) : `appleWebApp.capable` de Next ne produit que `mobile-web-app-capable`.
// Fichiers et balises seulement : le parcours iOS est en Î16 (D-8.8).
// Î12 : ni `title` ni `description` ici. Le titre est celui du livre : `<title>` posé au build dans `index.html` et
// `404.html` (première langue du livre, scripts/build-book.ts), puis tenu à jour dans la langue choisie (BookApp). Un
// titre de métadonnées Next serait aussi écrit dans les données de rendu et rétabli à l'hydratation.
export const metadata: Metadata = {
  manifest: './manifest.webmanifest',
  icons: { icon: './icon.png', apple: './apple-touch-icon.png' },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black',
  },
};

// Î12 : `viewport-fit=cover` pour occuper tout l'écran sous l'encoche ; l'interface se place dans les zones sûres
// (`env(safe-area-inset-*)`, globals.css).
export const viewport: Viewport = {
  themeColor: '#000000',
  viewportFit: 'cover',
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
    // `lang` et `<title>` : réécrits au build d'après la première langue et le titre du livre (scripts/build-book.ts),
    // puis tenus à jour à l'exécution dans la langue choisie (TranslationContext, BookApp) : l'attribut diffère alors du
    // rendu statique, d'où `suppressHydrationWarning`.
    <html lang="fr" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: fontFaces }} />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
