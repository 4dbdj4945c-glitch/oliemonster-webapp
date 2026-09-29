// Eigen dossier op de server: invoer (zod) en de vorm waarin de schermen een
// document krijgen. Het opslagadres van het bestand gaat nooit naar de browser;
// downloaden gaat via GET /api/eigen-dossier/[id]/bestand (alleen admin).

import { z } from 'zod';
import { optioneleDatum, optioneleTekst, tekst } from './apiRoute';
import { DOCUMENT_SOORT_WAARDEN, geldigheid } from './eigenDossier';
import { nlDag } from './klantOpdracht';
import { dagAlsDatum } from './inspecties/server';

const velden = {
  soort: z.enum(DOCUMENT_SOORT_WAARDEN, { error: 'Kies wat voor document het is' }),
  titel: tekst('Geef het document een naam', 200),
  uitgever: optioneleTekst(200),
  nummer: optioneleTekst(100),
  afgegevenOp: optioneleDatum('De datum van afgifte klopt niet'),
  vervaltOp: optioneleDatum('De vervaldatum klopt niet'),
  notities: optioneleTekst(2000),
};
export const NieuwDocumentSchema = z.object(velden);
export const DocumentWijzigingSchema = z.object({ ...velden, soort: velden.soort.optional(), titel: velden.titel.optional() });

/** Datums van optioneleDatum (middernacht UTC) naar 12 uur, zodat de dag overal klopt. */
export function documentData(invoer: z.output<typeof DocumentWijzigingSchema>) {
  const data: Record<string, unknown> = {};
  for (const [k, w] of Object.entries(invoer)) {
    if (w === undefined) continue;
    data[k] = w instanceof Date ? dagAlsDatum(w.toISOString()) : w;
  }
  return data;
}

export const DOCUMENT_SELECT = {
  id: true,
  soort: true,
  titel: true,
  uitgever: true,
  nummer: true,
  afgegevenOp: true,
  vervaltOp: true,
  bestandUrl: true,
  bestandNaam: true,
  bestandType: true,
  notities: true,
  updatedAt: true,
} as const;

type Rij = {
  id: number;
  soort: string;
  titel: string;
  uitgever: string | null;
  nummer: string | null;
  afgegevenOp: Date | null;
  vervaltOp: Date | null;
  bestandUrl: string | null;
  bestandNaam: string | null;
  bestandType: string | null;
  notities: string | null;
  updatedAt: Date;
};

export function documentAlsJson(d: Rij, nu = new Date()) {
  const vervaltOp = d.vervaltOp ? nlDag(d.vervaltOp) : null;
  return {
    id: d.id,
    soort: d.soort,
    titel: d.titel,
    uitgever: d.uitgever,
    nummer: d.nummer,
    afgegevenOp: d.afgegevenOp ? nlDag(d.afgegevenOp) : null,
    vervaltOp,
    notities: d.notities,
    bestand: d.bestandUrl ? { naam: d.bestandNaam, type: d.bestandType, adres: `/api/eigen-dossier/${d.id}/bestand` } : null,
    geldigheid: geldigheid(vervaltOp, nu),
    updatedAt: d.updatedAt,
  };
}
