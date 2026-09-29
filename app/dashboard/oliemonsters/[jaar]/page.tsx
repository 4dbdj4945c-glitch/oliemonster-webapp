// De oliemonsters van één analysejaar: /dashboard/oliemonsters/2026.
//
// Eén pagina voor elk jaar, ook een jaar zonder monsters. De oude adressen
// /dashboard/oliemonsters (2025) en /dashboard/oliemonsters2026 sturen hierheen
// (next.config.ts). Wie welk jaar mag zien, regelt app/dashboard/layout.tsx met
// lib/paginaToegang.ts; de monsterroute dwingt het kijkjaar ook zelf af.

import { notFound } from 'next/navigation';
import OliemonstersPagina from '@/app/components/oliemonsters/OliemonstersPagina';
import { geldigJaar } from '@/lib/modules';

export default async function OliemonstersJaarPagina({ params }: { params: Promise<{ jaar: string }> }) {
  const { jaar } = await params;
  const n = /^\d{4}$/.test(jaar) ? Number(jaar) : NaN;
  if (!geldigJaar(n)) notFound();
  // key: bij het wisselen van jaar begint de pagina schoon (filters, zoeken).
  return <OliemonstersPagina key={n} jaar={n} />;
}
