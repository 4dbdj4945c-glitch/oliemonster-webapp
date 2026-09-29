// Inspecties op de server: invoer (zod), afscherming en het ophalen van een
// inspectie zoals de schermen, het klantportaal en het rapport hem gebruiken.
// Alleen op de server (gebruikt de database).
//
// Afscherming: admin en gebruiker zien alle inspecties. Een kijker komt hier
// alleen met de weergave klantportaal (lib/toegang.ts) en ziet dan uitsluitend
// de AFGERONDE inspecties van zijn eigen klant, en met een kijkjaar alleen die
// van dat jaar. Een inspectie van een andere klant geeft een 404.

import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { ApiFout, optioneelId, optioneleDatum, optioneleTekst, tekst } from '../apiRoute';
import { isAlleenLezen } from '../roles';
import type { Gebruiker } from '../toegang';
import { metInspectieFoto } from '../fotoAdres';
import { nlDag } from '../klantOpdracht';
import {
  INSPECTIE_STATUSSEN,
  SJABLOON_SLEUTELS,
  WaardeFout,
  inspectieNummer,
  leesInstellingen,
  leesWaarden,
  luchtketelWaarschuwing,
  sjabloonVan,
  type SjabloonSleutel,
} from './sjablonen';
import { lekInstellingen, lekTotalen, arbeidsmiddelTelling, uitkomstTekst, volgendeInspectie } from './rekenen';

type Wie = Pick<Gebruiker, 'role' | 'klantId' | 'viewYear'>;

/** Een dag (jjjj-mm-dd) als tijdstip om 12 uur UTC, zodat de dag in elke tijdzone klopt. */
export function dagAlsDatum(dag: string): Date {
  return new Date(`${dag.slice(0, 10)}T12:00:00Z`);
}

/** Een datum uit optioneleDatum (middernacht UTC) naar 12 uur op dezelfde dag; null en undefined blijven. */
export function alsDag<T extends Date | null | undefined>(d: T): T {
  return (d ? dagAlsDatum(d.toISOString()) : d) as T;
}

