'use client';

// Geeft de ingelogde gebruiker door aan alle dashboardpagina's (useGebruiker),
// zodat ze niet elk zelf /api/auth/session hoeven op te halen. De gegevens komen
// uit app/dashboard/layout.tsx, die ze op de server uit de database haalt.
//
// Wisselt de gebruiker binnen de portal van pagina, dan rendert Next.js de
// layout niet opnieuw. Daarom kijkt deze provider bij elke paginawissel met
// dezelfde regel (lib/paginaToegang.ts) of de pagina mag, en stuurt anders door.

import { createContext, useContext, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { paginaBesluit } from '@/lib/paginaToegang';

export interface IngelogdeGebruiker {
  userId: number;
  username: string;
  role: string;
  viewYear: number | null;
  /** Alleen bij de rol alleen lezen: zijn klant. */
  klantId: number | null;
  portaalWeergave: string;
  requiresPasswordChange: boolean;
  isLoggedIn: true;
}

const GebruikerContext = createContext<IngelogdeGebruiker | null>(null);

export function useGebruiker(): IngelogdeGebruiker {
  const gebruiker = useContext(GebruikerContext);
  if (!gebruiker) throw new Error('useGebruiker werkt alleen binnen app/dashboard');
  return gebruiker;
}

export default function GebruikerProvider({
  gebruiker,
  children,
}: {
  gebruiker: IngelogdeGebruiker;
  children: React.ReactNode;
}) {
  const pad = usePathname();
  const router = useRouter();
  const doel = paginaBesluit(gebruiker, pad);

  useEffect(() => {
    if (doel) router.replace(doel);
  }, [doel, router]);

  // Geen flits van een pagina die deze gebruiker niet hoort te zien.
  if (doel) return null;

  return <GebruikerContext.Provider value={gebruiker}>{children}</GebruikerContext.Provider>;
}
