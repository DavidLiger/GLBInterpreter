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

export const metadata: Metadata = {
  title: 'Éditions Liger - Livres Augmentés',
  description: 'Découvrez nos livres augmentés : plongez dans des scènes 3D immersives accessibles via QR code. Explorez les décors, rencontrez les personnages et vivez une nouvelle dimension de lecture.',
  keywords: ['livres augmentés', 'lecture interactive', 'scènes 3D', 'QR code', 'livres numériques', 'édition'],
  authors: [{ name: 'Éditions Liger' }],
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
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
