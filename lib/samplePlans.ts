import { prisma } from './prisma';
import { PLANNING, geschatteMinuten } from './planningInstellingen';
import { optimizePointRoute, LatLng } from './routePlanner';

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
}

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

/**
 * Alle dagen van een analysejaar met hun stops, monsters en tijden, plus de
 * objecten met wat er nog te doen is. Eén aanroep voor het hele planningsscherm.
 */
export async function haalPlanning(analysisYear: number) {
  const plannen = await prisma.samplePlan.findMany({
    where: { analysisYear },
    orderBy: { date: 'asc' },
    include: {
      stops: {
        orderBy: { orderIndex: 'asc' },
        include: { object: true },
      },
    },
  });

  // Alle monsters van dit jaar die aan een object hangen en niet geannuleerd zijn.
  // Geannuleerde monsters tellen niet mee in de planning en de tijdsberekening.
  const monsters = await prisma.oilSample.findMany({
    where: { analysisYear, objectId: { not: null }, isDisabled: false },
    select: {
      id: true,
      oNumber: true,
      description: true,
      location: true,
      isTaken: true,
      sampleDate: true,
      objectId: true,
    },
    orderBy: { oNumber: 'asc' },
  });

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
    });
    perObject.set(m.objectId, lijst);
  }

  // Welke monsters staan al op een dag? Die hoeven niet nog eens ingepland.
  const geplandeMonsters = new Set<number>();
  for (const plan of plannen) {
    for (const stop of plan.stops) {
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

  const dagen = plannen.map((plan) => {
    const stops = plan.stops.map((stop) => {
      const alle = perObject.get(stop.objectId) ?? [];
      const ids = leesSampleIds(stop.sampleIds);
      const samples = ids ? alle.filter((m) => ids.includes(m.id)) : alle;

      // Werktijd: eigen inschatting voor dit bezoek gaat voor. Anders die van het
      // object, naar rato als je maar een deel van de monsters meeneemt (een
      // object met zestien monsters past nu eenmaal niet altijd op één dag).
      let werkMinuten: number;
      if (stop.plannedMinutes && stop.plannedMinutes > 0) {
        werkMinuten = stop.plannedMinutes;
      } else if (samples.length === 0) {
        // Niets meer te doen op dit object: dan kost het ook geen tijd.
        werkMinuten = 0;
      } else if (stop.object.estimatedMinutes && stop.object.estimatedMinutes > 0) {
        const deel = alle.length > 0 ? samples.length / alle.length : 1;
        werkMinuten = Math.round(stop.object.estimatedMinutes * deel);
      } else {
        werkMinuten = geschatteMinuten(null, samples.length);
      }

      const werkelijkeMinuten =
        stop.startedAt && stop.endedAt
          ? Math.max(0, Math.round((stop.endedAt.getTime() - stop.startedAt.getTime()) / 60000))
          : null;

      return {
        id: stop.id,
        objectId: stop.objectId,
        object: {
          id: stop.object.id,
          name: stop.object.name,
          objectType: stop.object.objectType,
          lat: stop.object.lat,
          lng: stop.object.lng,
          address: stop.object.address,
          estimatedMinutes: stop.object.estimatedMinutes,
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
      routeGeometry: plan.routeGeometry,
      routeDistance: plan.routeDistance,
      routeDuration: plan.routeDuration,
      manualOrder: plan.manualOrder,
      stops,
      werkMinuten: werkMinutenTotaal,
      rijMinuten: rij,
      totaalMinuten: werkMinutenTotaal + rij,
      teVol: werkMinutenTotaal + rij > PLANNING.werkdagMinuten,
    };
  });

  const objecten = await prisma.sampleObject.findMany({ orderBy: { name: 'asc' } });
  const objectenMetWerk = objecten.map((o) => {
    const alle = perObject.get(o.id) ?? [];
    const open = alle.filter((m) => !geplandeMonsters.has(m.id));
    return {
      id: o.id,
      name: o.name,
      objectType: o.objectType,
      region: o.region,
      address: o.address,
      lat: o.lat,
      lng: o.lng,
      estimatedMinutes: o.estimatedMinutes,
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
          ? Math.round(o.estimatedMinutes * (alle.length > 0 ? open.length / alle.length : 1))
          : geschatteMinuten(null, open.length),
    };
  });

  return { dagen, objecten: objectenMetWerk };
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
  object: { id: number; lat: number | null; lng: number | null; estimatedMinutes: number | null };
};

/** Werktijd van één stop, met dezelfde regels als in haalPlanning. */
function werkMinutenVanStop(stop: StopMetObject, alleMonsters: StopMonster[]): number {
  const ids = leesSampleIds(stop.sampleIds);
  const aantal = ids ? alleMonsters.filter((m) => ids.includes(m.id)).length : alleMonsters.length;
  if (stop.plannedMinutes && stop.plannedMinutes > 0) return stop.plannedMinutes;
  if (aantal === 0) return 0;
  if (stop.object.estimatedMinutes && stop.object.estimatedMinutes > 0) {
    const deel = alleMonsters.length > 0 ? aantal / alleMonsters.length : 1;
    return Math.round(stop.object.estimatedMinutes * deel);
  }
  return geschatteMinuten(null, aantal);
}

/**
 * Rekent de route van één dag uit en bewaart traject, afstand en rijtijd.
 * Met `houdVolgordeAan` blijft de bestaande volgorde staan (dat is wat er gebeurt
 * zodra jij zelf gesleept hebt); anders bepaalt de planner de volgorde.
 */
export async function berekenRouteVoorDag(planId: number, houdVolgordeAan: boolean) {
  const stops = await prisma.samplePlanStop.findMany({
    where: { planId },
    orderBy: { orderIndex: 'asc' },
    include: { object: { select: { id: true, lat: true, lng: true } } },
  });

  const metPunt = stops.filter((s) => s.object.lat !== null && s.object.lng !== null);
  const zonderPunt = stops.filter((s) => s.object.lat === null || s.object.lng === null);

  if (metPunt.length === 0) {
    await prisma.samplePlan.update({
      where: { id: planId },
      data: { routeGeometry: null, routeDistance: null, routeDuration: null },
      select: { id: true },
    });
    return { stops: stops.length, followsRoads: false, zonderCoordinaat: zonderPunt.length };
  }

  const punten: LatLng[] = metPunt.map((s) => ({ lat: s.object.lat as number, lng: s.object.lng as number }));
  const vast = houdVolgordeAan ? metPunt.map((_, i) => i) : undefined;
  const route = await optimizePointRoute(punten, PLANNING.thuis, vast);

  if (!houdVolgordeAan) {
    for (let i = 0; i < metPunt.length; i++) {
      await prisma.samplePlanStop.update({
        where: { id: metPunt[i].id },
        data: { orderIndex: route.order[i] },
        select: { id: true },
      });
    }
    // Objecten zonder coordinaat kunnen we niet plaatsen; die gaan achteraan.
    for (let i = 0; i < zonderPunt.length; i++) {
      await prisma.samplePlanStop.update({
        where: { id: zonderPunt[i].id },
        data: { orderIndex: metPunt.length + i },
        select: { id: true },
      });
    }
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

  return { stops: stops.length, followsRoads: route.followsRoads, zonderCoordinaat: zonderPunt.length };
}

/**
 * Volgorde over de hele periode: vanaf Heeze langs alle ingeplande objecten en
 * weer terug. Met `herverdeel` worden de objecten ook opnieuw over de dagen
 * verdeeld, tot een dag vol is (werktijd plus reistijd tegen de werkdaglengte).
 * Dagen die jij met de hand hebt gezet blijven zoals ze zijn; daar wordt alleen
 * de route opnieuw uitgerekend.
 */
export async function berekenPlanning(analysisYear: number, herverdeel: boolean) {
  const plannen = await prisma.samplePlan.findMany({
    where: { analysisYear },
    orderBy: { date: 'asc' },
    include: {
      stops: {
        orderBy: { orderIndex: 'asc' },
        include: { object: { select: { id: true, lat: true, lng: true, estimatedMinutes: true } } },
      },
    },
  });

  if (plannen.length === 0) {
    return { dagen: 0, verplaatst: 0, nietGeplaatst: 0, overDeWerkdag: 0 };
  }

  const monsters = await prisma.oilSample.findMany({
    where: { analysisYear, objectId: { not: null }, isDisabled: false },
    select: { id: true, oNumber: true, description: true, location: true, isTaken: true, sampleDate: true, objectId: true },
  });
  const perObject = new Map<number, StopMonster[]>();
  for (const m of monsters) {
    if (m.objectId === null) continue;
    const lijst = perObject.get(m.objectId) ?? [];
    lijst.push({ id: m.id, oNumber: m.oNumber, description: m.description, location: m.location, isTaken: m.isTaken, sampleDate: m.sampleDate });
    perObject.set(m.objectId, lijst);
  }

  const vrijeDagen = plannen.filter((p) => !p.manualOrder);
  let verplaatst = 0;
  let nietGeplaatst = 0;

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

    // Vullen tot een marge onder de werkdag: de schatting hier is hemelsbreed,
    // de echte route valt hoger uit. Zonder marge komt elke gevulde dag daarna
    // terug als "te vol" en spreekt de knop zichzelf tegen.
    const grens = Math.round(PLANNING.werkdagMinuten * PLANNING.vulMarge);

    let dagIndex = 0;
    let dagStops: StopMetObject[] = [];
    const wegschrijven = async (plan: { id: number }, stops: StopMetObject[]) => {
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        if (stop.planId !== plan.id || stop.orderIndex !== i) verplaatst += 1;
        await prisma.samplePlanStop.update({
          where: { id: stop.id },
          data: { planId: plan.id, orderIndex: i },
          select: { id: true },
        });
      }
    };

    for (let k = 0; k < reeks.length; k++) {
      const stop = reeks[k];
      const kandidaat = [...dagStops, stop];
      const werk = kandidaat.reduce((n, s) => n + werkMinutenVanStop(s, perObject.get(s.objectId) ?? []), 0);
      const punten = kandidaat
        .filter((s) => s.object.lat !== null && s.object.lng !== null)
        .map((s) => ({ lat: s.object.lat as number, lng: s.object.lng as number }));
      const totaal = werk + reisSchattingMinuten(punten);

      if (totaal <= grens || dagStops.length === 0) {
        dagStops = kandidaat;
        continue;
      }
      // Is dit de laatste dag, dan blijft de rest daar staan; anders door naar
      // de volgende dag.
      if (dagIndex + 1 >= vrijeDagen.length) {
        nietGeplaatst = reeks.length - k;
        dagStops = [...dagStops, ...reeks.slice(k)];
        break;
      }
      await wegschrijven(vrijeDagen[dagIndex], dagStops);
      dagIndex += 1;
      dagStops = [stop];
    }
    if (dagStops.length > 0) await wegschrijven(vrijeDagen[dagIndex], dagStops);
  }

  // Route per dag uitrekenen. Zelf gesleept of net herverdeeld: volgorde aanhouden.
  let overDeWerkdag = 0;
  for (const plan of plannen) {
    await berekenRouteVoorDag(plan.id, plan.manualOrder || herverdeel);
  }

  const na = await haalPlanning(analysisYear);
  overDeWerkdag = na.dagen.filter((d) => d.teVol).length;

  return { dagen: plannen.length, verplaatst, nietGeplaatst, overDeWerkdag };
}
