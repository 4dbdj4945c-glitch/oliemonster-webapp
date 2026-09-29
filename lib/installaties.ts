// Installaties: de machines op een object van een klant (pomp, hydraulisch
// aggregaat, compressor, pers). Deze lijst gebruiken de API (controle) en de
// schermen (keuzelijst, icoon), zodat het overal dezelfde soorten zijn.
//
// Geen server-imports hier: dit bestand draait ook in de browser.

import type { IconNaam } from '@/app/components/ui';

export interface InstallatieSoort {
  waarde: string;
  label: string;
  icoon: IconNaam;
}

export const INSTALLATIE_SOORTEN: InstallatieSoort[] = [
  { waarde: 'pomp', label: 'Pomp', icoon: 'pump' },
  { waarde: 'aggregaat', label: 'Hydraulisch aggregaat', icoon: 'hydraulic-cylinder' },
  { waarde: 'compressor', label: 'Compressor', icoon: 'pump' },
  { waarde: 'pers', label: 'Pers', icoon: 'hydraulic-cylinder' },
  { waarde: 'overig', label: 'Overig', icoon: 'valve' },
];

export const INSTALLATIE_SOORT_WAARDEN = INSTALLATIE_SOORTEN.map((s) => s.waarde) as [string, ...string[]];

export function installatieSoortLabel(waarde?: string | null): string {
  if (!waarde) return 'Onbekend';
  return INSTALLATIE_SOORTEN.find((s) => s.waarde === waarde)?.label ?? waarde;
}

export function installatieSoortIcoon(waarde?: string | null): IconNaam {
  return INSTALLATIE_SOORTEN.find((s) => s.waarde === waarde)?.icoon ?? 'valve';
}

/**
 * Tekens voor de korte code op een latere QR-sticker: zonder 0/O en 1/I/L,
 * zodat je hem ook met de hand foutloos overneemt.
 */
export const CODE_TEKENS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTE = 6;

/** Een nieuwe willekeurige code, bijvoorbeeld "K7M4QX". Uniek maken doet de API. */
export function nieuweInstallatieCode(willekeurig: (max: number) => number): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTE; i++) code += CODE_TEKENS[willekeurig(CODE_TEKENS.length)];
  return code;
}
