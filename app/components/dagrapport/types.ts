// Werkbonnen (in de code nog Dagrapport) zoals /api/dagrapporten ze teruggeeft
// (lib/dagrapporten.ts). Keuzes en rekenregels: lib/werkbon.ts.

import { duurTekst, type Materiaal, type Tijdsoort, type WerkbonStatus } from '@/lib/werkbon';

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
  tijdsoort: Tijdsoort;
  beginTijd: string | null;
  eindTijd: string | null;
  pauzeMinuten: number | null;
  reisMinuten: number | null;
  kilometers: number | null;
  soortWerk: string | null;
  referentie: string | null;
  contactpersoon: string | null;
  materialen: Materiaal[];
  vervolgNodig: boolean;
  vervolgActie: string | null;
  handtekeningVragen: boolean;
  afgerondOp: string | null;
  status: WerkbonStatus;
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
  tijdsoort: Tijdsoort;
  soortWerk: string | null;
  referentie: string | null;
  vervolgNodig: boolean;
  status: WerkbonStatus;
  getekendDoor: string | null;
  aantalFotos: number;
  pdf: string;
}

/** Minuten als uren voor in een veld: 150 wordt "2,5". */
export function urenVeld(minuten: number | null): string {
  if (minuten === null) return '';
  return (Math.round((minuten / 60) * 100) / 100).toLocaleString('nl-NL');
}

/** De tijd in een lijst: "2,5 uur", "n.v.t." of "geen uren". */
export function urenTekst(minuten: number | null, tijdsoort?: Tijdsoort): string {
  if (tijdsoort === 'nvt') return 'n.v.t.';
  if (minuten === null) return 'geen uren';
  return duurTekst(minuten);
}

/** Wie het werk doet, als voorstel. */
export const STANDAARD_UITVOERDER = 'Roel Mandigers';
