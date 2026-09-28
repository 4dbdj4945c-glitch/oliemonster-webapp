// Redenen om een monster te annuleren. Een vaste lijst, zodat de reden later te
// tellen is en niet als losse zin in het opmerkingenveld verdwijnt (daar werd hij
// overschreven zodra er een hermonstering bijkwam).

export interface AnnuleerReden {
  waarde: string;
  label: string;
  /** Toelichting verplicht bij deze reden */
  toelichtingNodig?: boolean;
}

export const ANNULEER_REDENEN: AnnuleerReden[] = [
  { waarde: 'geen-aftappunt', label: 'Geen aftappunt' },
  { waarde: 'buiten-bedrijf', label: 'Installatie buiten bedrijf' },
  { waarde: 'geen-toegang', label: 'Geen toegang' },
  { waarde: 'vervallen-overleg', label: 'Vervallen in overleg' },
  { waarde: 'anders', label: 'Anders', toelichtingNodig: true },
];

/**
 * Maakt van de keuze plus de toelichting één regel tekst, zoals die in de lijst
 * en in de PDF komt te staan. Geeft een foutmelding terug als de keuze niet
 * klopt of de toelichting ontbreekt.
 */
export function bouwAnnuleerReden(
  waarde: unknown,
  toelichting: unknown
): { tekst: string } | { fout: string } {
  const reden = ANNULEER_REDENEN.find((r) => r.waarde === waarde);
  if (!reden) return { fout: 'Kies een reden voor de annulering' };

  const extra = typeof toelichting === 'string' ? toelichting.trim() : '';
  if (reden.toelichtingNodig && !extra) {
    return { fout: 'Vul een toelichting in bij de reden "Anders"' };
  }
  if (reden.waarde === 'anders') return { tekst: extra };
  return { tekst: extra ? `${reden.label}, ${extra}` : reden.label };
}
