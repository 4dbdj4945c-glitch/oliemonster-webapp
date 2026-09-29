// Redenen waarom een locatie niet te bereiken was. Een vaste lijst, net als bij
// het annuleren (lib/cancelReasons.ts), zodat de reden later te tellen is en niet
// als losse zin in het opmerkingenveld verdwijnt.
//
// Niet bereikbaar is iets anders dan geannuleerd: het monster blijft openstaan en
// blijft meetellen in de planning, want het moet waarschijnlijk alsnog gebeuren.

export interface OnbereikbaarReden {
  waarde: string;
  label: string;
  /** Toelichting verplicht bij deze reden */
  toelichtingNodig?: boolean;
}

export const ONBEREIKBAAR_REDENEN: OnbereikbaarReden[] = [
  { waarde: 'afzetting', label: 'Afzetting' },
  { waarde: 'werkzaamheden', label: 'Andere werkzaamheden' },
  { waarde: 'begroeiing', label: 'Begroeiing' },
  { waarde: 'anders', label: 'Anders', toelichtingNodig: true },
];

/**
 * Maakt van de keuze plus de toelichting één regel tekst, zoals die in de lijst
 * en in de PDF komt te staan. Geeft een foutmelding terug als de keuze niet klopt
 * of de toelichting bij "Anders" ontbreekt.
 */
export function bouwOnbereikbaarReden(
  waarde: unknown,
  toelichting: unknown
): { tekst: string } | { fout: string } {
  const reden = ONBEREIKBAAR_REDENEN.find((r) => r.waarde === waarde);
  if (!reden) return { fout: 'Kies een reden waarom de locatie niet te bereiken was' };

  const extra = typeof toelichting === 'string' ? toelichting.trim() : '';
  if (reden.toelichtingNodig && !extra) {
    return { fout: 'Vul een toelichting in bij de reden "Anders"' };
  }
  if (reden.waarde === 'anders') return { tekst: extra };
  return { tekst: extra ? `${reden.label}, ${extra}` : reden.label };
}

/** Het label van een reden, om de opgeslagen tekst terug te vinden in de lijst. */
export function onbereikbaarRedenLabel(waarde?: string | null): string {
  if (!waarde) return '';
  return ONBEREIKBAAR_REDENEN.find((r) => r.waarde === waarde)?.label ?? waarde;
}
