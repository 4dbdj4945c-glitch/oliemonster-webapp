// De oliemonsteropdracht van één klant in één jaar, zoals de klant hem ziet:
// voor het klantportaal (GET /api/portaal) en het rapport (GET /api/rapport).
// Alleen op de server. Wie welke klant en welk jaar mag opvragen, controleren
// de routes zelf (lib/afscherming.ts); hier wordt niets meer gefilterd op de
// gebruiker.
//
// Bewust NIET voor de klant: rijtijden, route, starttijden, geplande minuten,
// notities bij een monsterdag, wie iets vastlegde en interne opmerkingen.

import { prisma } from './prisma';
import { actiefFilter } from './verwijderdeMonsters';
import { monstersVanKlant } from './afscherming';
import { leesSampleIds } from './samplePlans';
import { legeTelling, type KlantStatus, type KlantTelling } from './klantStatus';

/** Kalenderdag jjjj-mm-dd in Nederland, los van de tijdzone van de server. */
export function nlDag(datum: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam' }).format(datum);
}

export interface OpdrachtMonster {
  id: number;
  oNumber: string;
  description: string;
  location: string;
  oilType: string | null;
  objectId: number | null;
  objectNaam: string | null;
  installatieNaam: string | null;
  status: KlantStatus;
  /** Genomen: de datum van afname. Gepland: de monsterdag. Anders null. */
  datum: Date | null;
  /** Bij niet bereikbaar de reden en omschrijving, bij geannuleerd de reden (als die mee mag). */
  reden: string | null;
  /** De opslagadressen; het portaal zet ze om naar /api/fotos/..., het rapport haalt ze zelf op. */
  photoUrl: string | null;
  partPhotoUrl: string | null;
}

export interface OpdrachtObject {
  id: number | null;
  naam: string;
  objectType: string | null;
  telling: KlantTelling;
  /** De eerstvolgende monsterdag van dit object (jjjj-mm-dd), of null. */
  volgendBezoek: string | null;
  /** Het monster met de laatste foto, voor een miniatuur. */
  laatsteFotoMonster: { id: number; photoUrl: string | null; partPhotoUrl: string | null } | null;
}

export interface OpdrachtDag {
  /** jjjj-mm-dd */
  dag: string;
  objecten: string[];
  aantal: number;
}

export interface Opdracht {
  klant: { id: number; naam: string; logoUrl: string | null; plaats: string | null };
  jaar: number;
  monsters: OpdrachtMonster[];
  telling: KlantTelling;
  objecten: OpdrachtObject[];
  planning: OpdrachtDag[];
  /** Laatst gewijzigd monster, voor "bijgewerkt op". */
  bijgewerktOp: Date | null;
}

/** De jaren waarin deze klant monsters heeft, nieuwste eerst, met aantallen. */
export async function jarenVanKlant(klantId: number, alleenJaar: number | null = null) {
  const rijen = await prisma.oilSample.groupBy({
    by: ['analysisYear'],
    where: { ...(alleenJaar !== null ? { analysisYear: alleenJaar } : {}), ...(await actiefFilter()), ...monstersVanKlant(klantId) },
    _count: { _all: true },
  });
  return rijen.map((r) => ({ jaar: r.analysisYear, totaal: r._count._all })).sort((a, b) => b.jaar - a.jaar);
}

function redenVan(m: {
  isDisabled: boolean;
  cancelReason: string | null;
  cancelReasonInPdf: boolean;
  isUnreachable: boolean;
  unreachableReason: string | null;
  unreachableNote: string | null;
}): string | null {
  if (m.isDisabled) return m.cancelReasonInPdf && m.cancelReason ? m.cancelReason : null;
  if (m.isUnreachable) return [m.unreachableReason, m.unreachableNote].filter(Boolean).join(': ') || null;
  return null;
}

