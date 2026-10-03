// Contracten en hun taken op de server: invoer (zod), ophalen met de status en
// de eerstvolgende planningsdag, en een uitvoering vastleggen die de volgende
// datum vanzelf doorzet. Rekenen staat in lib/contracten.ts.
//
// Een uitvoering heeft een bron die per taak uniek is (ContractTaakUitvoering,
// @@unique([taakId, bron])):
//   hand-<tijdstip>  de knop Uitgevoerd
//   stop-<id>        een afgevinkte stop op de planning
//   inspectie-<id>   een afgeronde inspectie van het passende sjabloon op dat object
// Dezelfde bron een tweede keer doet niets: een inspectie die heen en weer gaat
// tussen concept en afgerond zet de datum dus niet twee keer door. Terug naar
// concept of een stop weer open zet de datum terug (maakUitvoeringOngedaan).

import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './prisma';
import { ApiFout, optioneelGetal, optioneelId, optioneleTekst, tekst } from './apiRoute';
import { nlDag } from './klantOpdracht';
import { dagAlsDatum } from './inspecties/server';
import {
  MAX_INTERVAL,
  TAAK_SOORTEN,
  soortVanSjabloon,
  taakSoortInfo,
  taakStatus,
  taakTitel,
  vandaagNl,
  volgendeNaUitvoering,
} from './contracten';

// ------------------------------------------------------------------
// Invoer
// ------------------------------------------------------------------

const dag = (melding: string) =>
  z
    .string({ error: melding })
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: melding })
    .refine((w) => !Number.isNaN(dagAlsDatum(w).getTime()) && nlDag(dagAlsDatum(w)) === w, { error: melding });

const optioneleDag = (melding: string) =>
  z
    .union([z.string(), z.null()], { error: melding })
    .optional()
    .transform((w, ctx) => {
      if (w === undefined) return undefined;
      if (w === null || w.trim() === '') return null;
      const r = dag(melding).safeParse(w);
      if (!r.success) {
        ctx.addIssue({ code: 'custom', message: melding });
        return z.NEVER;
      }
      return r.data;
    });

export const ContractSchema = z.object({
  klantId: z.coerce.number({ error: 'Kies de klant' }).int({ error: 'Kies de klant' }).positive({ error: 'Kies de klant' }),
  naam: tekst('Geef het contract een naam', 200),
  startOp: optioneleDag('De begindatum klopt niet'),
  eindOp: optioneleDag('De einddatum klopt niet'),
  notities: optioneleTekst(5000),
});
export const ContractWijzigingSchema = ContractSchema.omit({ klantId: true }).extend({
  naam: ContractSchema.shape.naam.optional(),
});

const interval = z.coerce
  .number({ error: `Vul een interval in van 1 tot ${MAX_INTERVAL} maanden` })
  .int({ error: `Vul een interval in van 1 tot ${MAX_INTERVAL} maanden` })
  .min(1, { error: `Vul een interval in van 1 tot ${MAX_INTERVAL} maanden` })
  .max(MAX_INTERVAL, { error: `Vul een interval in van 1 tot ${MAX_INTERVAL} maanden` });

export const TaakSchema = z.object({
  soort: z.enum(TAAK_SOORTEN, { error: 'Kies wat voor taak het is' }),
  omschrijving: optioneleTekst(200),
  objectId: z.coerce.number({ error: 'Kies het object' }).int({ error: 'Kies het object' }).positive({ error: 'Kies het object' }),
  installatieId: optioneelId('Onbekende installatie'),
  intervalMaanden: interval,
  volgendeOp: dag('Vul de eerstvolgende datum in'),
  geschatteMinuten: optioneelGetal('Vul de geschatte tijd in minuten in (1 tot 1440)', 1, 1440),
  notities: optioneleTekst(5000),
});
export const TaakWijzigingSchema = TaakSchema.partial().extend({
  omschrijving: optioneleTekst(200),
  installatieId: optioneelId('Onbekende installatie'),
  geschatteMinuten: optioneelGetal('Vul de geschatte tijd in minuten in (1 tot 1440)', 1, 1440),
  notities: optioneleTekst(5000),
});

export const UitvoeringSchema = z.object({ datum: dag('Vul de datum van de uitvoering in').optional() });

