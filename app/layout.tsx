import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import FetchPatcher from "./components/FetchPatcher";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "IDS Portal — It's Done Services",
  description: "Werkportaal voor It's Done Services — onderhoud, registratie en beheer.",
  applicationName: "IDS Portal",
  authors: [{ name: "It's Done Services" }],
  keywords: ['it\'s done services', 'portal', 'onderhoud', 'registratie', 'beheer'],
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'IDS Portal',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>){
  return (
    <html lang="nl">
      <body
        className={`${inter.variable} antialiased`}
      >
        <FetchPatcher />
        {children}
      </body>
    </html>
  );
}
