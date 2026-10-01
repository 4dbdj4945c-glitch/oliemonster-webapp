import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { PLANNING, geschatteMinuten } from './planningInstellingen';
import { optimizePointRoute, LatLng } from './routePlanner';
import { actiefFilter } from './verwijderdeMonsters';
import { fotoAdres } from './fotoAdres';
import { taakSoortInfo, taakTitel } from './contracten';
import { inspectieNummer, sjabloonVan } from './inspecties/sjablonen';

/**
 * Serverkant van de planning: de dagen met hun stops ophalen en er meteen de
 * monsters, de werktijd en de rijtijd bij uitrekenen. Alles op één plek, zodat de
 * schermen en de routeberekening met dezelfde getallen werken.
 */

export interface StopMonster {
  id: number;
  oNumber: string;
  description: string;
  location: string;
  isTaken: boolean;
  sampleDate: Date | null;
  /** Voor het dagscherm en Monster nemen: wat er al staat, zodat opslaan niets wist. */
  oilType: string | null;
  remarks: string | null;
  photoUrl: string | null;
  partPhotoUrl: string | null;
  isUnreachable: boolean;
  unreachableReason: string | null;
}

/** De kern van een monster, genoeg voor de tijdsberekening. */
type MonsterKern = Pick<StopMonster, 'id' | 'oNumber' | 'description' | 'location' | 'isTaken' | 'sampleDate'>;

