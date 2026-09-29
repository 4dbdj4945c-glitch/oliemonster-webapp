// Per monster horen twee foto's:
//
//   onderdeel  het onderdeel waar het monster vandaan komt (de tandwielkast,
//              de cilinder, het aftappunt)
//   potje      het monsterpotje zelf; dat is de foto die er altijd al was
//
// Bestaande foto's blijven dus de potjesfoto. De routes en de schermen gebruiken
// deze lijst, zodat het overal dezelfde twee soorten zijn met dezelfde namen.

import type { IconNaam } from '@/app/components/ui';

export type FotoSoort = 'onderdeel' | 'potje';

export interface FotoSoortInfo {
  soort: FotoSoort;
  /** Kolom op OilSample en SampleAttempt */
  veld: 'photoUrl' | 'partPhotoUrl';
  label: string;
  /** Tekst bij de uploadknop */
  knop: string;
  icoon: IconNaam;
}

export const FOTO_SOORTEN: FotoSoortInfo[] = [
  {
    soort: 'onderdeel',
    veld: 'partPhotoUrl',
    label: 'Foto onderdeel',
    knop: 'Foto van het onderdeel',
    icoon: 'sample-point',
  },
  {
    soort: 'potje',
    veld: 'photoUrl',
    label: 'Foto potje',
    knop: 'Foto van het monsterpotje',
    icoon: 'oil-sample',
  },
];

/** De potjesfoto is de standaard: alles wat vóór deze ronde geüpload is, is dat. */
export const STANDAARD_FOTO_SOORT: FotoSoort = 'potje';

/**
 * Leest de soort uit een request. Niets meegestuurd betekent de potjesfoto, zodat
 * oude aanroepen blijven werken. Onzin geeft null, dan hoort er een 400 te komen.
 */
export function leesFotoSoort(waarde: unknown): FotoSoort | null {
  if (waarde === undefined || waarde === null || waarde === '') return STANDAARD_FOTO_SOORT;
  const info = FOTO_SOORTEN.find((f) => f.soort === waarde);
  return info ? info.soort : null;
}

export function fotoVeld(soort: FotoSoort): 'photoUrl' | 'partPhotoUrl' {
  return soort === 'onderdeel' ? 'partPhotoUrl' : 'photoUrl';
}

export function fotoLabel(soort: FotoSoort): string {
  return FOTO_SOORTEN.find((f) => f.soort === soort)?.label ?? 'Foto';
}
