// Eén plek waar staat welke status een oliemonster heeft. Er zijn er vier:
//
//   genomen         het monster is afgenomen
//   niet-genomen    staat nog open, moet nog gebeuren
//   niet-bereikbaar de locatie was niet te bereiken (afzetting, andere werkzaamheden,
//                   begroeiing, anders). Blijft openstaan en telt mee in de planning.
//   geannuleerd     hoeft niet meer, valt buiten de planning
//
// De volgorde van de controles is bewust zo: geannuleerd gaat voor alles, daarna
// genomen (want een genomen monster is niet meer onbereikbaar; de routes zetten
// isUnreachable dan ook weer uit), daarna niet bereikbaar.
//
// Gebruikt door de monsterlijsten, de tellingen en de PDF, zodat die drie
// hetzelfde zeggen.

import type { IconNaam } from '@/app/components/ui';

export type SampleStatus = 'genomen' | 'niet-genomen' | 'niet-bereikbaar' | 'geannuleerd';

export interface StatusBron {
  isTaken: boolean;
  isDisabled?: boolean | null;
  isUnreachable?: boolean | null;
}

export function sampleStatus(sample: StatusBron): SampleStatus {
  if (sample.isDisabled) return 'geannuleerd';
  if (sample.isTaken) return 'genomen';
  if (sample.isUnreachable) return 'niet-bereikbaar';
  return 'niet-genomen';
}

export const STATUS_LABELS: Record<SampleStatus, string> = {
  genomen: 'Genomen',
  'niet-genomen': 'Niet genomen',
  'niet-bereikbaar': 'Niet bereikbaar',
  geannuleerd: 'Geannuleerd',
};

/** Badgeklasse uit globals.css per status (zie STIJL.md, Badges). */
export const STATUS_BADGE: Record<SampleStatus, string> = {
  genomen: 'badge-success',
  'niet-genomen': 'badge-danger',
  'niet-bereikbaar': 'badge-warning',
  geannuleerd: 'badge-gray',
};

/**
 * Icoon per status uit de vaste set (zie STIJL.md, Iconen). Niet bereikbaar
 * gebruikt `alert-warning`: een eigen `status-unreachable` moet eerst in
 * iconen-voorstel/ getekend worden voordat die hier mag staan.
 */
export const STATUS_ICOON: Record<SampleStatus, IconNaam> = {
  genomen: 'status-taken',
  'niet-genomen': 'status-not-taken',
  'niet-bereikbaar': 'alert-warning',
  geannuleerd: 'status-cancelled',
};

/** Telt per status hoeveel monsters er zijn. */
export function telStatussen<T extends StatusBron>(samples: T[]): Record<SampleStatus, number> {
  const totalen: Record<SampleStatus, number> = {
    genomen: 0,
    'niet-genomen': 0,
    'niet-bereikbaar': 0,
    geannuleerd: 0,
  };
  for (const s of samples) totalen[sampleStatus(s)] += 1;
  return totalen;
}

/**
 * Staat dit monster nog open in de planning? Een onbereikbaar monster hoort daar
 * bij: het moet waarschijnlijk alsnog gebeuren. Een geannuleerd monster niet.
 */
export function staatNogOpen(sample: StatusBron): boolean {
  const status = sampleStatus(sample);
  return status === 'niet-genomen' || status === 'niet-bereikbaar';
}
