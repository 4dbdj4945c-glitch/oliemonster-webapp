// Contracten met terugkerende taken: de soorten, het interval en de status van
// een taak. Alleen rekenen, geen database: dit bestand draait ook in de browser
// (Vandaag, het klantdossier, de planning) en in de tests.
//
// Datums zijn kalenderdagen als tekst (jjjj-mm-dd). In de database staat een
// dag als 12:00 UTC, net als bij de inspecties (lib/inspecties/server.ts), zodat
// de dag in elke tijdzone dezelfde blijft.
//
// Besluit (fase 5): de volgende datum telt vanaf de dag van de uitvoering, niet
// vanaf de geplande datum. Doe je het halfjaarlijkse onderhoud twee weken te
// laat, dan schuift de volgende keer ook twee weken op; zo zit er altijd een
// vol interval tussen twee bezoeken, wat bij een keuring of inspectie de eis is.

import type { IconNaam } from '@/app/components/ui';
import type { SjabloonSleutel } from './inspecties/sjablonen';

export const TAAK_SOORTEN = ['oliemonsters', 'persluchtlekken', 'arbeidsmiddelen', 'onderhoud', 'anders'] as const;
export type TaakSoort = (typeof TAAK_SOORTEN)[number];

export interface TaakSoortInfo {
  sleutel: TaakSoort;
  label: string;
  icoon: IconNaam;
  /** Geschatte tijd op locatie als de taak zelf niets zegt, voor de planning. */
  minuten: number;
  /** Een afgeronde inspectie van dit sjabloon op hetzelfde object zet de taak door. */
  sjabloon: SjabloonSleutel | null;
}

export const TAAK_SOORT_INFO: Record<TaakSoort, TaakSoortInfo> = {
  oliemonsters: { sleutel: 'oliemonsters', label: 'Oliemonsters', icoon: 'oil-sample', minuten: 60, sjabloon: null },
  persluchtlekken: { sleutel: 'persluchtlekken', label: 'Persluchtlekinspectie', icoon: 'air-leak', minuten: 240, sjabloon: 'persluchtlekken' },
  arbeidsmiddelen: { sleutel: 'arbeidsmiddelen', label: 'Inspectie arbeidsmiddelen', icoon: 'module-inspecties', minuten: 180, sjabloon: 'arbeidsmiddelen' },
  onderhoud: { sleutel: 'onderhoud', label: 'Onderhoud', icoon: 'settings', minuten: 120, sjabloon: null },
  anders: { sleutel: 'anders', label: 'Anders', icoon: 'module-contracten', minuten: 60, sjabloon: null },
};

export function taakSoortInfo(soort: string): TaakSoortInfo {
  return TAAK_SOORT_INFO[soort as TaakSoort] ?? TAAK_SOORT_INFO.anders;
}

/** Welke taaksoort hoort bij een inspectiesjabloon? */
export function soortVanSjabloon(sjabloon: string): TaakSoort | null {
  const gevonden = TAAK_SOORTEN.find((s) => TAAK_SOORT_INFO[s].sjabloon === sjabloon);
  return gevonden ?? null;
}

/** Een taak binnen deze termijn (dagen) telt als binnenkort, op Vandaag en in het dossier. */
export const BINNENKORT_DAGEN = 30;

/** De intervallen die het formulier aanbiedt; elk ander getal van 1 tot 120 mag ook. */
export const INTERVALLEN = [1, 3, 6, 12, 24, 36, 48, 60];
export const MAX_INTERVAL = 120;

/** "elke maand", "elke 6 maanden", "elk jaar", "elke 2 jaar" */
export function intervalTekst(maanden: number): string {
  if (maanden === 1) return 'elke maand';
  if (maanden === 12) return 'elk jaar';
  if (maanden % 12 === 0) return `elke ${maanden / 12} jaar`;
  return `elke ${maanden} maanden`;
}

function geldigeDag(dag: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dag)) return false;
  const [j, m, d] = dag.split('-').map(Number);
  const t = new Date(Date.UTC(j, m - 1, d));
  return t.getUTCFullYear() === j && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * Een dag plus een aantal maanden. Bestaat die dag niet in de doelmaand, dan de
 * laatste dag van die maand: 31 januari plus een maand is 28 (of 29) februari,
 * niet 3 maart. Zo schuift een maandelijkse taak nooit een maand extra op.
 */
