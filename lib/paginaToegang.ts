// Welke dashboardpagina mag deze gebruiker openen? Eén regel voor de server
// (app/dashboard/layout.tsx, bij het laden van een pagina) en de browser
// (GebruikerProvider, bij het wisselen van pagina binnen de portal). Welke
// module bij een pad hoort en wie erbij mag, staat in het moduleregister
// (lib/modules.ts).
//
// - niet ingelogd: naar /login
// - moet eerst een wachtwoord instellen: naar /set-password
// - rol alleen lezen, weergave klassiek: alleen de oliemonsterpagina van zijn
//   kijkjaar (/dashboard/oliemonsters/2025). Mag hij alle jaren zien, dan het
//   dashboard en elke jaarpagina.
// - rol alleen lezen, weergave klantportaal: alleen /dashboard, het klantportaal.
//   Een oud adres (jaarpagina) stuurt daarheen.
// - elke andere pagina: alleen als de rol in het register bij die module staat,
//   anders naar /dashboard
//
// Geen server-imports hier: dit bestand draait ook in de browser.

import { isAlleenLezen, krijgtKlantportaal } from './roles';
import { jaarUitPad, magModule, moduleVoorPad, oliemonsterPad } from './modules';

export interface PaginaGebruiker {
  role: string;
  viewYear: number | null;
  requiresPasswordChange: boolean;
  klantId?: number | null;
  portaalWeergave?: string | null;
}

/** De oliemonsterpagina van een kijkjaar. Elk jaar heeft een pagina. */
export function paginaVoorKijkjaar(jaar: number): string {
  return oliemonsterPad(jaar);
}

/**
 * Waar hoort een kijker heen die hier niets te zoeken heeft? Naar de pagina van
 * zijn eigen kijkjaar. Mag hij alle jaren zien, dan naar het dashboard: dat toont
 * hem alleen de oliemonstermodule.
 */
export function kijkersPagina(viewYear?: number | null): string {
  if (viewYear === null || viewYear === undefined) return '/dashboard';
  return paginaVoorKijkjaar(viewYear);
}

/**
 * Waar deze gebruiker na het inloggen begint: /dashboard, of de pagina waar
 * /dashboard hem heen zou sturen (de jaarpagina van een klassieke kijker).
 */
export function startpagina(gebruiker: PaginaGebruiker): string {
  return paginaBesluit(gebruiker, '/dashboard') ?? '/dashboard';
}

/** null als de pagina open mag, anders het pad waar de gebruiker heen moet. */
export function paginaBesluit(gebruiker: PaginaGebruiker | null, pad: string): string | null {
  if (!gebruiker) return '/login';
  if (gebruiker.requiresPasswordChange) return '/set-password';

  const schoon = pad.replace(/\/+$/, '') || '/';

  if (krijgtKlantportaal(gebruiker)) {
    return schoon === '/dashboard' ? null : '/dashboard';
  }

  if (isAlleenLezen(gebruiker.role)) {
    const jaar = jaarUitPad(schoon);
    const mag =
      gebruiker.viewYear === null
        ? schoon === '/dashboard' || jaar !== null
        : jaar === gebruiker.viewYear;
    return mag ? null : kijkersPagina(gebruiker.viewYear);
  }

  const gevonden = moduleVoorPad(schoon);
  if (gevonden && !magModule(gevonden, gebruiker.role)) return '/dashboard';
  return null;
}
