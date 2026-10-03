// Werkbonnen op de server (in de database en de API nog Dagrapport): invoer
// (zod), afscherming en ophalen. Alleen op de server. Een werkbon is het
// verslag van een bezoek (wat er gedaan is, bevindingen, tijd, materialen,
// foto's), getekend door de klant of afgerond zonder handtekening; geen
// factuurbron. Keuzes en rekenregels staan in lib/werkbon.ts.
//
// Afscherming: admin en gebruiker zien alle werkbonnen. Een kijker komt hier
// alleen met de weergave klantportaal (lib/toegang.ts, module dagrapporten) en
// ziet dan uitsluitend de AFGERONDE en GETEKENDE werkbonnen van zijn eigen
// klant, met een kijkjaar alleen die van dat jaar. Een ander id geeft een 404.
//
// Een afgeronde of getekende werkbon ligt vast: wijzigen kan pas weer na
// heropenen (afgerond) of het wissen van de handtekening (getekend).

import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './prisma';
import { ApiFout, optioneelGetal, optioneelId, optioneleTekst, tekst } from './apiRoute';
import { isAlleenLezen } from './roles';
import type { Gebruiker } from './toegang';
import { fotoAdres } from './fotoAdres';
import { nlDag } from './klantOpdracht';
import { dagAlsDatum } from './inspecties/server';
import { SOORT_WERK_WAARDEN, TIJDSOORTEN, VASTE_STATUSSEN, minutenUitTijden, werkbonNummer, type Materiaal } from './werkbon';

type Wie = Pick<Gebruiker, 'role' | 'klantId' | 'viewYear'>;

/** WB-2026-012, voor op het scherm en in de PDF. */
export const dagrapportNummer = werkbonNummer;

/** Een handtekening als PNG in een data-URL, niet groter dan dit (tekst). */
export const MAX_HANDTEKENING = 400_000;

export function dagrapportFilter(wie: Wie): Prisma.DagrapportWhereInput {
  const basis: Prisma.DagrapportWhereInput = { deletedAt: null };
  if (!isAlleenLezen(wie.role)) return basis;
  if (!wie.klantId) return { ...basis, id: -1 };
  return {
    ...basis,
    klantId: wie.klantId,
    status: { in: VASTE_STATUSSEN },
    ...(wie.viewYear ? { datum: { gte: new Date(Date.UTC(wie.viewYear, 0, 1)), lt: new Date(Date.UTC(wie.viewYear + 1, 0, 1)) } } : {}),
  };
}

// ------------------------------------------------------------------
// Invoer
// ------------------------------------------------------------------

const dag = (melding: string) =>
  z
    .string({ error: melding })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: melding })
    .refine((w) => nlDag(dagAlsDatum(w)) === w, { error: melding });

/** Uren als "2,5" of "2.5" of 150 minuten; opgeslagen als minuten. */
const uren = z
  .union([z.number(), z.string(), z.null()], { error: 'Vul de uren in als getal, bijvoorbeeld 2,5' })
  .optional()
  .transform((w, ctx) => {
    if (w === undefined) return undefined;
    if (w === null || (typeof w === 'string' && w.trim() === '')) return null;
    const n = typeof w === 'number' ? w : Number(w.trim().replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 24) {
      ctx.addIssue({ code: 'custom', message: 'Vul de uren in als getal van 0 tot 24, bijvoorbeeld 2,5' });
      return z.NEVER;
    }
    return Math.round(n * 60);
  });

/** Een getal met decimalen ("2,5"), of null bij leeg. */
const optioneelDecimaal = (melding: string, min: number, max: number) =>
  z
    .union([z.number(), z.string(), z.null()], { error: melding })
    .optional()
    .transform((w, ctx) => {
      if (w === undefined || w === null || (typeof w === 'string' && w.trim() === '')) return null;
      const n = typeof w === 'number' ? w : Number(w.trim().replace(',', '.'));
      if (!Number.isFinite(n) || n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: melding });
        return z.NEVER;
      }
      return Math.round(n * 1000) / 1000;
    });

const klok = (melding: string) =>
  z
    .union([z.string(), z.null()], { error: melding })
    .optional()
    .transform((w, ctx) => {
      if (w === undefined) return undefined;
      if (w === null || w.trim() === '') return null;
      const t = w.trim().replace('.', ':');
      const m = /^(\d{1,2}):(\d{2})$/.exec(t);
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
        ctx.addIssue({ code: 'custom', message: melding });
        return z.NEVER;
      }
      return `${m[1].padStart(2, '0')}:${m[2]}`;
    });

