// De status van een monster zoals de KLANT hem ziet (klantportaal en rapport).
//
// Intern (lib/sampleStatus.ts) is een monster dat nog moet gebeuren "Niet
// genomen", in rood. Voor de klant is dat geen fout maar werk dat op de
// planning staat. Daarom neutraal:
//
//   genomen          groen   het monster is afgenomen
//   gepland          blauw   staat op een komende monsterdag
//   in-te-plannen    grijs   moet nog, maar staat nog niet op een dag
//   niet-bereikbaar  amber   de plek was niet te bereiken, met de reden
//   geannuleerd      grijs   hoeft niet meer, telt niet mee
//
// Geen rood: dat is in de portal voor fouten en te laat.
//
// Geen server-imports: dit bestand draait ook in de browser.

import type { IconNaam } from '@/app/components/ui';

export type KlantStatus = 'genomen' | 'gepland' | 'in-te-plannen' | 'niet-bereikbaar' | 'geannuleerd';

/** Volgorde in de legenda, de balk en de tellingen. */
export const KLANT_STATUSSEN: KlantStatus[] = ['genomen', 'gepland', 'niet-bereikbaar', 'geannuleerd', 'in-te-plannen'];

export const KLANT_STATUS_LABELS: Record<KlantStatus, string> = {
  genomen: 'Genomen',
  gepland: 'Gepland',
  'in-te-plannen': 'Nog in te plannen',
  'niet-bereikbaar': 'Niet bereikbaar',
  geannuleerd: 'Geannuleerd',
};

/** Zin in de legenda: "12 gepland", "3 niet bereikbaar, met reden". */
export const KLANT_STATUS_LEGENDA: Record<KlantStatus, string> = {
  genomen: 'genomen',
  gepland: 'gepland',
  'in-te-plannen': 'nog in te plannen',
  'niet-bereikbaar': 'niet bereikbaar, met reden',
  geannuleerd: 'geannuleerd',
};

/** Badgeklasse uit globals.css. */
export const KLANT_STATUS_BADGE: Record<KlantStatus, string> = {
  genomen: 'badge-success',
  gepland: 'badge-info',
  'in-te-plannen': 'badge-gray',
  'niet-bereikbaar': 'badge-warning',
  geannuleerd: 'badge-gray',
};

export const KLANT_STATUS_ICOON: Record<KlantStatus, IconNaam> = {
  genomen: 'status-taken',
  gepland: 'status-planned',
  'in-te-plannen': 'calendar',
  'niet-bereikbaar': 'alert-warning',
  geannuleerd: 'status-cancelled',
};

/** Kleur in de voortgangsbalk en de PDF (RGB), dezelfde tokens als globals.css. */
export const KLANT_STATUS_KLEUR: Record<KlantStatus, [number, number, number]> = {
  genomen: [22, 163, 74], // --groen
  gepland: [29, 78, 216], // --blue
  'niet-bereikbaar': [217, 119, 6], // amber, als in het ontwerp
  geannuleerd: [148, 163, 184], // --grijs-400
  'in-te-plannen': [226, 232, 240], // --grijs-200
};

export type KlantTelling = Record<KlantStatus, number>;

export function legeTelling(): KlantTelling {
  return { genomen: 0, gepland: 0, 'in-te-plannen': 0, 'niet-bereikbaar': 0, geannuleerd: 0 };
}

/** Het aantal dat meetelt voor "x van y genomen": alles behalve geannuleerd. */
export function teNemen(t: KlantTelling): number {
  return t.genomen + t.gepland + t['in-te-plannen'] + t['niet-bereikbaar'];
}