/** Leest de JSON-lijst met monster-ids van een stop. Leeg of stuk = null. */
export function leesSampleIds(waarde: string | null): number[] | null {
  if (!waarde) return null;
  try {
    const lijst = JSON.parse(waarde);
    if (!Array.isArray(lijst)) return null;
    const ids = lijst.map((n) => parseInt(String(n))).filter((n) => !Number.isNaN(n));
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

/**
 * Wat voor stop is dit? Een gewone oliemonsterstop (zoals altijd), een
 * contracttaak of een inspectiebezoek (sinds fase 5). Alleen een
 * oliemonsterstop heeft monsters; de andere twee hebben een eigen tijd en
 * tellen verder precies zo mee in de route en het dagtotaal.
 */
export type StopSoort = 'monsters' | 'taak' | 'inspectie';

export function stopSoort(stop: { taakId?: number | null; inspectieId?: number | null }): StopSoort {
  if (stop.taakId) return 'taak';
  if (stop.inspectieId) return 'inspectie';
  return 'monsters';
}

/** Werktijd van een taak- of inspectiestop: eigen inschatting, anders die van de taak, anders de standaard. */
export function bezoekMinuten(stop: {
  plannedMinutes: number | null;
  taakId?: number | null;
  taak?: { soort: string; geschatteMinuten: number | null } | null;
}): number {
  if (stop.plannedMinutes && stop.plannedMinutes > 0) return stop.plannedMinutes;
  if (stop.taakId && stop.taak) return stop.taak.geschatteMinuten ?? taakSoortInfo(stop.taak.soort).minuten;
  return PLANNING.inspectieMinuten;
}

/** Schrijft een lijst monster-ids weg; leeg betekent "alles wat openstaat". */
export function schrijfSampleIds(waarde: unknown): string | null {
  if (!Array.isArray(waarde)) return null;
  const ids = waarde.map((n) => parseInt(String(n))).filter((n) => !Number.isNaN(n));
  return ids.length > 0 ? JSON.stringify(ids) : null;
}

/** Rijtijd in minuten: die van OSRM, of een schatting uit de afstand. */
export function rijMinuten(duration: number | null, distance: number | null): number {
  if (duration && duration > 0) return Math.round(duration / 60);
  if (distance && distance > 0) {
    return Math.round((distance / 1000 / PLANNING.gemiddeldeSnelheidKmU) * 60);
  }
  return 0;
}

/** Wat een dag van de planning meeneemt aan stops, objecten, taken en inspecties. */
const PLAN_INCLUDE = {
  stops: {
    orderBy: { orderIndex: 'asc' as const },
    include: {
      object: { include: { klant: { select: { naam: true } } } },
      taak: {
        select: {
          id: true,
          soort: true,
          omschrijving: true,
          geschatteMinuten: true,
          intervalMaanden: true,
          volgendeOp: true,
          installatie: { select: { id: true, naam: true } },
          contract: { select: { id: true, naam: true, klant: { select: { id: true, naam: true } } } },
        },
      },
      inspectie: {
        select: { id: true, sjabloon: true, status: true, klant: { select: { id: true, naam: true } } },
      },
    },
  },
} satisfies Prisma.SamplePlanInclude;

type PlanMetStops = Prisma.SamplePlanGetPayload<{ include: typeof PLAN_INCLUDE }>;

/**
 * De monsters per object (niet geannuleerd, niet in de prullenbak) en per
 * object hoeveel monsters er oorspronkelijk bij hoorden. Met `objectIds` alleen
 * die objecten (het dagscherm), anders alle objecten van het jaar. De twee
 * queries gaan tegelijk.
 */
async function monstersPerObject(analysisYear: number, objectIds?: number[]) {
  const objectFilter = objectIds ? { objectId: { in: objectIds } } : { objectId: { not: null } };
  const [monsters, geteld] = await Promise.all([
    // Alle monsters van dit jaar die aan een object hangen en niet geannuleerd zijn.
    // Geannuleerde monsters tellen niet mee in de planning en de tijdsberekening.
    prisma.oilSample.findMany({
      where: { analysisYear, ...objectFilter, isDisabled: false, ...(await actiefFilter()) },
      select: {
        id: true,
        oNumber: true,
        description: true,
        location: true,
        isTaken: true,
        sampleDate: true,
        objectId: true,
        oilType: true,
        remarks: true,
        photoUrl: true,
        partPhotoUrl: true,
        isUnreachable: true,
        unreachableReason: true,
      },
      orderBy: { oNumber: 'asc' },
    }),
    // Hoeveel monsters hoorden er oorspronkelijk bij dit object, inclusief de
    // geannuleerde? Dat is de noemer bij een eigen inschatting op het object:
    // annuleer je drie van de vier monsters, dan hoort de geplande tijd mee te
    // zakken. Zonder deze telling zou de deling altijd 1 opleveren.
    prisma.oilSample.groupBy({
      by: ['objectId'],
      where: { analysisYear, ...objectFilter, ...(await actiefFilter()) },
      _count: { _all: true },
    }),
  ]);

  const noemerPerObject = new Map<number, number>();
  for (const rij of geteld) {
    if (rij.objectId !== null) noemerPerObject.set(rij.objectId, rij._count._all);
  }

  const perObject = new Map<number, StopMonster[]>();
  for (const m of monsters) {
    if (m.objectId === null) continue;
    const lijst = perObject.get(m.objectId) ?? [];
    lijst.push({
      id: m.id,
      oNumber: m.oNumber,
      description: m.description,
      location: m.location,
      isTaken: m.isTaken,
      sampleDate: m.sampleDate,
      oilType: m.oilType,
      remarks: m.remarks,
      // Via de fotoroute, nooit het echte opslagadres (lib/fotoAdres.ts).
      photoUrl: fotoAdres('monster', m.id, 'potje', m.photoUrl),
      partPhotoUrl: fotoAdres('monster', m.id, 'onderdeel', m.partPhotoUrl),
      isUnreachable: m.isUnreachable,
      unreachableReason: m.unreachableReason,
    });
    perObject.set(m.objectId, lijst);
  }
  return { perObject, noemerPerObject };
}

/**
 * Eén dag met zijn stops, monsters en tijden. `metRoute`: ook het bewaarde
 * traject (routeGeometry, groot) voor de kaart van het dagscherm; de lijsten
 * krijgen alleen `routeBerekend`.
 */
function bouwDag(
  plan: PlanMetStops,
  perObject: Map<number, StopMonster[]>,
  noemerPerObject: Map<number, number>,
  metRoute: boolean
) {
  const stops = plan.stops.map((stop) => {
    const soort = stopSoort(stop);
    const alle = soort === 'monsters' ? perObject.get(stop.objectId) ?? [] : [];
    const ids = leesSampleIds(stop.sampleIds);
    const samples = ids ? alle.filter((m) => ids.includes(m.id)) : alle;

    // Werktijd: eigen inschatting voor dit bezoek gaat voor. Anders die van het
    // object, naar rato als je maar een deel van de monsters meeneemt (een
    // object met zestien monsters past nu eenmaal niet altijd op één dag).
    // Een taak of inspectie heeft een eigen tijd (bezoekMinuten).
    let werkMinuten: number;
    if (soort !== 'monsters') {
      werkMinuten = bezoekMinuten(stop);
    } else if (stop.plannedMinutes && stop.plannedMinutes > 0) {
      werkMinuten = stop.plannedMinutes;
    } else if (samples.length === 0) {
      // Niets meer te doen op dit object: dan kost het ook geen tijd.
      werkMinuten = 0;
    } else if (stop.object.estimatedMinutes && stop.object.estimatedMinutes > 0) {
      const noemer = noemerPerObject.get(stop.objectId) ?? alle.length;
      const deel = noemer > 0 ? samples.length / noemer : 1;
      werkMinuten = Math.round(stop.object.estimatedMinutes * deel);
    } else {
      werkMinuten = geschatteMinuten(null, samples.length);
    }

    const werkelijkeMinuten =
      stop.startedAt && stop.endedAt
        ? Math.max(0, Math.round((stop.endedAt.getTime() - stop.startedAt.getTime()) / 60000))
        : null;

    const taak = stop.taak
      ? {
          id: stop.taak.id,
          soort: stop.taak.soort,
          soortLabel: taakSoortInfo(stop.taak.soort).label,
          titel: taakTitel(stop.taak),
          intervalMaanden: stop.taak.intervalMaanden,
          installatie: stop.taak.installatie,
          contract: { id: stop.taak.contract.id, naam: stop.taak.contract.naam },
          klant: stop.taak.contract.klant,
        }
      : null;
    const inspectie = stop.inspectie
      ? {
          id: stop.inspectie.id,
          nummer: inspectieNummer(stop.inspectie.id),
          sjabloon: stop.inspectie.sjabloon,
          naam: sjabloonVan(stop.inspectie.sjabloon).naam,
          status: stop.inspectie.status,
          klant: stop.inspectie.klant,
        }
      : null;

    return {
      id: stop.id,
      soort,
      taak,
      inspectie,
      objectId: stop.objectId,
      object: {
        id: stop.object.id,
        name: stop.object.name,
        objectType: stop.object.objectType,
        lat: stop.object.lat,
        lng: stop.object.lng,
        address: stop.object.address,
        estimatedMinutes: stop.object.estimatedMinutes,
        klantId: stop.object.klantId,
        klantNaam: stop.object.klant?.naam ?? null,
      },
      sampleIds: ids,
      orderIndex: stop.orderIndex,
      plannedMinutes: stop.plannedMinutes,
      isDone: stop.isDone,
      doneAt: stop.doneAt,
      startedAt: stop.startedAt,
      endedAt: stop.endedAt,
      samples,
      aantalMonsters: samples.length,
      aantalGenomen: samples.filter((m) => m.isTaken).length,
      werkMinuten,
      werkelijkeMinuten,
    };
  });

  const werkMinutenTotaal = stops.reduce((n, s) => n + s.werkMinuten, 0);
  const rij = rijMinuten(plan.routeDuration, plan.routeDistance);

  return {
    id: plan.id,
    date: plan.date,
    analysisYear: plan.analysisYear,
    notes: plan.notes,
    ...(metRoute ? { routeGeometry: plan.routeGeometry } : {}),
    routeBerekend: plan.routeGeometry !== null,
    routeDistance: plan.routeDistance,
    routeDuration: plan.routeDuration,
    manualOrder: plan.manualOrder,
    stops,
    werkMinuten: werkMinutenTotaal,
    rijMinuten: rij,
    totaalMinuten: werkMinutenTotaal + rij,
    teVol: werkMinutenTotaal + rij > PLANNING.werkdagMinuten,
  };
}

/**
 * Alle dagen van een analysejaar met hun stops, monsters en tijden, plus de
 * objecten met wat er nog te doen is. Eén aanroep voor het hele planningsscherm.
 * De queries gaan tegelijk; het routetraject zit er niet in (dat is groot en
 * alleen het dagscherm tekent het, zie haalPlanDag).
 */
export async function haalPlanning(analysisYear: number) {
  const [plannen, { perObject, noemerPerObject }, objecten] = await Promise.all([
    prisma.samplePlan.findMany({ where: { analysisYear }, orderBy: { date: 'asc' }, include: PLAN_INCLUDE }),
    monstersPerObject(analysisYear),
    prisma.sampleObject.findMany({ orderBy: { name: 'asc' }, include: { klant: { select: { naam: true } } } }),
  ]);

  // Welke monsters staan al op een dag? Die hoeven niet nog eens ingepland.
  const geplandeMonsters = new Set<number>();
  for (const plan of plannen) {
    for (const stop of plan.stops) {
      // Een taak of inspectie op dit object plant geen monsters in.
      if (stopSoort(stop) !== 'monsters') continue;
      const vanObject = perObject.get(stop.objectId) ?? [];
      const ids = leesSampleIds(stop.sampleIds);
      // Alleen monsters die nu echt bij dit object horen. Is een monster
      // intussen naar een ander object verhuisd, dan blijft het oude id in de
      // stop staan; zonder deze controle zou dat monster nergens meer als
      // "nog in te plannen" opduiken en stil wegvallen.
      if (ids) vanObject.filter((m) => ids.includes(m.id)).forEach((m) => geplandeMonsters.add(m.id));
      else vanObject.forEach((m) => geplandeMonsters.add(m.id));
    }
  }

  const dagen = plannen.map((plan) => bouwDag(plan, perObject, noemerPerObject, false));

  const objectenMetWerk = objecten.map((o) => {
    const alle = perObject.get(o.id) ?? [];
    const open = alle.filter((m) => !geplandeMonsters.has(m.id));
    const noemer = noemerPerObject.get(o.id) ?? alle.length;
    return {
      id: o.id,
      name: o.name,
      objectType: o.objectType,
      region: o.region,
      address: o.address,
      lat: o.lat,
      lng: o.lng,
      estimatedMinutes: o.estimatedMinutes,
      // Voor de voortgang per opdracht op Vandaag
      klantNaam: o.klant?.naam ?? null,
      aantalMonsters: alle.length,
      aantalGenomen: alle.filter((m) => m.isTaken).length,
      aantalOngepland: open.length,
      ongeplandeMonsters: open,
      // Tijd voor wat er nog open staat, met dezelfde regels als een stop:
      // een eigen inschatting op het object telt naar rato mee.
      werkMinuten:
        open.length === 0
          ? 0
          : o.estimatedMinutes && o.estimatedMinutes > 0
          ? Math.round(o.estimatedMinutes * (noemer > 0 ? open.length / noemer : 1))
          : geschatteMinuten(null, open.length),
    };
  });

  return { dagen, objecten: objectenMetWerk };
}

/**
 * Eén dag voor het dagscherm, met het routetraject. Dezelfde getallen als
 * haalPlanning (zelfde bouwDag), maar alleen de monsters van de objecten op
 * deze dag. null als de dag niet bestaat.
 */
export async function haalPlanDag(planId: number) {
  const plan = await prisma.samplePlan.findUnique({ where: { id: planId }, include: PLAN_INCLUDE });
  if (!plan) return null;
  const objectIds = [...new Set(plan.stops.map((s) => s.objectId))];
  const { perObject, noemerPerObject } =
    objectIds.length > 0
      ? await monstersPerObject(plan.analysisYear, objectIds)
      : { perObject: new Map<number, StopMonster[]>(), noemerPerObject: new Map<number, number>() };
  return bouwDag(plan, perObject, noemerPerObject, true);
}

/* ============================================================
   Volgorde en route uitrekenen
   ============================================================ */

function afstandMeter(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Ruwe reistijdschatting (minuten) voor een dag, zonder OSRM: hemelsbreed plus omrijfactor. */
function reisSchattingMinuten(punten: LatLng[]): number {
  if (punten.length === 0) return 0;
  const reeks = [PLANNING.thuis, ...punten, PLANNING.thuis];
  let meters = 0;
  for (let i = 1; i < reeks.length; i++) meters += afstandMeter(reeks[i - 1], reeks[i]);
  const km = (meters / 1000) * 1.3; // wegen lopen niet hemelsbreed
  return Math.round((km / PLANNING.gemiddeldeSnelheidKmU) * 60);
}

type StopMetObject = {
  id: number;
  planId: number;
  objectId: number;
  orderIndex: number;
  plannedMinutes: number | null;
  sampleIds: string | null;
  taakId: number | null;
  inspectieId: number | null;
  taak: { soort: string; geschatteMinuten: number | null } | null;
  object: { id: number; lat: number | null; lng: number | null; estimatedMinutes: number | null };
};

/** Werktijd van één stop, met dezelfde regels als in haalPlanning. */
function werkMinutenVanStop(
  stop: StopMetObject,
  alleMonsters: MonsterKern[],
  noemer?: number
): number {
  if (stopSoort(stop) !== 'monsters') return bezoekMinuten(stop);
  const ids = leesSampleIds(stop.sampleIds);
  const aantal = ids ? alleMonsters.filter((m) => ids.includes(m.id)).length : alleMonsters.length;
  if (stop.plannedMinutes && stop.plannedMinutes > 0) return stop.plannedMinutes;
  if (aantal === 0) return 0;
  if (stop.object.estimatedMinutes && stop.object.estimatedMinutes > 0) {
    // Zelfde noemer als in haalPlanning: alle monsters die er ooit bij hoorden,
    // inclusief de geannuleerde.
    const deler = noemer && noemer > 0 ? noemer : alleMonsters.length;
    const deel = deler > 0 ? aantal / deler : 1;
    return Math.round(stop.object.estimatedMinutes * deel);
  }
  return geschatteMinuten(null, aantal);
}

/**
 * Rekent de route van één dag uit en bewaart traject, afstand en rijtijd.
 * Met `houdVolgordeAan` blijft de bestaande volgorde staan (dat is wat er gebeurt
 * zodra jij zelf gesleept hebt); anders bepaalt de planner de volgorde.
 */
type RouteStop = { id: number; object: { lat: number | null; lng: number | null } };

/** De stops van een dag in volgorde, met de plek van het object: wat de route nodig heeft. */
function routeStopsVan(where: Prisma.SamplePlanStopWhereInput) {
  return prisma.samplePlanStop.findMany({
    where,
    orderBy: { orderIndex: 'asc' },
    select: { id: true, planId: true, object: { select: { lat: true, lng: true } } },
  });
}

/**
 * Zet de volgorde (en met `planId` ook de dag) van een reeks stops in één
 * query, in plaats van één update per stop.
 */
export async function zetStopVolgorde(rijen: { id: number; orderIndex: number; planId?: number }[]) {
  if (rijen.length === 0) return;
  const waarden = Prisma.join(
    rijen.map((r) => Prisma.sql`(${r.id}::int, ${r.orderIndex}::int, ${r.planId ?? null}::int)`)
  );
  await prisma.$executeRaw`
    UPDATE "SamplePlanStop" AS s
    SET "orderIndex" = v.idx, "planId" = COALESCE(v.plan, s."planId"), "updatedAt" = (now() AT TIME ZONE 'UTC')
    FROM (VALUES ${waarden}) AS v(id, idx, plan)
    WHERE s.id = v.id`;
}

export async function berekenRouteVoorDag(planId: number, houdVolgordeAan: boolean, bekendeStops?: RouteStop[]) {
  // De stops mogen meekomen (berekenPlanning heeft ze al); anders zelf ophalen.
  const stops = bekendeStops ?? (await routeStopsVan({ planId }));

  const metPunt = stops.filter((s) => s.object.lat !== null && s.object.lng !== null);
  const zonderPunt = stops.filter((s) => s.object.lat === null || s.object.lng === null);

  if (metPunt.length === 0) {
    await prisma.samplePlan.update({
      where: { id: planId },
      data: { routeGeometry: null, routeDistance: null, routeDuration: null },
      select: { id: true },
    });
    return { stops: stops.length, metPunt: 0, followsRoads: false, zonderCoordinaat: zonderPunt.length };
  }

  const punten: LatLng[] = metPunt.map((s) => ({ lat: s.object.lat as number, lng: s.object.lng as number }));
  const vast = houdVolgordeAan ? metPunt.map((_, i) => i) : undefined;
  const route = await optimizePointRoute(punten, PLANNING.thuis, vast);

  if (!houdVolgordeAan) {
    // Objecten zonder coordinaat kunnen we niet plaatsen; die gaan achteraan.
    await zetStopVolgorde([
      ...metPunt.map((stop, i) => ({ id: stop.id, orderIndex: route.order[i] })),
      ...zonderPunt.map((stop, i) => ({ id: stop.id, orderIndex: metPunt.length + i })),
    ]);
  }

  await prisma.samplePlan.update({
    where: { id: planId },
    data: {
      routeGeometry: JSON.stringify(route.geometry),
      routeDistance: route.distance,
      routeDuration: route.duration,
    },
    select: { id: true },
  });

  return {
    stops: stops.length,
    metPunt: metPunt.length,
    followsRoads: route.followsRoads,
    zonderCoordinaat: zonderPunt.length,
  };
}

/**
 * Volgorde over de hele periode: vanaf Heeze langs alle ingeplande objecten en
 * weer terug. Met `herverdeel` worden de objecten ook opnieuw over de dagen
 * verdeeld, tot een dag vol is (werktijd plus reistijd tegen de werkdaglengte).
 * Dagen die jij met de hand hebt gezet blijven zoals ze zijn; daar wordt alleen
 * de route opnieuw uitgerekend.
 */
export async function berekenPlanning(analysisYear: number, herverdeel: boolean) {
  let plannen = await prisma.samplePlan.findMany({
    where: { analysisYear },
    orderBy: { date: 'asc' },
    include: {
      stops: {
        orderBy: { orderIndex: 'asc' },
        include: {
          object: { select: { id: true, lat: true, lng: true, estimatedMinutes: true } },
          taak: { select: { soort: true, geschatteMinuten: true } },
        },
      },
    },
  });

  if (plannen.length === 0) {
    return { dagen: 0, verplaatst: 0, nietGeplaatst: 0, gebleven: 0, opgeruimd: 0, overDeWerkdag: 0, dagenHemelsbreed: 0, zonderCoordinaat: 0 };
  }

  const monsters = await prisma.oilSample.findMany({
    where: { analysisYear, objectId: { not: null }, isDisabled: false, ...(await actiefFilter()) },
    select: { id: true, oNumber: true, description: true, location: true, isTaken: true, sampleDate: true, objectId: true },
  });

  // Hoeveel monsters hoorden er oorspronkelijk bij dit object, inclusief de
  // geannuleerde? Dat is de noemer bij een eigen inschatting op het object:
  // annuleer je drie van de vier monsters, dan hoort de geplande tijd mee te
  // zakken. Zonder deze telling zou de deling altijd 1 opleveren.
  const geteld = await prisma.oilSample.groupBy({
    by: ['objectId'],
    where: { analysisYear, objectId: { not: null }, ...(await actiefFilter()) },
    _count: { _all: true },
  });
  const noemerPerObject = new Map<number, number>();
  for (const rij of geteld) {
    if (rij.objectId !== null) noemerPerObject.set(rij.objectId, rij._count._all);
  }

  const perObject = new Map<number, MonsterKern[]>();
  for (const m of monsters) {
    if (m.objectId === null) continue;
    const lijst = perObject.get(m.objectId) ?? [];
    lijst.push({ id: m.id, oNumber: m.oNumber, description: m.description, location: m.location, isTaken: m.isTaken, sampleDate: m.sampleDate });
    perObject.set(m.objectId, lijst);
  }

  // Een object waar niets meer te doen is, bijvoorbeeld omdat alle monsters
  // geannuleerd zijn, hoort niet op een dag te blijven staan: het telt mee in de
  // rijroute terwijl je er niet heen hoeft. Weghalen doen we alleen bij een stop
  // die nog niet gestart of afgevinkt is, anders gooien we geschiedenis weg.
  const opruimen: number[] = [];
  for (const plan of plannen) {
    for (const stop of plan.stops) {
      if (stop.isDone || stop.startedAt || stop.endedAt) continue;
      // Een taak of inspectie heeft geen monsters en blijft dus altijd staan.
      if (stopSoort(stop) !== 'monsters') continue;
      const alle = perObject.get(stop.objectId) ?? [];
      const ids = leesSampleIds(stop.sampleIds);
      const aantal = ids ? alle.filter((m) => ids.includes(m.id)).length : alle.length;
      if (aantal > 0) continue;
      opruimen.push(stop.id);
    }
  }
  const opgeruimd = opruimen.length;
  if (opgeruimd > 0) {
    await prisma.samplePlanStop.deleteMany({ where: { id: { in: opruimen } } });
    plannen = await prisma.samplePlan.findMany({
      where: { analysisYear },
      orderBy: { date: 'asc' },
      include: {
        stops: {
          orderBy: { orderIndex: 'asc' },
          include: {
          object: { select: { id: true, lat: true, lng: true, estimatedMinutes: true } },
          taak: { select: { soort: true, geschatteMinuten: true } },
        },
        },
      },
    });
  }

  const vrijeDagen = plannen.filter((p) => !p.manualOrder);
  let verplaatst = 0;
  let nietGeplaatst = 0;
  // Objecten die nergens meer bij konden en op hun oude dag blijven staan.
  let gebleven = 0;

  if (herverdeel && vrijeDagen.length > 0) {
    // Alle stops van de vrije dagen op een hoop, in de beste rijvolgorde vanaf Heeze.
    const losseStops = vrijeDagen.flatMap((p) => p.stops) as unknown as StopMetObject[];
    const metPunt = losseStops.filter((s) => s.object.lat !== null && s.object.lng !== null);
    const zonderPunt = losseStops.filter((s) => s.object.lat === null || s.object.lng === null);

    let reeks: StopMetObject[] = metPunt;
    if (metPunt.length > 1) {
      const punten: LatLng[] = metPunt.map((s) => ({ lat: s.object.lat as number, lng: s.object.lng as number }));
      // Alleen de volgorde is hier nodig, de route per dag komt zo.
      const route = await optimizePointRoute(punten, PLANNING.thuis);
      reeks = metPunt.map((stop, i) => ({ stop, pos: route.order[i] }))
        .sort((a, b) => a.pos - b.pos)
        .map((r) => r.stop);
    }
    reeks = [...reeks, ...zonderPunt];

    // Plek in de rijvolgorde van alle stops, ook die blijven staan: die bepaalt
    // straks de volgorde binnen hun eigen dag.
    const positie = new Map<number, number>();
    reeks.forEach((stop, i) => positie.set(stop.id, i));

    // Heb jij zelf gekozen welke monsters op welke dag horen (een gesplitst
    // object), dan verhuist die stop niet: anders zet een klik op de knop je
    // splitsing ongemerkt terug op één dag. Ze tellen wel mee in de capaciteit
    // van hun eigen dag.
    // Een taak of inspectie staat op de dag die jij koos (afgesproken met de
    // klant) en verhuist dus ook niet; hij telt wel mee in de capaciteit.
    const staatVast = (stop: StopMetObject) => stop.sampleIds !== null || stopSoort(stop) !== 'monsters';
    const vastgezet = new Map<number, StopMetObject[]>();
    for (const stop of losseStops) {
      if (!staatVast(stop)) continue;
      const lijst = vastgezet.get(stop.planId) ?? [];
      lijst.push(stop);
      vastgezet.set(stop.planId, lijst);
    }
    const teVerdelen = reeks.filter((s) => !staatVast(s));

    // Vullen tot een marge onder de werkdag: de schatting hier is hemelsbreed,
    // de echte route valt hoger uit. Zonder marge komt elke gevulde dag daarna
    // terug als "te vol" en spreekt de knop zichzelf tegen.
    const grens = Math.round(PLANNING.werkdagMinuten * PLANNING.vulMarge);

    const wegschrijven = async (plan: { id: number }, stops: StopMetObject[]) => {
      // Binnen de dag in rijvolgorde, zodat een vastgezette stop niet altijd
      // vooraan belandt.
      const geordend = [...stops].sort((a, b) => (positie.get(a.id) ?? 0) - (positie.get(b.id) ?? 0));
      for (let i = 0; i < geordend.length; i++) {
        const stop = geordend[i];
        if (stop.planId !== plan.id || stop.orderIndex !== i) verplaatst += 1;
      }
      // Een vastgezette stop krijgt alleen zijn plek in de rij; verhuizen doet hij niet.
      await zetStopVolgorde(
        geordend.map((stop, i) => (staatVast(stop) ? { id: stop.id, orderIndex: i } : { id: stop.id, orderIndex: i, planId: plan.id }))
      );
    };

    // Werktijd plus één rit vanaf Heeze langs alle punten van die dag en terug.
    const dagMinuten = (stops: StopMetObject[]) => {
      const werk = stops.reduce((n, s) => n + werkMinutenVanStop(s, perObject.get(s.objectId) ?? [], noemerPerObject.get(s.objectId)), 0);
      const punten = stops
        .filter((s) => s.object.lat !== null && s.object.lng !== null)
        .map((s) => ({ lat: s.object.lat as number, lng: s.object.lng as number }));
      return werk + reisSchattingMinuten(punten);
    };

    // Past deze stop op deze dag? Eén object hoort niet twee keer op dezelfde
    // dag: dan zet je er twee keer je spullen voor klaar en klopt de telling niet.
    // Alleen oliemonsterstops tellen hierbij: een taak op hetzelfde object mag
    // op dezelfde dag staan (dat is juist handig).
    const zelfdeObject = (stops: StopMetObject[], stop: StopMetObject) =>
      stops.some((s) => s.objectId === stop.objectId && stopSoort(s) === 'monsters');
    const past = (stops: StopMetObject[], stop: StopMetObject) => {
      if (zelfdeObject(stops, stop)) return false;
      if (stops.length === 0) return true;
      return dagMinuten([...stops, stop]) <= grens;
    };

    let dagIndex = 0;
    let dagStops: StopMetObject[] = [...(vastgezet.get(vrijeDagen[0].id) ?? [])];
    // Stops die hier niet kunnen omdat hetzelfde object al op deze dag staat.
    // De dag is dan niet vol, dus we sluiten hem niet af: dat zou de rijvolgorde
    // uit elkaar trekken en je een eind laten omrijden. Ze krijgen op de
    // volgende dag een nieuwe kans.
    let wachtrij: StopMetObject[] = [];
    let blijvenStaan = 0;

    const wachtrijProberen = () => {
      const over: StopMetObject[] = [];
      for (const w of wachtrij) {
        if (past(dagStops, w)) dagStops = [...dagStops, w];
        else over.push(w);
      }
      wachtrij = over;
    };

    for (let k = 0; k < teVerdelen.length; k++) {
      const stop = teVerdelen[k];
      if (past(dagStops, stop)) {
        dagStops = [...dagStops, stop];
        continue;
      }

      // Zelfde object op deze dag: doorschuiven, maar de dag gewoon verder vullen.
      if (zelfdeObject(dagStops, stop)) {
        wachtrij.push(stop);
        continue;
      }

      // De dag is vol. Geen dag meer over: wat er nog kan gaat op de laatste dag,
      // de rest blijft staan waar hij stond.
      if (dagIndex + 1 >= vrijeDagen.length) {
        const rest = [...wachtrij, ...teVerdelen.slice(k)];
        wachtrij = [];
        for (const r of rest) {
          if (zelfdeObject(dagStops, r)) blijvenStaan += 1;
          else dagStops = [...dagStops, r];
        }
        nietGeplaatst = rest.length - blijvenStaan;
        break;
      }

      await wegschrijven(vrijeDagen[dagIndex], dagStops);
      dagIndex += 1;
      dagStops = [...(vastgezet.get(vrijeDagen[dagIndex].id) ?? [])];
      wachtrijProberen();
      if (past(dagStops, stop)) dagStops = [...dagStops, stop];
      else wachtrij.push(stop);
    }

    // Wat er na de laatste stop nog wacht: nog één keer proberen op de dag waar
    // we zijn, anders blijft het staan waar het stond.
    for (const w of wachtrij) {
      if (past(dagStops, w)) dagStops = [...dagStops, w];
      else blijvenStaan += 1;
    }

    if (dagStops.length > 0) await wegschrijven(vrijeDagen[dagIndex], dagStops);

    // Dagen na de laatst gevulde dag zijn niet langsgekomen. Hun vastgezette
    // stops blijven staan waar ze staan, maar worden wel doorgenummerd.
    for (let i = dagIndex + 1; i < vrijeDagen.length; i++) {
      const vast = vastgezet.get(vrijeDagen[i].id) ?? [];
      if (vast.length > 0) await wegschrijven(vrijeDagen[i], vast);
    }
    gebleven = blijvenStaan;
  }

  // Route per dag uitrekenen. Zelf gesleept of net herverdeeld: volgorde aanhouden.
  let dagenHemelsbreed = 0;
  let zonderCoordinaat = 0;
  // De stops van alle dagen in één keer, na het verdelen.
  const stopsPerDag = new Map<number, RouteStop[]>();
  for (const stop of await routeStopsVan({ plan: { analysisYear } })) {
    stopsPerDag.set(stop.planId, [...(stopsPerDag.get(stop.planId) ?? []), stop]);
  }
  for (const plan of plannen) {
    const uitkomst = await berekenRouteVoorDag(plan.id, plan.manualOrder || herverdeel, stopsPerDag.get(plan.id) ?? []);
    // Alleen tellen als er iets te routeren viel: een dag zonder object op de
    // kaart is geen storing van de routedienst.
    if (uitkomst.metPunt > 0 && !uitkomst.followsRoads) dagenHemelsbreed += 1;
    zonderCoordinaat += uitkomst.zonderCoordinaat;
  }

  const na = await haalPlanning(analysisYear);
  const overDeWerkdag = na.dagen.filter((d) => d.teVol).length;

  return {
    dagen: plannen.length,
    verplaatst,
    nietGeplaatst,
    gebleven,
    opgeruimd,
    overDeWerkdag,
    // Zonder deze twee zie je niet dat er hemelsbreed gerekend is of dat een
    // object buiten de route valt.
    dagenHemelsbreed,
    zonderCoordinaat,
    // De planning zoals hij nu is: het scherm hoeft hem niet nog eens op te halen.
    planning: na,
  };
}