const MateriaalSchema = z.object({
  omschrijving: tekst('Vul bij elk materiaal een omschrijving in', 300),
  aantal: optioneelDecimaal('Vul het aantal in als getal', 0, 100000),
  eenheid: optioneleTekst(20),
  artikelnummer: optioneleTekst(100),
});

const materialen = z
  .array(MateriaalSchema, { error: 'De materialen kloppen niet' })
  .max(100, { error: 'Maximaal 100 regels materiaal' })
  .nullable()
  .optional()
  .transform((lijst): Materiaal[] | null | undefined =>
    lijst === undefined
      ? undefined
      : lijst === null || lijst.length === 0
        ? null
        : lijst.map((m) => ({ omschrijving: m.omschrijving, aantal: m.aantal ?? null, eenheid: m.eenheid ?? null, artikelnummer: m.artikelnummer ?? null }))
  );

/** Velden die zowel bij aanmaken als wijzigen kunnen. */
const werkbonVelden = {
  soortWerk: z.enum(SOORT_WERK_WAARDEN, { error: 'Kies het soort werk' }).nullable().optional(),
  referentie: optioneleTekst(100),
  contactpersoon: optioneleTekst(200),
  tijdsoort: z.enum(TIJDSOORTEN, { error: 'Kies hoe je de tijd vastlegt' }).optional(),
  beginTijd: klok('Vul de begintijd in als 07:30'),
  eindTijd: klok('Vul de eindtijd in als 16:00'),
  pauzeMinuten: optioneelGetal('Vul de pauze in minuten in', 0, 600),
  reisMinuten: optioneelGetal('Vul de reistijd in minuten in', 0, 1440),
  kilometers: optioneelGetal('Vul de kilometers in als getal', 0, 5000),
  materialen,
  vervolgNodig: z.boolean().optional(),
  vervolgActie: optioneleTekst(5000),
  handtekeningVragen: z.boolean().optional(),
};

export const NieuwDagrapportSchema = z.object({
  klantId: z.coerce.number({ error: 'Kies de klant' }).int({ error: 'Kies de klant' }).positive({ error: 'Kies de klant' }),
  planId: optioneelId('Onbekende planningsdag'),
  objectId: optioneelId('Onbekend object'),
  datum: dag('Vul de datum van het bezoek in'),
  uitvoerder: tekst('Vul in wie het werk deed', 200),
  werkzaamheden: optioneleTekst(10000),
  bevindingen: optioneleTekst(10000),
  uren,
  ...werkbonVelden,
});

export const DagrapportWijzigingSchema = z.object({
  objectId: optioneelId('Onbekend object'),
  datum: dag('Vul de datum van het bezoek in').optional(),
  uitvoerder: tekst('Vul in wie het werk deed', 200).optional(),
  werkzaamheden: optioneleTekst(10000),
  bevindingen: optioneleTekst(10000),
  uren,
  minuten: optioneelGetal('De tijd klopt niet', 0, 1440),
  ...werkbonVelden,
});

type Tijdvelden = { tijdsoort?: string; beginTijd?: string | null; eindTijd?: string | null; pauzeMinuten?: number | null; uren?: number | null; minuten?: number | null };

/**
 * De tijdvelden voor de database, met de huidige waarden als basis: bij
 * tijden rekent de server de minuten uit begin, eind en pauze; bij n.v.t.
 * zijn er geen minuten. Geeft alleen de velden terug die veranderen.
 */
export function tijdData(invoer: Tijdvelden, huidig: { tijdsoort: string; beginTijd: string | null; eindTijd: string | null; pauzeMinuten: number | null } = { tijdsoort: 'uren', beginTijd: null, eindTijd: null, pauzeMinuten: null }) {
  const data: Record<string, unknown> = {};
  const soort = invoer.tijdsoort ?? huidig.tijdsoort;
  if (invoer.tijdsoort !== undefined) data.tijdsoort = invoer.tijdsoort;
  for (const k of ['beginTijd', 'eindTijd', 'pauzeMinuten'] as const) if (invoer[k] !== undefined) data[k] = invoer[k];
  if (soort === 'nvt') {
    data.minuten = null;
  } else if (soort === 'tijden') {
    const begin = invoer.beginTijd !== undefined ? invoer.beginTijd : huidig.beginTijd;
    const eind = invoer.eindTijd !== undefined ? invoer.eindTijd : huidig.eindTijd;
    const pauze = invoer.pauzeMinuten !== undefined ? invoer.pauzeMinuten : huidig.pauzeMinuten;
    if (begin && eind && minutenUitTijden(begin, eind, pauze) === null) {
      throw new ApiFout(400, 'De pauze is langer dan de tijd tussen begin en eind', { velden: { pauzeMinuten: 'Langer dan de gewerkte tijd' } });
    }
    data.minuten = minutenUitTijden(begin, eind, pauze);
  } else if (invoer.uren !== undefined) {
    data.minuten = invoer.uren;
  } else if (invoer.minuten !== undefined) {
    data.minuten = invoer.minuten;
  }
  return data;
}