/** Object en installatie horen bij de klant van het contract. */
export async function controleerPlek(klantId: number, objectId: number | undefined, installatieId: number | null | undefined) {
  if (objectId !== undefined) {
    const o = await prisma.sampleObject.findUnique({ where: { id: objectId }, select: { klantId: true } });
    if (!o) throw new ApiFout(400, 'Onbekend object', { velden: { objectId: 'Onbekend object' } });
    if (o.klantId !== klantId) {
      throw new ApiFout(400, 'Dit object hoort niet bij de klant van het contract', { velden: { objectId: 'Dit object hoort niet bij de klant van het contract' } });
    }
  }
  if (installatieId) {
    const i = await prisma.installatie.findFirst({ where: { id: installatieId, deletedAt: null }, select: { objectId: true } });
    if (!i || (objectId !== undefined && i.objectId !== objectId)) {
      throw new ApiFout(400, 'Deze installatie staat niet op het gekozen object', { velden: { installatieId: 'Deze installatie staat niet op het gekozen object' } });
    }
  }
}

// ------------------------------------------------------------------
// Ophalen
// ------------------------------------------------------------------

export const TAAK_SELECT = {
  id: true,
  contractId: true,
  soort: true,
  omschrijving: true,
  objectId: true,
  installatieId: true,
  intervalMaanden: true,
  volgendeOp: true,
  geschatteMinuten: true,
  laatstUitgevoerdOp: true,
  notities: true,
  object: { select: { id: true, name: true, address: true, lat: true, lng: true, klantId: true } },
  installatie: { select: { id: true, naam: true, code: true } },
  contract: { select: { id: true, naam: true, klantId: true, klant: { select: { id: true, naam: true } } } },
  uitvoeringen: { orderBy: [{ datum: 'desc' }, { id: 'desc' }], take: 5, select: { id: true, datum: true, bron: true, door: true } },
} satisfies Prisma.ContractTaakSelect;

export type TaakRij = Prisma.ContractTaakGetPayload<{ select: typeof TAAK_SELECT }>;

/** Een actieve taak: niet weggehaald, contract niet weggehaald. */
export const ACTIEVE_TAAK: Prisma.ContractTaakWhereInput = { deletedAt: null, contract: { deletedAt: null } };

/**
 * Per taak de planningsdag waarop hij staat en nog niet is afgevinkt (en het id
 * van de dag): de eerstvolgende vanaf vandaag, en anders de laatste die al
 * voorbij is. Ook een dag in het verleden telt: wie met terugwerkende kracht
 * plant, heeft de taak gepland, en hij hoort dan niet meer bij Nog in te
 * plannen. De status (taakStatus) zegt alleen Gepland bij een dag vanaf vandaag.
 */
export async function geplandeDagen(taakIds: number[], vandaag = vandaagNl()): Promise<Map<number, { dag: string; planId: number; stopId: number }>> {
  const uit = new Map<number, { dag: string; planId: number; stopId: number }>();
  if (taakIds.length === 0) return uit;
  const stops = await prisma.samplePlanStop.findMany({
    where: { taakId: { in: taakIds }, isDone: false },
    select: { id: true, taakId: true, plan: { select: { id: true, date: true } } },
  });
  const opDag = stops
    .filter((s): s is typeof s & { taakId: number } => s.taakId !== null)
    .map((s) => ({ taakId: s.taakId, dag: nlDag(s.plan.date), planId: s.plan.id, stopId: s.id }))
    .sort((a, b) => a.dag.localeCompare(b.dag));
  // Oplopend op dag: een voorbije dag wordt steeds vervangen door de volgende,
  // tot de eerste dag vanaf vandaag; die blijft staan.
  for (const s of opDag) {
    const nu = uit.get(s.taakId);
    if (!nu || nu.dag < vandaag) uit.set(s.taakId, { dag: s.dag, planId: s.planId, stopId: s.stopId });
  }
  return uit;
}

