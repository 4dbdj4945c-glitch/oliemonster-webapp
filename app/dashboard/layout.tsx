// Poort voor alle dashboardpagina's, op de server: sessie ophalen, de gebruiker
// uit de database lezen en doorsturen als de pagina niet voor hem is (zie
// lib/paginaToegang.ts). De pagina's zelf controleren dat niet meer; ze lezen
// de gebruiker met useGebruiker().
//
// Het pad komt uit de header x-ids-pad, die proxy.ts bij elk verzoek zet; een
// layout krijgt het pad niet zelf mee.

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { haalGebruiker, haalSessie } from '@/lib/toegang';
import { paginaBesluit } from '@/lib/paginaToegang';
import GebruikerProvider from '../components/GebruikerProvider';
import Doorsturen from '../components/Doorsturen';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const kop = await headers();
  // Een client-navigatie (router.push, Link) haalt de pagina op met fetch. Een
  // redirect() op de server liet het scherm dan leeg (de kijker na het
  // inloggen, en een oneindige reeks verzoeken); daarom dan doorsturen met een
  // volledige paginalading. Next geeft de RSC-header niet door, dus kijken we
  // naar Sec-Fetch-Dest: "document" is een gewone paginalading, dan blijft het
  // een echte doorverwijzing van de server. Ontbreekt de header (geen browser),
  // dan ook.
  const bestemming = kop.get('sec-fetch-dest');
  const clientNavigatie = bestemming !== null && bestemming !== 'document' && bestemming !== 'iframe';
  const stuurDoor = (naar: string) => {
    if (clientNavigatie) return <Doorsturen naar={naar} />;
    redirect(naar);
  };

  const gebruiker = await haalGebruiker(await haalSessie());
  if (!gebruiker) return stuurDoor('/login');
  if (gebruiker.requiresPasswordChange) return stuurDoor('/set-password');

  // Zonder pad (zou niet moeten) alleen de controle hierboven; de provider
  // controleert de pagina dan in de browser.
  const pad = kop.get('x-ids-pad');
  const doel = pad ? paginaBesluit(gebruiker, pad) : null;
  if (doel) return stuurDoor(doel);

  return (
    <GebruikerProvider gebruiker={{ ...gebruiker, isLoggedIn: true }}>
      {children}
    </GebruikerProvider>
  );
}
