import { prisma } from './prisma';
import { PLANNING, geschatteMinuten } from './planningInstellingen';
import { optimizePointRoute, LatLng } from './routePlanner';
import { actiefFilter } from './verwijderdeMonsters';

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
    where: { analysisYear, objectId: { not: null }, isDisabled: false, ...(await actiefFilter()) },
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
function werkMinutenVanStop(
  stop: StopMetObject,
  alleMonsters: StopMonster[],
  noemer?: number
): number {
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
    return { stops: stops.length, metPunt: 0, followsRoads: false, zonderCoordinaat: zonderPunt.length };
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
        include: { object: { select: { id: true, lat: true, lng: true, estimatedMinutes: true } } },
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

  const perObject = new Map<number, StopMonster[]>();
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
  let opgeruimd = 0;
  for (const plan of plannen) {
    for (const stop of plan.stops) {
      if (stop.isDone || stop.startedAt || stop.endedAt) continue;
      const alle = perObject.get(stop.objectId) ?? [];
      const ids = leesSampleIds(stop.sampleIds);
      const aantal = ids ? alle.filter((m) => ids.includes(m.id)).length : alle.length;
      if (aantal > 0) continue;
      await prisma.samplePlanStop.delete({ where: { id: stop.id } });
      opgeruimd += 1;
    }
  }
  if (opgeruimd > 0) {
    plannen = await prisma.samplePlan.findMany({
      where: { analysisYear },
      orderBy: { date: 'asc' },
      include: {
        stops: {
          orderBy: { orderIndex: 'asc' },
          include: { object: { select: { id: true, lat: true, lng: true, estimatedMinutes: true } } },
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
    const vastgezet = new Map<number, StopMetObject[]>();
    for (const stop of losseStops) {
      if (stop.sampleIds === null) continue;
      const lijst = vastgezet.get(stop.planId) ?? [];
      lijst.push(stop);
      vastgezet.set(stop.planId, lijst);
    }
    const teVerdelen = reeks.filter((s) => s.sampleIds === null);

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
        await prisma.samplePlanStop.update({
          where: { id: stop.id },
          // Een vastgezette stop krijgt alleen zijn plek in de rij; verhuizen doet hij niet.
          data: stop.sampleIds !== null ? { orderIndex: i } : { planId: plan.id, orderIndex: i },
          select: { id: true },
        });
      }
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
    const past = (stops: StopMetObject[], stop: StopMetObject) => {
      if (stops.some((s) => s.objectId === stop.objectId)) return false;
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
      if (dagStops.some((s) => s.objectId === stop.objectId)) {
        wachtrij.push(stop);
        continue;
      }

      // De dag is vol. Geen dag meer over: wat er nog kan gaat op de laatste dag,
      // de rest blijft staan waar hij stond.
      if (dagIndex + 1 >= vrijeDagen.length) {
        const rest = [...wachtrij, ...teVerdelen.slice(k)];
        wachtrij = [];
        for (const r of rest) {
          if (dagStops.some((s) => s.objectId === r.objectId)) blijvenStaan += 1;
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
  for (const plan of plannen) {
    const uitkomst = await berekenRouteVoorDag(plan.id, plan.manualOrder || herverdeel);
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
  };
}
