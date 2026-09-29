// Het eigen dossier van It's Done Services (alleen admin): soorten documenten,
// wanneer iets verloopt, en welke documenten in het inhuurdossier gaan.
// Geen server-imports: dit bestand draait ook in de browser (Vandaag, de
// pagina Eigen dossier) en in de API.

import type { IconNaam } from '@/app/components/ui';

export interface DocumentSoort {
  waarde: string;
  label: string;
  /** Hoort bij het deskundigheidsdossier (diploma's, cursussen, kalibratie). */
  deskundigheid: boolean;
  icoon: IconNaam;
}

export const DOCUMENT_SOORTEN: DocumentSoort[] = [
  { waarde: 'vca', label: 'VCA', deskundigheid: false, icoon: 'alert-success' },
  { waarde: 'verzekering', label: 'Verzekering', deskundigheid: false, icoon: 'document' },
  { waarde: 'kvk', label: 'KvK-uittreksel', deskundigheid: false, icoon: 'company' },
  { waarde: 'diploma', label: 'Diploma', deskundigheid: true, icoon: 'document' },
  { waarde: 'cursus', label: 'Cursus', deskundigheid: true, icoon: 'document' },
  { waarde: 'kalibratie', label: 'Kalibratie meetmiddel', deskundigheid: true, icoon: 'gauge' },
  { waarde: 'overig', label: 'Overig', deskundigheid: false, icoon: 'document' },
];

export const DOCUMENT_SOORT_WAARDEN = DOCUMENT_SOORTEN.map((s) => s.waarde) as [string, ...string[]];

export function documentSoort(waarde: string | null | undefined): DocumentSoort {
  return DOCUMENT_SOORTEN.find((s) => s.waarde === waarde) ?? DOCUMENT_SOORTEN[DOCUMENT_SOORTEN.length - 1];
}

/** Binnen zoveel dagen verlopen geeft een waarschuwing, ook op Vandaag. */
export const WAARSCHUW_DAGEN = 30;

export type Geldigheid = 'geldig' | 'verloopt' | 'verlopen' | 'zonder-datum';

export const GELDIGHEID_LABEL: Record<Geldigheid, string> = {
  geldig: 'Geldig',
  verloopt: 'Verloopt binnenkort',
  verlopen: 'Verlopen',
  'zonder-datum': 'Verloopt niet',
};
export const GELDIGHEID_BADGE: Record<Geldigheid, string> = {
  geldig: 'badge-success',
  verloopt: 'badge-warning',
  verlopen: 'badge-danger',
  'zonder-datum': 'badge-gray',
};
export const GELDIGHEID_ICOON: Record<Geldigheid, IconNaam> = {
  geldig: 'status-taken',
  verloopt: 'alert-warning',
  verlopen: 'status-not-taken',
  'zonder-datum': 'status-round-open',
};

/** Vandaag als jjjj-mm-dd in Nederland. */
export function vandaagDag(nu = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(nu);
}

/** Aantal hele dagen van vandaag tot de vervaldag (negatief = al verlopen). */
export function dagenTot(vervaltOp: string, nu = new Date()): number {
  const a = Date.parse(`${vandaagDag(nu)}T00:00:00Z`);
  const b = Date.parse(`${vervaltOp.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/** Geldig, verloopt binnen 30 dagen, verlopen of zonder vervaldatum. De vervaldag zelf telt nog als geldig. */
export function geldigheid(vervaltOp: string | null | undefined, nu = new Date()): Geldigheid {
  if (!vervaltOp) return 'zonder-datum';
  const dagen = dagenTot(vervaltOp, nu);
  if (dagen < 0) return 'verlopen';
  if (dagen <= WAARSCHUW_DAGEN) return 'verloopt';
  return 'geldig';
}

/** Mag het mee in het inhuurdossier? Alles wat niet verlopen is. */
export function isGeldig(vervaltOp: string | null | undefined, nu = new Date()): boolean {
  return geldigheid(vervaltOp, nu) !== 'verlopen';
}

/** "verloopt over 12 dagen", "verloopt vandaag", "3 dagen geleden verlopen" */
export function vervalTekst(vervaltOp: string | null | undefined, nu = new Date()): string {
  if (!vervaltOp) return 'verloopt niet';
  const d = dagenTot(vervaltOp, nu);
  if (d === 0) return 'verloopt vandaag';
  if (d === 1) return 'verloopt morgen';
  if (d > 1) return `verloopt over ${d} dagen`;
  if (d === -1) return 'gisteren verlopen';
  return `${-d} dagen geleden verlopen`;
}

/** Welke bestanden mogen erin: PDF of een foto (scan). */
export const DOCUMENT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
export const DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;