export function plusMaandenVast(dag: string, maanden: number): string {
  if (!geldigeDag(dag)) throw new Error(`Geen geldige dag: ${dag}`);
  if (!Number.isInteger(maanden)) throw new Error(`Geen geheel aantal maanden: ${maanden}`);
  const [j, m, d] = dag.split('-').map(Number);
  const doel = new Date(Date.UTC(j, m - 1 + maanden, 1));
  const laatste = new Date(Date.UTC(doel.getUTCFullYear(), doel.getUTCMonth() + 1, 0)).getUTCDate();
  doel.setUTCDate(Math.min(d, laatste));
  return doel.toISOString().slice(0, 10);
}

/** De volgende datum na een uitvoering op `uitgevoerd`. */
export function volgendeNaUitvoering(uitgevoerd: string, intervalMaanden: number): string {
  if (intervalMaanden < 1 || intervalMaanden > MAX_INTERVAL) throw new Error(`Interval buiten bereik: ${intervalMaanden}`);
  return plusMaandenVast(uitgevoerd, intervalMaanden);
}

/** Dag plus n dagen. */
export function plusDagen(dag: string, n: number): string {
  const [j, m, d] = dag.split('-').map(Number);
  return new Date(Date.UTC(j, m - 1, d + n)).toISOString().slice(0, 10);
}

function dagMs(dag: string): number {
  const [j, m, d] = dag.split('-').map(Number);
  return Date.UTC(j, m - 1, d);
}

/** Aantal dagen van `vandaag` tot `dag` (negatief = voorbij). */
export function dagenTot(dag: string, vandaag: string): number {
  return Math.round((dagMs(dag) - dagMs(vandaag)) / 86400000);
}

export type TaakStatus = 'verlopen' | 'binnenkort' | 'gepland' | 'later';

/**
 * De stand van een taak op `vandaag`:
 * - gepland: staat op een planningsdag vanaf vandaag (dan hoeft er niets meer)
 * - verlopen: de datum is voorbij
 * - binnenkort: binnen BINNENKORT_DAGEN dagen
 * - later: daarna
 */
export function taakStatus(volgendeOp: string, vandaag: string, geplandOp: string | null = null): TaakStatus {
  if (geplandOp && geplandOp >= vandaag) return 'gepland';
  const n = dagenTot(volgendeOp, vandaag);
  if (n < 0) return 'verlopen';
  if (n <= BINNENKORT_DAGEN) return 'binnenkort';
  return 'later';
}

/** Vraagt de taak aandacht (op Vandaag en bovenaan het dossier)? */
export function vraagtAandacht(status: TaakStatus): boolean {
  return status === 'verlopen' || status === 'binnenkort';
}

export const TAAK_STATUS_LABEL: Record<TaakStatus, string> = {
  verlopen: 'Verlopen',
  binnenkort: 'Binnenkort',
  gepland: 'Gepland',
  later: 'Op schema',
};

export const TAAK_STATUS_BADGE: Record<TaakStatus, string> = {
  verlopen: 'badge-danger',
  binnenkort: 'badge-warning',
  gepland: 'badge-info',
  later: 'badge-gray',
};

/** "over 12 dagen", "vandaag", "morgen", "3 dagen te laat" */
export function termijnTekst(volgendeOp: string, vandaag: string): string {
  const n = dagenTot(volgendeOp, vandaag);
  if (n === 0) return 'vandaag';
  if (n === 1) return 'morgen';
  if (n === -1) return '1 dag te laat';
  if (n < 0) return `${-n} dagen te laat`;
  return `over ${n} dagen`;
}

/** Een dag (jjjj-mm-dd) als "7 okt 2026" */
export function dagKort(dag: string): string {
  return new Date(`${dag}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '');
}

/** De naam van een taak voor op het scherm en in de agenda. */
export function taakTitel(t: { soort: string; omschrijving?: string | null }): string {
  return t.omschrijving?.trim() || taakSoortInfo(t.soort).label;
}

/** Vandaag als jjjj-mm-dd in Nederland, ook op een server in UTC. */
export function vandaagNl(nu = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(nu);
}