export async function haalOpdracht(klantId: number, jaar: number, nu = new Date()): Promise<Opdracht | null> {
  const klant = await prisma.klant.findFirst({
    where: { id: klantId, deletedAt: null },
    select: { id: true, naam: true, logoUrl: true, plaats: true },
  });
  if (!klant) return null;

  const ruw = await prisma.oilSample.findMany({
    where: { analysisYear: jaar, ...(await actiefFilter()), ...monstersVanKlant(klantId) },
    orderBy: [{ oNumber: 'asc' }],
    select: {
      id: true,
      oNumber: true,
      description: true,
      location: true,
      oilType: true,
      isTaken: true,
      isDisabled: true,
      isUnreachable: true,
      sampleDate: true,
      cancelReason: true,
      cancelReasonInPdf: true,
      unreachableReason: true,
      unreachableNote: true,
      photoUrl: true,
      partPhotoUrl: true,
      updatedAt: true,
      objectId: true,
      object: { select: { id: true, name: true, objectType: true } },
      installatie: { select: { naam: true } },
    },
  });

  // Komende monsterdagen met objecten van deze klant. Alleen dag en object; de
  // tijden, de route en de notities blijven intern.
  const vandaag = nlDag(nu);
  const plannen = await prisma.samplePlan.findMany({
    where: { analysisYear: jaar, stops: { some: { object: { klantId } } } },
    orderBy: { date: 'asc' },
    select: {
      date: true,
      stops: {
        where: { object: { klantId } },
        orderBy: { orderIndex: 'asc' },
        select: { objectId: true, sampleIds: true, object: { select: { name: true } } },
      },
    },
  });

  const openPerObject = new Map<number, number[]>();
  for (const m of ruw) {
    if (m.isTaken || m.isDisabled || m.objectId === null) continue;
    openPerObject.set(m.objectId, [...(openPerObject.get(m.objectId) ?? []), m.id]);
  }

  // Elk open monster krijgt de eerste komende dag waarop het staat.
  const geplandOp = new Map<number, string>();
  const planning: OpdrachtDag[] = [];
  for (const plan of plannen) {
    const dag = nlDag(plan.date);
    if (dag < vandaag) continue;
    const namen: string[] = [];
    let aantal = 0;
    for (const stop of plan.stops) {
      const open = openPerObject.get(stop.objectId) ?? [];
      const gekozen = leesSampleIds(stop.sampleIds);
      const ids = gekozen ? open.filter((id) => gekozen.includes(id)) : open;
      const nieuw = ids.filter((id) => !geplandOp.has(id));
      for (const id of nieuw) geplandOp.set(id, dag);
      if (ids.length > 0) {
        aantal += ids.length;
        if (!namen.includes(stop.object.name)) namen.push(stop.object.name);
      }
    }
    if (aantal > 0) planning.push({ dag, objecten: namen, aantal });
  }

  const monsters: OpdrachtMonster[] = ruw.map((m) => {
    let status: KlantStatus;
    if (m.isDisabled) status = 'geannuleerd';
    else if (m.isTaken) status = 'genomen';
    else if (geplandOp.has(m.id)) status = 'gepland';
    else if (m.isUnreachable) status = 'niet-bereikbaar';
    else status = 'in-te-plannen';
    const plandag = geplandOp.get(m.id);
    return {
      id: m.id,
      oNumber: m.oNumber,
      description: m.description,
      location: m.location,
      oilType: m.oilType,
      objectId: m.objectId,
      objectNaam: m.object?.name ?? null,
      installatieNaam: m.installatie?.naam ?? null,
      status,
      datum: status === 'genomen' ? m.sampleDate : plandag ? new Date(`${plandag}T12:00:00Z`) : null,
      reden: redenVan(m),
      photoUrl: m.isTaken ? m.photoUrl : null,
      partPhotoUrl: m.isTaken ? m.partPhotoUrl : null,
    };
  });

  const telling = legeTelling();
  const perObject = new Map<string, OpdrachtObject & { laatsteDatum: number }>();
  for (const [i, m] of monsters.entries()) {
    telling[m.status] += 1;
    const bron = ruw[i];
    const sleutel = m.objectId === null ? 'los' : String(m.objectId);
    const o =
      perObject.get(sleutel) ??
      {
        id: m.objectId,
        naam: m.objectNaam ?? 'Zonder object',
        objectType: bron.object?.objectType ?? null,
        telling: legeTelling(),
        volgendBezoek: null,
        laatsteFotoMonster: null,
        laatsteDatum: -Infinity,
      };
    o.telling[m.status] += 1;
    const plandag = geplandOp.get(m.id);
    if (plandag && (!o.volgendBezoek || plandag < o.volgendBezoek)) o.volgendBezoek = plandag;
    const tijd = m.datum?.getTime() ?? -Infinity;
    if ((m.photoUrl || m.partPhotoUrl) && tijd > o.laatsteDatum) {
      o.laatsteDatum = tijd;
      o.laatsteFotoMonster = { id: m.id, photoUrl: m.photoUrl, partPhotoUrl: m.partPhotoUrl };
    }
    perObject.set(sleutel, o);
  }
  const objecten = [...perObject.values()]
    .map(({ laatsteDatum: _weg, ...o }) => o)
    .sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : a.naam.localeCompare(b.naam, 'nl')));

  const bijgewerktOp = ruw.reduce<Date | null>((max, m) => (!max || m.updatedAt > max ? m.updatedAt : max), null);

  return { klant, jaar, monsters, telling, objecten, planning, bijgewerktOp };
}