/** De taak zoals de schermen hem krijgen: dagen als jjjj-mm-dd, met status en planning. */
export function taakAlsJson(t: TaakRij, gepland: { dag: string; planId: number } | null, vandaag = vandaagNl()) {
  const volgendeOp = nlDag(t.volgendeOp);
  const info = taakSoortInfo(t.soort);
  return {
    id: t.id,
    contractId: t.contractId,
    contract: { id: t.contract.id, naam: t.contract.naam },
    klant: t.contract.klant,
    soort: t.soort,
    soortLabel: info.label,
    titel: taakTitel(t),
    omschrijving: t.omschrijving,
    object: { id: t.object.id, name: t.object.name, address: t.object.address },
    installatie: t.installatie,
    intervalMaanden: t.intervalMaanden,
    volgendeOp,
    geschatteMinuten: t.geschatteMinuten,
    minuten: t.geschatteMinuten ?? info.minuten,
    laatstUitgevoerdOp: t.laatstUitgevoerdOp ? nlDag(t.laatstUitgevoerdOp) : null,
    notities: t.notities,
    gepland: gepland ? { dag: gepland.dag, planId: gepland.planId } : null,
    status: taakStatus(volgendeOp, vandaag, gepland?.dag ?? null),
    uitvoeringen: t.uitvoeringen.map((u) => ({ id: u.id, datum: nlDag(u.datum), bron: u.bron, door: u.door })),
  };
}
export type TaakJson = ReturnType<typeof taakAlsJson>;

/** Taken met status, gesorteerd op datum. */
export async function haalTaken(where: Prisma.ContractTaakWhereInput = {}): Promise<TaakJson[]> {
  const rijen = await prisma.contractTaak.findMany({
    where: { ...ACTIEVE_TAAK, ...where },
    orderBy: [{ volgendeOp: 'asc' }, { id: 'asc' }],
    select: TAAK_SELECT,
  });
  const vandaag = vandaagNl();
  const gepland = await geplandeDagen(rijen.map((r) => r.id), vandaag);
  return rijen.map((r) => taakAlsJson(r, gepland.get(r.id) ?? null, vandaag));
}

export const CONTRACT_SELECT = {
  id: true,
  klantId: true,
  naam: true,
  startOp: true,
  eindOp: true,
  notities: true,
  deletedAt: true,
  createdAt: true,
  klant: { select: { id: true, naam: true } },
} satisfies Prisma.ContractSelect;

/** Contracten met hun taken, voor het overzicht en het klantdossier. */
export async function haalContracten(where: Prisma.ContractWhereInput = {}) {
  const contracten = await prisma.contract.findMany({
    where: { deletedAt: null, ...where },
    orderBy: [{ klant: { naam: 'asc' } }, { naam: 'asc' }],
    select: CONTRACT_SELECT,
  });
  const taken = await haalTaken({ contractId: { in: contracten.map((c) => c.id) } });
  return contracten.map((c) => ({
    ...c,
    startOp: c.startOp ? nlDag(c.startOp) : null,
    eindOp: c.eindOp ? nlDag(c.eindOp) : null,
    taken: taken.filter((t) => t.contractId === c.id),
  }));
}

export async function haalContract(id: number) {
  const [c] = await haalContracten({ id });
  if (!c) throw new ApiFout(404, 'Contract niet gevonden');
  return c;
}

// ------------------------------------------------------------------
// Uitvoeren
// ------------------------------------------------------------------

