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

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const gebruiker = await haalGebruiker(await haalSessie());
  if (!gebruiker) redirect('/login');
  if (gebruiker.requiresPasswordChange) redirect('/set-password');

  // Zonder pad (zou niet moeten) alleen de controle hierboven; de provider
  // controleert de pagina dan in de browser.
  const pad = (await headers()).get('x-ids-pad');
  const doel = pad ? paginaBesluit(gebruiker, pad) : null;
  if (doel) redirect(doel);

  return (
    <GebruikerProvider gebruiker={{ ...gebruiker, isLoggedIn: true }}>
      {children}
    </GebruikerProvider>
  );
}