export const HandtekeningSchema = z.object({
  naam: tekst('Vul de naam in van wie tekent', 200),
  handtekening: z
    .string({ error: 'Laat de klant eerst tekenen' })
    .max(MAX_HANDTEKENING, { error: 'De handtekening is te groot' })
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, { error: 'Laat de klant eerst tekenen' }),
});

/** Het object hoort bij de klant van het dagrapport. */
export async function controleerObject(objectId: number | null | undefined, klantId: number) {
  if (!objectId) return;
  const o = await prisma.sampleObject.findUnique({ where: { id: objectId }, select: { klantId: true } });
  if (!o || o.klantId !== klantId) throw new ApiFout(400, 'Dit object hoort niet bij de klant', { velden: { objectId: 'Dit object hoort niet bij de klant' } });
}

// ------------------------------------------------------------------
// Ophalen
// ------------------------------------------------------------------

export const DAGRAPPORT_SELECT = {
  id: true,
  nummerJaar: true,
  volgnummer: true,
  klantId: true,
  planId: true,
  objectId: true,
  datum: true,
  uitvoerder: true,
  werkzaamheden: true,
  bevindingen: true,
  minuten: true,
  tijdsoort: true,
  beginTijd: true,
  eindTijd: true,
  pauzeMinuten: true,
  reisMinuten: true,
  kilometers: true,
  soortWerk: true,
  referentie: true,
  contactpersoon: true,
  materialen: true,
  vervolgNodig: true,
  vervolgActie: true,
  handtekeningVragen: true,
  afgerondOp: true,
  status: true,
  handtekening: true,
  getekendDoor: true,
  getekendOp: true,
  createdAt: true,
  updatedAt: true,
  klant: { select: { id: true, naam: true, logoUrl: true, adres: true, postcode: true, plaats: true, werkbonHandtekening: true } },
  object: { select: { id: true, name: true, address: true } },
  plan: { select: { id: true, date: true } },
  fotos: { orderBy: [{ volgorde: 'asc' }, { id: 'asc' }], select: { id: true, url: true, bijschrift: true, volgorde: true } },
} satisfies Prisma.DagrapportSelect;

export type DagrapportRij = Prisma.DagrapportGetPayload<{ select: typeof DAGRAPPORT_SELECT }>;

/**
 * Voor lijsten (Dagrapporten, veldscherm, klantportaal): zonder de handtekening
 * (tot 400 kB per rapport) en zonder de lange teksten. De handtekening komt
 * alleen mee waar hij getoond of in de PDF gezet wordt (haalDagrapport).
 */
export const DAGRAPPORT_LIJST_SELECT = {
  id: true,
  nummerJaar: true,
  volgnummer: true,
  klantId: true,
  planId: true,
  datum: true,
  uitvoerder: true,
  minuten: true,
  tijdsoort: true,
  soortWerk: true,
  referentie: true,
  vervolgNodig: true,
  status: true,
  getekendDoor: true,
  klant: { select: { id: true, naam: true } },
  object: { select: { id: true, name: true } },
  _count: { select: { fotos: true } },
} satisfies Prisma.DagrapportSelect;

export type DagrapportLijstRij = Prisma.DagrapportGetPayload<{ select: typeof DAGRAPPORT_LIJST_SELECT }>;

/** Voor het klantdossier: de teksten en foto's wel, de handtekening niet. */
export const { handtekening: _handtekening, ...DAGRAPPORT_DOSSIER_SELECT } = DAGRAPPORT_SELECT;

export async function haalDagrapport(id: number, wie: Wie): Promise<DagrapportRij> {
  const rij = await prisma.dagrapport.findFirst({ where: { id, ...dagrapportFilter(wie) }, select: DAGRAPPORT_SELECT });
  if (!rij) throw new ApiFout(404, 'Werkbon niet gevonden');
  return rij;
}

