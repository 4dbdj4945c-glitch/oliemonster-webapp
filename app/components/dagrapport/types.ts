// Dagrapporten zoals /api/dagrapporten ze teruggeeft (lib/dagrapporten.ts).

export interface Dagrapport {
  id: number;
  nummer: string;
  klant: { id: number; naam: string };
  planId: number | null;
  planDag: string | null;
  object: { id: number; name: string; address: string | null } | null;
  datum: string;
  uitvoerder: string;
  werkzaamheden: string | null;
  bevindingen: string | null;
  minuten: number | null;
  status: 'concept' | 'getekend';
  handtekening: string | null;
  getekendDoor: string | null;
  getekendOp: string | null;
  fotos: { id: number; url: string; bijschrift: string | null }[];
  pdf: string;
}

export interface DagrapportInLijst {
  id: number;
  nummer: string;
  klant: { id: number; naam: string };
  object: { id: number; name: string } | null;
  planId: number | null;
  datum: string;
  uitvoerder: string;
  minuten: number | null;
  status: 'concept' | 'getekend';
  getekendDoor: string | null;
  aantalFotos: number;
  pdf: string;
}

/** Minuten als uren voor in een veld: 150 wordt "2,5". */
export function urenVeld(minuten: number | null): string {
  if (minuten === null) return '';
  return (Math.round((minuten / 60) * 100) / 100).toLocaleString('nl-NL');
}

/** 150 als "2,5 uur" */
export function urenTekst(minuten: number | null): string {
  if (minuten === null) return 'geen uren';
  return `${urenVeld(minuten)} uur`;
}

/** Wie het werk doet, als voorstel. */
export const STANDAARD_UITVOERDER = 'Roel Mandigers';
