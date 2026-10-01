// De oliemonsters van één analysejaar: /dashboard/oliemonsters/2026.
//
// Eén pagina voor elk jaar, ook een jaar zonder monsters. De oude adressen
// /dashboard/oliemonsters (2025) en /dashboard/oliemonsters2026 sturen hierheen
// (next.config.ts). Wie welk jaar mag zien, regelt app/dashboard/layout.tsx met
// lib/paginaToegang.ts; de monsterroute dwingt het kijkjaar ook zelf af.
//
// De lijst, de kolommen, de objecten en de jaren komen meteen mee met de
// pagina (lib/oliemonsterBegin.ts), zodat het scherm niet eerst leeg laadt en
// daarna nog vier verzoeken doet. Lukt dat niet, dan haalt het scherm ze zelf op,
// zoals altijd.

import { notFound } from 'next/navigation';
import OliemonstersPagina from '@/app/components/oliemonsters/OliemonstersPagina';
import { geldigJaar, oliemonsterPad } from '@/lib/modules';
import { gebruikerVanVerzoek } from '@/lib/toegang';
import { paginaBesluit } from '@/lib/paginaToegang';
import { haalOliemonsterBegin, type OliemonsterBegin } from '@/lib/oliemonsterBegin';

export default async function OliemonstersJaarPagina({ params }: { params: Promise<{ jaar: string }> }) {
  const { jaar } = await params;
  const n = /^\d{4}$/.test(jaar) ? Number(jaar) : NaN;
  if (!geldigJaar(n)) notFound();

  // Alleen als deze gebruiker deze pagina echt mag zien (de layout stuurt
  // anders door); dezelfde regel als de layout.
  const gebruiker = await gebruikerVanVerzoek();
  let begin: OliemonsterBegin | null = null;
  if (gebruiker && !gebruiker.requiresPasswordChange && paginaBesluit(gebruiker, oliemonsterPad(n)) === null) {
    try {
      begin = await haalOliemonsterBegin(gebruiker, n);
    } catch (error) {
      console.error('Begingegevens oliemonsters mislukt, het scherm haalt ze zelf op:', error);
    }
  }

  // key: bij het wisselen van jaar begint de pagina schoon (filters, zoeken).
  return <OliemonstersPagina key={n} jaar={n} begin={begin} />;
}