/** De materialen uit de JSON-kolom, alleen de regels die kloppen. */
export function leesMaterialen(w: Prisma.JsonValue | null): Materiaal[] {
  if (!Array.isArray(w)) return [];
  return w.flatMap((m) => {
    if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.omschrijving !== 'string') return [];
    return [{
      omschrijving: m.omschrijving,
      aantal: typeof m.aantal === 'number' ? m.aantal : null,
      eenheid: typeof m.eenheid === 'string' ? m.eenheid : null,
      artikelnummer: typeof m.artikelnummer === 'string' ? m.artikelnummer : null,
    }];
  });
}

/** Het dagrapport voor de schermen: dagen als jjjj-mm-dd, foto's via de eigen route. */
export function dagrapportAlsJson(rij: DagrapportRij) {
  return {
    id: rij.id,
    nummer: dagrapportNummer(rij),
    klant: { id: rij.klant.id, naam: rij.klant.naam },
    planId: rij.planId,
    planDag: rij.plan ? nlDag(rij.plan.date) : null,
    object: rij.object,
    datum: nlDag(rij.datum),
    uitvoerder: rij.uitvoerder,
    werkzaamheden: rij.werkzaamheden,
    bevindingen: rij.bevindingen,
    minuten: rij.minuten,
    tijdsoort: rij.tijdsoort,
    beginTijd: rij.beginTijd,
    eindTijd: rij.eindTijd,
    pauzeMinuten: rij.pauzeMinuten,
    reisMinuten: rij.reisMinuten,
    kilometers: rij.kilometers,
    soortWerk: rij.soortWerk,
    referentie: rij.referentie,
    contactpersoon: rij.contactpersoon,
    materialen: leesMaterialen(rij.materialen),
    vervolgNodig: rij.vervolgNodig,
    vervolgActie: rij.vervolgActie,
    handtekeningVragen: rij.handtekeningVragen,
    afgerondOp: rij.afgerondOp,
    status: rij.status,
    handtekening: rij.handtekening,
    getekendDoor: rij.getekendDoor,
    getekendOp: rij.getekendOp,
    fotos: rij.fotos.map((f) => ({ id: f.id, url: fotoAdres('dagrapport', f.id, null, f.url)!, bijschrift: f.bijschrift })),
    pdf: `/api/dagrapporten/${rij.id}/pdf`,
  };
}
export type DagrapportJson = ReturnType<typeof dagrapportAlsJson>;

/** Een regel in een lijst: zonder handtekening en tekst. */
export function dagrapportInLijst(rij: DagrapportLijstRij) {
  return {
    id: rij.id,
    nummer: dagrapportNummer(rij),
    klant: { id: rij.klant.id, naam: rij.klant.naam },
    object: rij.object ? { id: rij.object.id, name: rij.object.name } : null,
    planId: rij.planId,
    datum: nlDag(rij.datum),
    uitvoerder: rij.uitvoerder,
    minuten: rij.minuten,
    tijdsoort: rij.tijdsoort,
    soortWerk: rij.soortWerk,
    referentie: rij.referentie,
    vervolgNodig: rij.vervolgNodig,
    status: rij.status,
    getekendDoor: rij.getekendDoor,
    aantalFotos: rij._count.fotos,
    pdf: `/api/dagrapporten/${rij.id}/pdf`,
  };
}

export async function haalDagrapporten(wie: Wie, where: Prisma.DagrapportWhereInput = {}) {
  const rijen = await prisma.dagrapport.findMany({
    where: { ...dagrapportFilter(wie), ...where },
    orderBy: [{ datum: 'desc' }, { id: 'desc' }],
    select: DAGRAPPORT_LIJST_SELECT,
  });
  return rijen;
}

export const GETEKEND_MELDING =
  'Deze werkbon ligt vast. Heropen hem (of wis de handtekening) als je nog iets wilt wijzigen.';

/**
 * Wijzigt een dagrapport alleen als het op dat moment nog een concept is, in
 * één update (geen controle en dan los bijwerken): tekent de klant net op een
 * ander scherm, dan wint niet stil de tweede.
 */
export async function wijzigConcept(id: number, data: Prisma.DagrapportUpdateManyMutationInput) {
  const { count } = await prisma.dagrapport.updateMany({ where: { id, status: 'concept', deletedAt: null }, data });
  if (count === 0) throw new ApiFout(409, GETEKEND_MELDING);
}

/** Wijzigen mag alleen bij een concept. */
export function alleenConcept(rij: Pick<DagrapportRij, 'status'>) {
  if (rij.status !== 'concept') {
    throw new ApiFout(409, GETEKEND_MELDING);
  }
}
