// Welke dashboardpagina mag deze gebruiker openen? Eén regel voor de server
// (app/dashboard/layout.tsx, bij het laden van een pagina) en de browser
// (GebruikerProvider, bij het wisselen van pagina binnen de portal).
//
// - niet ingelogd: naar /login
// - moet eerst een wachtwoord instellen: naar /set-password
// - rol alleen lezen: alleen de oliemonsterpagina van zijn kijkjaar. Mag hij
//   alle jaren zien, dan het dashboard en beide jaarpagina's. Heeft zijn jaar
//   nog geen pagina, dan het dashboard (dat zegt wat er aan de hand is).
// - Instellingen en Audit logs: alleen admin, de rest naar /dashboard
//
// Geen server-imports hier: dit bestand draait ook in de browser.

import { isAlleenLezen, kijkersPagina, paginaVoorKijkjaar, ROLE_ADMIN } from './roles';

export interface PaginaGebruiker {
  role: string;
  viewYear: number | null;
  requiresPasswordChange: boolean;
}

const JAARPAGINAS = ['/dashboard/oliemonsters', '/dashboard/oliemonsters2026'];
const ALLEEN_ADMIN = ['/dashboard/admin', '/dashboard/audit-logs'];

function valtOnder(pad: string, basis: string): boolean {
  return pad === basis || pad.startsWith(basis + '/');
}

/** null als de pagina open mag, anders het pad waar de gebruiker heen moet. */
export function paginaBesluit(gebruiker: PaginaGebruiker | null, pad: string): string | null {
  if (!gebruiker) return '/login';
  if (gebruiker.requiresPasswordChange) return '/set-password';

  const schoon = pad.replace(/\/+$/, '') || '/';

  if (isAlleenLezen(gebruiker.role)) {
    const eigen = gebruiker.viewYear === null ? null : paginaVoorKijkjaar(gebruiker.viewYear);
    let toegestaan: string[];
    if (gebruiker.viewYear === null) toegestaan = ['/dashboard', ...JAARPAGINAS];
    else if (eigen) toegestaan = [eigen];
    else toegestaan = ['/dashboard'];
    return toegestaan.includes(schoon) ? null : kijkersPagina(gebruiker.viewYear);
  }

  if (ALLEEN_ADMIN.some((basis) => valtOnder(schoon, basis)) && gebruiker.role !== ROLE_ADMIN) {
    return '/dashboard';
  }
  return null;
}
