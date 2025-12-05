import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ✅ Fonction pour générer les metadata dynamiquement
export function generateMetadata(): Metadata {
  const isFolio = process.env.NEXT_PUBLIC_SITE_TYPE === 'folio';

  if (isFolio) {
    // 🎨 Metadata pour le portfolio
    return {
      title: 'David Liger - Développeur Full Stack | WebGL & Next.js',
      description: 'Développeur full-stack spécialisé en applications WebGL/Three.js, Next.js et systèmes ERP Dolibarr. Expert en visualisation 3D interactive et développement web moderne.',
      keywords: ['développeur full stack', 'WebGL', 'Three.js', 'Next.js', 'TypeScript', 'React', 'Dolibarr', 'PHP', 'portfolio développeur'],
      authors: [{ name: 'David Liger' }],
      robots: {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
        },
      },
      openGraph: {
        title: 'David Liger - Développeur Full Stack',
        description: 'Expert en WebGL, Three.js, Next.js et développement d\'applications web interactives.',
        url: 'https://david-liger-folio.vercel.app',
        siteName: 'David Liger Portfolio',
        images: [
          {
            url: 'https://david-liger-folio.vercel.app/images/portfolio-og.jpg',
            width: 1200,
            height: 630,
            alt: 'David Liger - Portfolio Développeur',
          },
        ],
        locale: 'fr_FR',
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: 'David Liger - Développeur Full Stack',
        description: 'Expert en WebGL, Three.js, Next.js et applications web interactives.',
        images: ['https://david-liger-folio.vercel.app/images/portfolio-og.jpg'],
      },
    };
  }

  // 📚 Metadata pour Éditions Liger (par défaut)
  return {
    title: 'Éditions Liger - Livres Augmentés',
    description: 'Découvrez nos livres augmentés : plongez dans des scènes 3D immersives accessibles via QR code. Explorez les décors, rencontrez les personnages et vivez une nouvelle dimension de lecture.',
    keywords: ['livres augmentés', 'lecture interactive', 'scènes 3D', 'QR code', 'livres numériques', 'édition'],
    authors: [{ name: 'Éditions Liger' }],
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
      },
    },
    openGraph: {
      title: 'Éditions Liger - Livres Augmentés',
      description: 'Plongez dans des univers 3D immersifs : explorez les décors, rencontrez les personnages animés et vivez votre lecture comme jamais.',
      url: 'https://editions-liger.com',
      siteName: 'Éditions Liger',
      images: [
        {
          url: 'https://editions-liger.com/images/og-image.jpg',
          width: 1200,
          height: 630,
          alt: 'Éditions Liger - Livres Augmentés',
        },
      ],
      locale: 'fr_FR',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Éditions Liger - Livres Augmentés',
      description: 'Plongez dans des univers 3D immersifs accessibles via QR code.',
      images: ['https://editions-liger.com/images/og-image.jpg'],
    },
    verification: {
      google: '8Sk2F3GTjwe8UF0wSPb0xFGGUmZm1-y3b0MW2cPfeZ8',
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}