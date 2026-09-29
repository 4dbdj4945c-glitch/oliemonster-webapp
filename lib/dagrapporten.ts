// Dagrapporten op de server: invoer (zod), afscherming en ophalen. Alleen op de
// server. Een dagrapport is het bewijs van een bezoek (wat er gedaan is,
// bevindingen, foto's, uren) met de handtekening van de klant; geen factuurbron.
//
// Afscherming: admin en gebruiker zien alle dagrapporten. Een kijker komt hier
// alleen met de weergave klantportaal (lib/toegang.ts, module dagrapporten) en
// ziet dan uitsluitend de GETEKENDE dagrapporten van zijn eigen klant, met een
// kijkjaar alleen die van dat jaar. Een ander id geeft een 404.
//
// Een getekend rapport ligt vast: wijzigen kan pas weer als de handtekening
// gewist is (dan is het weer een concept en moet de klant opnieuw tekenen).

import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './prisma';
import { ApiFout, optioneelGetal, optioneelId, optioneleTekst, tekst } from './apiRoute';
import { isAlleenLezen } from './roles';
import type { Gebruiker } from './toegang';
import { fotoAdres } from './fotoAdres';
import { nlDag } from './klantOpdracht';
import { dagAlsDatum } from './inspecties/server';

type Wie = Pick<Gebruiker, 'role' | 'klantId' | 'viewYear'>;

export const DAGRAPPORT_STATUSSEN = ['concept', 'getekend'] as const;

/** DR-12, voor op het scherm en in de PDF. */
export function dagrapportNummer(id: number): string {
  return `DR-${id}`;
}

/** Een handtekening als PNG in een data-URL, niet groter dan dit (tekst). */
export const MAX_HANDTEKENING = 400_000;

export function dagrapportFilter(wie: Wie): Prisma.DagrapportWhereInput {
  const basis: Prisma.DagrapportWhereInput = { deletedAt: null };
  if (!isAlleenLezen(wie.role)) return basis;
  if (!wie.klantId) return { ...basis, id: -1 };
  return {
    ...basis,
    klantId: wie.klantId,
    status: 'getekend',
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

export const NieuwDagrapportSchema = z.object({
  klantId: z.coerce.number({ error: 'Kies de klant' }).int({ error: 'Kies de klant' }).positive({ error: 'Kies de klant' }),
  planId: optioneelId('Onbekende planningsdag'),
  objectId: optioneelId('Onbekend object'),
  datum: dag('Vul de datum van het bezoek in'),
  uitvoerder: tekst('Vul in wie het werk deed', 200),
  werkzaamheden: optioneleTekst(10000),
  bevindingen: optioneleTekst(10000),
  uren,
});

export const DagrapportWijzigingSchema = z.object({
  objectId: optioneelId('Onbekend object'),
  datum: dag('Vul de datum van het bezoek in').optional(),
  uitvoerder: tekst('Vul in wie het werk deed', 200).optional(),
  werkzaamheden: optioneleTekst(10000),
  bevindingen: optioneleTekst(10000),
  uren,
  minuten: optioneelGetal('De tijd klopt niet', 0, 1440),
});

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
  klantId: true,
  planId: true,
  objectId: true,
  datum: true,
  uitvoerder: true,
  werkzaamheden: true,
  bevindingen: true,
  minuten: true,
  status: true,
  handtekening: true,
  getekendDoor: true,
  getekendOp: true,
  createdAt: true,
  updatedAt: true,
  klant: { select: { id: true, naam: true, logoUrl: true, adres: true, postcode: true, plaats: true } },
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
  klantId: true,
  planId: true,
  datum: true,
  uitvoerder: true,
  minuten: true,
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
  if (!rij) throw new ApiFout(404, 'Dagrapport niet gevonden');
  return rij;
}

/** Het dagrapport voor de schermen: dagen als jjjj-mm-dd, foto's via de eigen route. */
export function dagrapportAlsJson(rij: DagrapportRij) {
  return {
    id: rij.id,
    nummer: dagrapportNummer(rij.id),
    klant: { id: rij.klant.id, naam: rij.klant.naam },
    planId: rij.planId,
    planDag: rij.plan ? nlDag(rij.plan.date) : null,
    object: rij.object,
    datum: nlDag(rij.datum),
    uitvoerder: rij.uitvoerder,
    werkzaamheden: rij.werkzaamheden,
    bevindingen: rij.bevindingen,
    minuten: rij.minuten,
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
    nummer: dagrapportNummer(rij.id),
    klant: { id: rij.klant.id, naam: rij.klant.naam },
    object: rij.object ? { id: rij.object.id, name: rij.object.name } : null,
    planId: rij.planId,
    datum: nlDag(rij.datum),
    uitvoerder: rij.uitvoerder,
    minuten: rij.minuten,
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

/** Wijzigen mag alleen bij een concept. */
export function alleenConcept(rij: Pick<DagrapportRij, 'status'>) {
  if (rij.status === 'getekend') {
    throw new ApiFout(409, 'Dit dagrapport is getekend. Wis eerst de handtekening als je nog iets wilt wijzigen; de klant tekent dan opnieuw.');
  }
}