function isUniekFout(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

/**
 * Legt een uitvoering vast en zet de volgende datum door (vanaf de dag van de
 * uitvoering). Bestaat deze bron al voor deze taak, dan gebeurt er niets.
 *
 * Is de dag ouder dan de laatste uitvoering (een oude inspectie die nu pas
 * wordt afgerond, of Uitgevoerd met een datum van vorig jaar), dan komt hij
 * wel in de geschiedenis, maar schuift de taak niet terug: `vorigeOp` en
 * `volgendeOp` zijn dan gelijk en zo'n regel verandert niets (`doorgezet` false).
 *
 * De taakregel wordt vergrendeld (FOR UPDATE), zodat twee uitvoeringen tegelijk
 * elkaar niet overschrijven.
 */
export async function registreerUitvoering(
  taakId: number,
  uitvoering: { datum: string; bron: string; door: string | null }
): Promise<{ nieuw: boolean; doorgezet: boolean; volgendeOp: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ContractTaak" WHERE "id" = ${taakId} FOR UPDATE`;
      const taak = await tx.contractTaak.findUnique({
        where: { id: taakId },
        select: { volgendeOp: true, intervalMaanden: true, laatstUitgevoerdOp: true },
      });
      if (!taak) throw new ApiFout(404, 'Taak niet gevonden');
      const bestaand = await tx.contractTaakUitvoering.findUnique({ where: { taakId_bron: { taakId, bron: uitvoering.bron } }, select: { id: true } });
      if (bestaand) return { nieuw: false, doorgezet: false, volgendeOp: nlDag(taak.volgendeOp) };
      const laatst = taak.laatstUitgevoerdOp ? nlDag(taak.laatstUitgevoerdOp) : null;
      const doorzetten = laatst === null || uitvoering.datum >= laatst;
      const volgende = doorzetten ? volgendeNaUitvoering(uitvoering.datum, taak.intervalMaanden) : nlDag(taak.volgendeOp);
      await tx.contractTaakUitvoering.create({
        data: {
          taakId,
          datum: dagAlsDatum(uitvoering.datum),
          bron: uitvoering.bron,
          vorigeOp: taak.volgendeOp,
          volgendeOp: doorzetten ? dagAlsDatum(volgende) : taak.volgendeOp,
          door: uitvoering.door,
        },
      });
      if (doorzetten) {
        await tx.contractTaak.update({
          where: { id: taakId },
          data: { volgendeOp: dagAlsDatum(volgende), laatstUitgevoerdOp: dagAlsDatum(uitvoering.datum) },
        });
      }
      return { nieuw: true, doorgezet: doorzetten && nlDag(taak.volgendeOp) !== volgende, volgendeOp: volgende };
    });
  } catch (e) {
    // Twee verzoeken tegelijk met dezelfde bron: de ander was net eerder.
    if (isUniekFout(e)) {
      const t = await prisma.contractTaak.findUnique({ where: { id: taakId }, select: { volgendeOp: true } });
      return { nieuw: false, doorgezet: false, volgendeOp: t ? nlDag(t.volgendeOp) : uitvoering.datum };
    }
    throw e;
  }
}

/** Heeft deze uitvoering de taak doorgezet (of alleen de geschiedenis aangevuld)? */
function zetteDoor(u: { vorigeOp: Date; volgendeOp: Date }): boolean {
  return u.vorigeOp.getTime() !== u.volgendeOp.getTime();
}

/**
 * Haalt een uitvoering weg. Een uitvoering die niets doorzette (een oude datum)
 * kan altijd weg. Een die de taak doorzette alleen als het de laatste daarvan
 * is: dan gaat de datum terug. Anders klopt terugzetten niet meer en gebeurt er
 * niets. Geeft terug of het lukte.
 */
export async function maakUitvoeringOngedaan(taakId: number, bron: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ContractTaak" WHERE "id" = ${taakId} FOR UPDATE`;
    const alle = await tx.contractTaakUitvoering.findMany({
      where: { taakId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, bron: true, vorigeOp: true, volgendeOp: true, datum: true },
    });
    const doel = alle.find((u) => u.bron === bron);
    if (!doel) return false;
    if (!zetteDoor(doel)) {
      await tx.contractTaakUitvoering.delete({ where: { id: doel.id } });
      return true;
    }
    const laatsteDoorgezet = alle.find(zetteDoor);
    if (laatsteDoorgezet?.id !== doel.id) return false;
    await tx.contractTaakUitvoering.delete({ where: { id: doel.id } });
    const over = alle.filter((u) => u.id !== doel.id && zetteDoor(u));
    const laatst = over.reduce<Date | null>((m, u) => (m === null || u.datum > m ? u.datum : m), null);
    await tx.contractTaak.update({ where: { id: taakId }, data: { volgendeOp: doel.vorigeOp, laatstUitgevoerdOp: laatst } });
    return true;
  });
}

/**
 * Een inspectie is afgerond (of weer concept): de taken van het passende
 * sjabloon op hetzelfde object (en, als de taak een installatie heeft, dezelfde
 * installatie) gaan door, of weer terug.
 */
