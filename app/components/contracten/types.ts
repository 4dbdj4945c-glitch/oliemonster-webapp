// Contracten en taken zoals /api/contracten ze teruggeeft (lib/contractenServer.ts).

import type { TaakStatus } from '@/lib/contracten';

export interface Taak {
  id: number;
  contractId: number;
  contract: { id: number; naam: string };
  klant: { id: number; naam: string };
  soort: string;
  soortLabel: string;
  titel: string;
  omschrijving: string | null;
  object: { id: number; name: string; address: string | null };
  installatie: { id: number; naam: string; code: string } | null;
  intervalMaanden: number;
  volgendeOp: string;
  geschatteMinuten: number | null;
  minuten: number;
  laatstUitgevoerdOp: string | null;
  notities: string | null;
  gepland: { dag: string; planId: number } | null;
  status: TaakStatus;
  uitvoeringen: { id: number; datum: string; bron: string; door: string | null }[];
}

export interface Contract {
  id: number;
  klantId: number;
  naam: string;
  startOp: string | null;
  eindOp: string | null;
  notities: string | null;
  klant: { id: number; naam: string };
  taken: Taak[];
}

/** Waar een uitvoering vandaan kwam, in woorden. */
export function bronTekst(bron: string): string {
  if (bron.startsWith('inspectie-')) return 'uit een afgeronde inspectie';
  if (bron.startsWith('stop-')) return 'afgevinkt op de planning';
  return 'met de hand';
}

/** "1 apr 2026 tot 31 mrt 2028", "vanaf 1 apr 2026", of leeg. */
export function looptijdTekst(c: Pick<Contract, 'startOp' | 'eindOp'>, kort: (d: string) => string): string {
  if (c.startOp && c.eindOp) return `${kort(c.startOp)} tot ${kort(c.eindOp)}`;
  if (c.startOp) return `vanaf ${kort(c.startOp)}, doorlopend`;
  if (c.eindOp) return `tot ${kort(c.eindOp)}`;
  return 'doorlopend';
}