/** Welke inspecties mag deze gebruiker zien? */
export function inspectieFilter(wie: Wie): Prisma.InspectieWhereInput {
  const basis: Prisma.InspectieWhereInput = { deletedAt: null };
  if (!isAlleenLezen(wie.role)) return basis;
  // Een kijker zonder klant heeft geen inspecties: een id dat nooit bestaat.
  if (!wie.klantId) return { ...basis, id: -1 };
  return {
    ...basis,
    klantId: wie.klantId,
    status: 'afgerond',
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
    .regex(/^\d{4}-\d{2}-\d{2}/, { error: melding })
    .transform((w) => w.slice(0, 10))
    .refine((w) => !Number.isNaN(dagAlsDatum(w).getTime()), { error: melding });

export const NieuweInspectieSchema = z.object({
  sjabloon: z.enum(SJABLOON_SLEUTELS, { error: 'Kies wat voor inspectie het is' }),
  objectId: z.coerce.number({ error: 'Kies het object' }).int({ error: 'Kies het object' }).positive({ error: 'Kies het object' }),
  installatieId: optioneelId('Onbekende installatie'),
  datum: dag('Vul de datum van de inspectie in'),
  uitvoerder: tekst('Vul in wie de inspectie uitvoert', 200),
  samenvatting: optioneleTekst(5000),
});

export const InspectieWijzigingSchema = z.object({
  installatieId: optioneelId('Onbekende installatie'),
  datum: dag('Vul de datum van de inspectie in').optional(),
  uitvoerder: tekst('Vul in wie de inspectie uitvoert', 200).optional(),
  samenvatting: optioneleTekst(5000),
  instellingen: z.record(z.string(), z.unknown()).optional(),
  volgendeOp: optioneleDatum('De datum van de volgende inspectie klopt niet'),
  status: z.enum(INSPECTIE_STATUSSEN, { error: 'Onbekende status' }).optional(),
});

export const ItemSchema = z.object({
  titel: tekst('Vul een labelnummer of naam in', 200),
  locatie: optioneleTekst(300),
  oordeel: optioneleTekst(40),
  notitie: optioneleTekst(5000),
  waarden: z.record(z.string(), z.unknown()).optional(),
  gerepareerd: z.boolean({ error: 'Gerepareerd is ja of nee' }).optional(),
  gerepareerdOp: optioneleDatum('De datum van de reparatie klopt niet'),
  volgendeOp: optioneleDatum('De datum van de volgende inspectie klopt niet'),
  installatieId: optioneelId('Onbekend arbeidsmiddel'),
  volgorde: z.coerce.number().int().min(0).max(100000).optional(),
});
export const ItemWijzigingSchema = ItemSchema.extend({ titel: ItemSchema.shape.titel.optional() });

/** Een WaardeFout uit een sjabloon als 400 met het veld erbij. */
export function metWaardeFout<T>(werk: () => T): T {
  try {
    return werk();
  } catch (e) {
    if (e instanceof WaardeFout) throw new ApiFout(400, e.message, { velden: { [e.veld]: e.message } });
    throw e;
  }
}

/** Controleert oordeel en waarden van een bevinding tegen het sjabloon. */
export function controleerItem(sjabloon: SjabloonSleutel, invoer: z.output<typeof ItemWijzigingSchema>) {
  const s = sjabloonVan(sjabloon);
  if (invoer.oordeel && !s.oordeel.keuzes.some((k) => k.waarde === invoer.oordeel)) {
    throw new ApiFout(400, `Kies een ${s.oordeel.label.toLowerCase()}`, { velden: { oordeel: `Kies een ${s.oordeel.label.toLowerCase()}` } });
  }
  const waarden = invoer.waarden === undefined ? undefined : metWaardeFout(() => leesWaarden(s, invoer.waarden));
  return { waarden };
}

/** Een installatie hoort bij hetzelfde object als de inspectie (of in elk geval bij dezelfde klant). */
export async function controleerInstallatie(installatieId: number | null | undefined, klantId: number) {
  if (!installatieId) return;
  const i = await prisma.installatie.findFirst({
    where: { id: installatieId, deletedAt: null },
    select: { object: { select: { klantId: true } } },
  });
  if (!i || i.object.klantId !== klantId) throw new ApiFout(400, 'Deze installatie hoort niet bij de klant van de inspectie');
}

// ------------------------------------------------------------------
// Ophalen
// ------------------------------------------------------------------

const ITEM_SELECT = {
  id: true,
  volgorde: true,
  installatieId: true,
  titel: true,
  locatie: true,
  oordeel: true,
  notitie: true,
  waarden: true,
  fotoUrl: true,
  gerepareerd: true,
  gerepareerdOp: true,
  volgendeOp: true,
  installatie: { select: { id: true, code: true, naam: true, soort: true, merk: true, typenummer: true, bouwjaar: true } },
} satisfies Prisma.InspectieItemSelect;

export const INSPECTIE_SELECT = {
  id: true,
  sjabloon: true,
  klantId: true,
  objectId: true,
  installatieId: true,
  datum: true,
  uitvoerder: true,
  status: true,
  samenvatting: true,
  instellingen: true,
  volgendeOp: true,
  afgerondOp: true,
  afgerondDoor: true,
  createdAt: true,
  updatedAt: true,
  klant: { select: { id: true, naam: true, logoUrl: true, plaats: true, adres: true, postcode: true } },
  object: { select: { id: true, name: true, address: true, objectType: true } },
  installatie: { select: { id: true, code: true, naam: true, soort: true, merk: true, typenummer: true, bouwjaar: true } },
  items: { where: { deletedAt: null }, orderBy: [{ volgorde: 'asc' }, { id: 'asc' }], select: ITEM_SELECT },
} satisfies Prisma.InspectieSelect;

export type InspectieRij = Prisma.InspectieGetPayload<{ select: typeof INSPECTIE_SELECT }>;

/** Eén inspectie die deze gebruiker mag zien, of een 404. */
export async function haalInspectie(id: number, wie: Wie): Promise<InspectieRij> {
  const rij = await prisma.inspectie.findFirst({ where: { id, ...inspectieFilter(wie) }, select: INSPECTIE_SELECT });
  if (!rij) throw new ApiFout(404, 'Inspectie niet gevonden');
  return rij;
}

/** Totalen per sjabloon, voor het scherm en het rapport. */
export function totalenVan(rij: Pick<InspectieRij, 'sjabloon' | 'instellingen' | 'items'>) {
  if (rij.sjabloon === 'persluchtlekken') {
    const inst = lekInstellingen(rij.instellingen);
    return { soort: 'persluchtlekken' as const, instellingen: inst, ...lekTotalen(rij.items, inst) };
  }
  return { soort: 'arbeidsmiddelen' as const, ...arbeidsmiddelTelling(rij.items) };
}

/** De inspectie zoals de schermen hem krijgen: foto's via de eigen route, dagen als jjjj-mm-dd, totalen erbij. */
export function inspectieAlsJson(rij: InspectieRij) {
  const sjabloon = rij.sjabloon as SjabloonSleutel;
  const s = sjabloonVan(sjabloon);
  const items = rij.items.map((i) =>
    metInspectieFoto({
      ...i,
      gerepareerdOp: i.gerepareerdOp ? nlDag(i.gerepareerdOp) : null,
      volgendeOp: i.volgendeOp ? nlDag(i.volgendeOp) : null,
      waarschuwing: sjabloon === 'arbeidsmiddelen' ? luchtketelWaarschuwing(i.waarden) : null,
    })
  );
  return {
    ...rij,
    nummer: inspectieNummer(rij.id),
    datum: nlDag(rij.datum),
    volgendeOp: rij.volgendeOp ? nlDag(rij.volgendeOp) : null,
    klant: { id: rij.klant.id, naam: rij.klant.naam, plaats: rij.klant.plaats },
    instellingen: leesInstellingen(s, rij.instellingen),
    items,
    volgende: volgendeInspectie(sjabloon, rij.volgendeOp, rij.items),
    uitkomst: uitkomstTekst(sjabloon, rij.items, rij.instellingen),
    totalen: totalenVan(rij),
  };
}

/** Een inspectie in een lijst: zonder de bevindingen zelf. */
export function inspectieInLijst(rij: InspectieRij) {
  const sjabloon = rij.sjabloon as SjabloonSleutel;
  return {
    id: rij.id,
    nummer: inspectieNummer(rij.id),
    sjabloon,
    status: rij.status,
    datum: nlDag(rij.datum),
    uitvoerder: rij.uitvoerder,
    klant: { id: rij.klant.id, naam: rij.klant.naam },
    object: { id: rij.object.id, name: rij.object.name },
    installatie: rij.installatie ? { id: rij.installatie.id, naam: rij.installatie.naam } : null,
    aantal: rij.items.length,
    uitkomst: uitkomstTekst(sjabloon, rij.items, rij.instellingen),
    volgende: volgendeInspectie(sjabloon, rij.volgendeOp, rij.items),
    waarschuwingen: sjabloon === 'arbeidsmiddelen' ? rij.items.filter((i) => luchtketelWaarschuwing(i.waarden)).length : 0,
  };
}

/** De afgeronde inspecties van een klant, voor het klantportaal en het klantdossier. */
export async function inspectiesVanKlant(wie: Wie, klantId: number, alleenAfgerond: boolean) {
  const rijen = await prisma.inspectie.findMany({
    where: { ...inspectieFilter(wie), klantId, ...(alleenAfgerond ? { status: 'afgerond' } : {}) },
    orderBy: [{ datum: 'desc' }, { id: 'desc' }],
    select: INSPECTIE_SELECT,
  });
  return rijen;
}
