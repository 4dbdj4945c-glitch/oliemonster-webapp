// Documentnummers per jaar: INS-2026-001 (inspectie) en WB-2026-001 (werkbon).
// Het jaar is het jaar van de datum bij het aanmaken, het volgnummer begint elk
// jaar bij 1 en loopt door voorbij 999 (INS-2026-1000). Beide liggen vast in de
// database (nummerJaar, volgnummer); een rij zonder nummer (aangemaakt door een
// oudere versie) houdt het oude nummer INS-12.
//
// Geen server-imports: dit bestand draait ook in de browser. Een nieuw nummer
// uitdelen gebeurt op de server: lib/nummeringServer.ts.

export interface Genummerd {
  id: number;
  nummerJaar: number | null;
  volgnummer: number | null;
}

/** Het nummer voor op het scherm en in de PDF: INS-2026-001, of INS-12 zonder vast nummer. */
export function documentNummer(voorvoegsel: 'INS' | 'WB', r: Genummerd): string {
  if (r.nummerJaar && r.volgnummer) return `${voorvoegsel}-${r.nummerJaar}-${String(r.volgnummer).padStart(3, '0')}`;
  return `${voorvoegsel}-${r.id}`;
}