export async function naInspectieStatus(
  inspectie: { id: number; sjabloon: string; objectId: number; installatieId: number | null; datum: Date },
  afgerond: boolean,
  door: string | null
): Promise<number[]> {
  const soort = soortVanSjabloon(inspectie.sjabloon);
  if (!soort) return [];
  const taken = await prisma.contractTaak.findMany({
    where: {
      ...ACTIEVE_TAAK,
      soort,
      objectId: inspectie.objectId,
      OR: [{ installatieId: null }, ...(inspectie.installatieId ? [{ installatieId: inspectie.installatieId }] : [])],
    },
    select: { id: true },
  });
  const bron = `inspectie-${inspectie.id}`;
  const geraakt: number[] = [];
  for (const t of taken) {
    const veranderd = afgerond
      ? (await registreerUitvoering(t.id, { datum: nlDag(inspectie.datum), bron, door })).nieuw
      : await maakUitvoeringOngedaan(t.id, bron);
    if (veranderd) geraakt.push(t.id);
  }
  return geraakt;
}

// ------------------------------------------------------------------
// Klantportaal
// ------------------------------------------------------------------

/**
 * De komende onderhoudsmomenten van een klant, zoals de klant ze ziet: soort,
 * titel, plek en datum. Geen notities, geen interval en geen uitvoerder.
 * Staat de taak op een planningsdag, dan die dag; anders de verwachte datum.
 * Met een kijkjaar alleen de momenten in dat jaar.
 */
export async function onderhoudVoorKlant(klantId: number, kijkjaar: number | null) {
  const taken = await haalTaken({ contract: { klantId, deletedAt: null } });
  const vandaag = vandaagNl();
  return taken
    .map((t) => {
      const datum = t.gepland?.dag ?? t.volgendeOp;
      return {
        id: t.id,
        soort: t.soort,
        titel: t.titel,
        soortLabel: t.soortLabel,
        object: t.object.name,
        installatie: t.installatie?.naam ?? null,
        datum,
        // Voor de klant neutraal: gepland (op een dag), verwacht, of (datum
        // voorbij en nog niet gepland) wordt ingepland. Nooit "verlopen".
        gepland: t.gepland !== null,
        wordtIngepland: t.gepland === null && datum < vandaag,
      };
    })
    .filter((m) => (kijkjaar ? m.datum.startsWith(String(kijkjaar)) : true))
    .sort((a, b) => a.datum.localeCompare(b.datum));
}

// ------------------------------------------------------------------
// Planning
// ------------------------------------------------------------------

/**
 * Wat er naast de oliemonsters nog op een dag kan: de taken die niet op een
 * komende dag staan (vroegste datum eerst) en de inspecties die nog concept
 * zijn en ook niet gepland. Voor het blok Nog in te plannen op de planning.
 */
export async function haalTePlannen() {
  const vandaag = vandaagNl();
  const [alleTaken, concepten] = await Promise.all([
    haalTaken(),
    prisma.inspectie.findMany({
      where: { deletedAt: null, status: 'concept' },
      orderBy: [{ datum: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        sjabloon: true,
        datum: true,
        klant: { select: { id: true, naam: true } },
        object: { select: { id: true, name: true } },
        stops: { select: { id: true } },
      },
    }),
  ]);
  const taken = alleTaken.filter((t) => t.gepland === null);
  // Een inspectie die op een dag staat, ook een dag die al voorbij is (met
  // terugwerkende kracht gepland, of al bezocht maar nog niet afgerond), is
  // gepland en hoort niet meer bij Nog in te plannen.
  const inspecties = concepten
    .filter((i) => i.stops.length === 0)
    .map((i) => ({ id: i.id, sjabloon: i.sjabloon, datum: nlDag(i.datum), klant: i.klant, object: i.object }));
  return { taken, inspecties };
}

/**
 * Een taak of contract gaat weg: haal de taak van de komende planningsdagen
 * (nog niet afgevinkt), anders blijft hij op de planning en in de agendafeed
 * staan. Wat al gedaan is, blijft. Geeft het aantal weggehaalde stops.
 */
export async function haalTakenVanPlanning(taakIds: number[]): Promise<number> {
  if (taakIds.length === 0) return 0;
  const vandaag = vandaagNl();
  const stops = await prisma.samplePlanStop.findMany({
    where: { taakId: { in: taakIds }, isDone: false, startedAt: null },
    select: { id: true, plan: { select: { date: true } } },
  });
  const weg = stops.filter((s) => nlDag(s.plan.date) >= vandaag).map((s) => s.id);
  if (weg.length > 0) await prisma.samplePlanStop.deleteMany({ where: { id: { in: weg } } });
  return weg.length;
}
