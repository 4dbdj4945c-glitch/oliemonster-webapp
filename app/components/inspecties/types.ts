// Types van de schermen Inspecties, zoals de API ze geeft
// (lib/inspecties/server.ts: inspectieAlsJson en inspectieInLijst).

import type { ChecklistAntwoord, Instellingen, InspectieStatus, SjabloonSleutel } from '@/lib/inspecties/sjablonen';

export interface InspectieInLijst {
  id: number;
  nummer: string;
  sjabloon: SjabloonSleutel;
  status: InspectieStatus;
  datum: string;
  uitvoerder: string;
  klant: { id: number; naam: string };
  object: { id: number; name: string };
  installatie: { id: number; naam: string } | null;
  aantal: number;
  uitkomst: string;
  volgende: string | null;
  waarschuwingen: number;
}

export interface InstallatieKort {
  id: number;
  code: string;
  naam: string;
  soort: string;
  merk: string | null;
  typenummer: string | null;
  bouwjaar: number | null;
}

export interface Bevinding {
  id: number;
  volgorde: number;
  installatieId: number | null;
  installatie: InstallatieKort | null;
  titel: string;
  locatie: string | null;
  oordeel: string | null;
  notitie: string | null;
  waarden: { [sleutel: string]: number | null | Record<string, ChecklistAntwoord> | undefined; checklist?: Record<string, ChecklistAntwoord> } | null;
  /** Via /api/fotos/inspectie/..., of null */
  fotoUrl: string | null;
  gerepareerd: boolean;
  gerepareerdOp: string | null;
  volgendeOp: string | null;
  waarschuwing: string | null;
}

export interface LekTotalenJson {
  soort: 'persluchtlekken';
  instellingen: { drukBar: number; draaiuren: number; prijsmodel: 'kwh' | 'm3'; prijsKwh: number; prijsM3: number; kwhPerM3: number; kwhPerM3Berekend: boolean; co2PerKwh: number };
  aantal: number;
  gerepareerd: number;
  verliesLpm: number;
  m3PerJaar: number;
  kostenPerJaar: number;
  co2KgPerJaar: number;
  besparingKosten: number;
  besparingCo2Kg: number;
  openKosten: number;
  openCo2Kg: number;
}

export interface ArbeidsmiddelTotalenJson {
  soort: 'arbeidsmiddelen';
  aantal: number;
  'in-orde': number;
  'actie-nodig': number;
  'buiten-gebruik': number;
  zonderUitslag: number;
}

export interface Inspectie {
  id: number;
  nummer: string;
  sjabloon: SjabloonSleutel;
  klantId: number;
  objectId: number;
  installatieId: number | null;
  datum: string;
  uitvoerder: string;
  status: InspectieStatus;
  samenvatting: string | null;
  instellingen: Instellingen;
  volgendeOp: string | null;
  afgerondOp: string | null;
  afgerondDoor: string | null;
  klant: { id: number; naam: string; plaats: string | null };
  object: { id: number; name: string; address: string | null; objectType: string | null };
  installatie: InstallatieKort | null;
  items: Bevinding[];
  volgende: string | null;
  uitkomst: string;
  totalen: LekTotalenJson | ArbeidsmiddelTotalenJson;
}

/** Een dag (jjjj-mm-dd) leesbaar: "8 sep 2026". */
export function dagKort(dag: string | null | undefined): string {
  if (!dag) return '-';
  return new Date(`${dag}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Vandaag als jjjj-mm-dd in de eigen tijdzone. */
export function vandaagInvoer(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
