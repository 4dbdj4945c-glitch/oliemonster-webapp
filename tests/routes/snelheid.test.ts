// Sneller reageren (oktober 2026): wijzigingen geven het bijgewerkte monster of
// de bijgewerkte planning in het antwoord mee, zodat het scherm niet alles
// opnieuw hoeft op te halen. Wat erin staat, moet precies zijn wat een verse
// GET geeft; anders ziet Roel na een wijziging iets anders dan na verversen.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const blob = vi.hoisted(() => ({
  teller: 0,
  put: vi.fn(async (naam: string) => ({ url: `https://test.public.blob.vercel-storage.com/${naam.replace(/\.jpg$/, '')}-r${++blob.teller}.jpg` })),
  del: vi.fn(async () => {}),
}));
vi.mock('@vercel/blob', () => ({ put: blob.put, del: blob.del }));

import { prisma } from '@/lib/prisma';
import { vulMetNepdata } from '@/prisma/nepdata';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as lijst } from '@/app/api/samples/route';
import { PUT as wijzigMonster } from '@/app/api/samples/[id]/route';
import { PATCH as zetStatus } from '@/app/api/samples/[id]/status/route';
import { POST as nemen } from '@/app/api/samples/[id]/nemen/route';
import { GET as planning, POST as nieuweDag } from '@/app/api/sample-plans/route';
import { GET as dagOphalen, PUT as wijzigDag } from '@/app/api/sample-plans/[id]/route';
import { POST as inplannen } from '@/app/api/sample-plans/[id]/stops/route';
import { DELETE as stopWeg, PATCH as stopWijzig } from '@/app/api/sample-plans/[id]/stops/[stopId]/route';
import { POST as volgorde } from '@/app/api/sample-plans/[id]/volgorde/route';
import { POST as routeBerekenen } from '@/app/api/sample-plans/route-berekenen/route';
import { GET as dossier } from '@/app/api/klanten/[id]/dossier/route';
import { zetStopVolgorde } from '@/lib/samplePlans';
import { haalOliemonsterBegin } from '@/lib/oliemonsterBegin';
import { haalGebruiker } from '@/lib/toegang';
import { GET as instellingen } from '@/app/api/settings/route';
import { GET as objectenKort } from '@/app/api/sample-objects/route';
import { GET as jarenRoute } from '@/app/api/samples/jaren/route';
import { fotoVerzoek, metParams, nepFoto, uitloggen, verzoek } from '../hulp/verzoek';

let ids: Awaited<ReturnType<typeof vulMetNepdata>>;
const json = async (res: Response) => JSON.parse(JSON.stringify(await res.json()));

async function regelUitLijst(id: number) {
  const res = await lijst(verzoek('/api/samples?year=2026'), {});
  const rijen = await json(res);
  return rijen.find((r: { id: number }) => r.id === id);
}

async function verseplanning() {
  return json(await planning(verzoek('/api/sample-plans?year=2026'), {}));
}

/** Een wijziging die de taken en inspecties niet raakt, geeft de planning zonder tePlannen. */
async function verseplanningZonderTaken() {
  const { tePlannen: _t, ...rest } = await verseplanning();
  void _t;
  return rest;
}

beforeEach(async () => {
  process.env.BLOB_READ_WRITE_TOKEN = 'test';
  // OSRM nooit echt aanroepen: een vaste route terug.
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'Ok', routes: [{ geometry: { coordinates: [[5.5, 51.4], [5.6, 51.5]] }, distance: 20000, duration: 1500 }] }))));
  ids = await vulMetNepdata(prisma);
  uitloggen();
  const res = await login(verzoek('/api/auth/login', { body: { username: 'admin', password: 'admin123' } }));
  expect(res.status).toBe(200);
});

describe('een wijziging geeft het monster zoals de lijst het toont', () => {
  it('bewerken', async () => {
    const id = ids.monsters[2026][0];
    const m = await prisma.oilSample.findUniqueOrThrow({ where: { id } });
    const res = await wijzigMonster(
      verzoek(`/api/samples/${id}`, {
        method: 'PUT',
        body: { oNumber: m.oNumber, location: m.location, description: m.description, isTaken: true, sampleDate: '2026-05-04', remarks: 'Nieuw' },
      }),
      metParams({ id: String(id) })
    );
    expect(res.status).toBe(200);
    const terug = await json(res);
    expect(terug.remarks).toBe('Nieuw');
    expect(terug).toEqual(await regelUitLijst(id));
  });

  it('status aantikken, ook als hij niet bereikbaar was', async () => {
    const id = ids.monsters[2026][1];
    await prisma.oilSample.update({ where: { id }, data: { isUnreachable: true, unreachableReason: 'Hek dicht' } });
    const res = await zetStatus(verzoek(`/api/samples/${id}/status`, { method: 'PATCH', body: { isTaken: true, sampleDate: '2026-06-01' } }), metParams({ id: String(id) }));
    expect(res.status).toBe(200);
    const terug = await json(res);
    expect(terug.monster.isTaken).toBe(true);
    expect(terug.monster.isUnreachable).toBe(false);
    expect(terug.monster.unreachableReason).toBeNull();
    expect(terug.monster).toEqual(await regelUitLijst(id));
  });

  it('status terug naar niet genomen houdt de datum van de poging', async () => {
    const id = ids.monsters[2026][2];
    await zetStatus(verzoek(`/api/samples/${id}/status`, { method: 'PATCH', body: { isTaken: true, sampleDate: '2026-03-03' } }), metParams({ id: String(id) }));
    const res = await zetStatus(verzoek(`/api/samples/${id}/status`, { method: 'PATCH', body: { isTaken: false } }), metParams({ id: String(id) }));
    const terug = await json(res);
    expect(terug.monster.isTaken).toBe(false);
    const poging = await prisma.sampleAttempt.findFirstOrThrow({ where: { oilSampleId: id }, orderBy: [{ sampleDate: 'desc' }, { createdAt: 'desc' }] });
    expect(poging.sampleDate?.toISOString().slice(0, 10)).toBe('2026-03-03');
    expect(terug.monster).toEqual(await regelUitLijst(id));
  });

  it("Monster nemen met twee foto's", async () => {
    const id = ids.monsters[2026][3];
    const res = await nemen(
      fotoVerzoek(`/api/samples/${id}/nemen`, { sampleDate: '2026-07-07', oilType: 'Hydrauliek', remarks: 'Helder', photoOnderdeel: nepFoto('a.jpg'), photoPotje: nepFoto('b.jpg') }),
      metParams({ id: String(id) })
    );
    expect(res.status).toBe(200);
    const terug = await json(res);
    expect(terug.monster.isTaken).toBe(true);
    expect(terug.monster.oilType).toBe('Hydrauliek');
    expect(terug.monster.photoUrl).toMatch(/^\/api\/fotos\/monster\//);
    expect(terug.monster).toEqual(await regelUitLijst(id));
    expect(blob.put).toHaveBeenCalledTimes(2);
  });
});

describe('een wijziging aan de planning geeft de planning mee', () => {
  it('het dagscherm krijgt dezelfde dag als de planning, plus het traject', async () => {
    await prisma.samplePlan.update({ where: { id: ids.dagen.vandaag }, data: { routeGeometry: '[[5.5,51.4]]', routeDistance: 1000 } });
    const dag = await json(await dagOphalen(verzoek(`/api/sample-plans/${ids.dagen.vandaag}`), metParams({ id: String(ids.dagen.vandaag) })));
    const uitLijst = (await verseplanning()).dagen.find((d: { id: number }) => d.id === ids.dagen.vandaag);
    expect(dag.routeGeometry).toBe('[[5.5,51.4]]');
    expect(uitLijst.routeGeometry).toBeUndefined();
    expect(uitLijst.routeBerekend).toBe(true);
    const { routeGeometry: _weg, ...rest } = dag;
    void _weg;
    expect(rest).toEqual(uitLijst);
  });

  it('dag toevoegen, inplannen, volgorde, weghalen en vrijgeven', async () => {
    const dag = await nieuweDag(verzoek('/api/sample-plans', { body: { date: '2026-12-14', analysisYear: 2026 } }), {});
    expect(dag.status).toBe(201);
    const d = await json(dag);
    expect(d.planning).toEqual(await verseplanningZonderTaken());

    const vrij = (await verseplanning()).objecten.find((o: { aantalOngepland: number }) => o.aantalOngepland > 0);
    const ingepland = await inplannen(verzoek(`/api/sample-plans/${d.id}/stops`, { body: { objectId: vrij.id } }), metParams({ id: String(d.id) }));
    expect(ingepland.status).toBe(201);
    expect((await json(ingepland)).planning).toEqual(await verseplanningZonderTaken());

    const stops = await prisma.samplePlanStop.findMany({ where: { planId: ids.dagen.vandaag }, orderBy: { orderIndex: 'asc' } });
    const omgekeerd = stops.map((s) => s.id).reverse();
    const v = await volgorde(verzoek(`/api/sample-plans/${ids.dagen.vandaag}/volgorde`, { body: { stopIds: omgekeerd } }), metParams({ id: String(ids.dagen.vandaag) }));
    expect(v.status).toBe(200);
    const na = await json(v);
    expect(na.planning).toEqual(await verseplanningZonderTaken());
    expect(na.planning.dagen.find((x: { id: number }) => x.id === ids.dagen.vandaag).stops.map((s: { id: number }) => s.id)).toEqual(omgekeerd);
    const plan = await prisma.samplePlan.findUniqueOrThrow({ where: { id: ids.dagen.vandaag } });
    expect(plan.manualOrder).toBe(true);
    expect(plan.routeDuration).toBe(1500);

    // Een oliemonsterstop (geen taak) van de dag halen.
    const monsterStop = stops.find((s) => s.taakId === null && s.inspectieId === null)!.id;
    const weg = await stopWeg(verzoek(`/api/sample-plans/${ids.dagen.vandaag}/stops/${monsterStop}`, { method: 'DELETE' }), metParams({ id: String(ids.dagen.vandaag), stopId: String(monsterStop) }));
    expect(weg.status).toBe(200);
    expect((await json(weg)).planning).toEqual(await verseplanningZonderTaken());
    // Doorgenummerd zonder gaten.
    const over = await prisma.samplePlanStop.findMany({ where: { planId: ids.dagen.vandaag }, orderBy: { orderIndex: 'asc' } });
    expect(over.map((s) => s.orderIndex)).toEqual(over.map((_, i) => i));

    const vrijgeven = await wijzigDag(verzoek(`/api/sample-plans/${ids.dagen.vandaag}`, { method: 'PUT', body: { manualOrder: false } }), metParams({ id: String(ids.dagen.vandaag) }));
    expect((await json(vrijgeven)).planning).toEqual(await verseplanning());
  });

  it('een taak inplannen en weghalen geeft ook tePlannen mee', async () => {
    const taak = (await verseplanning()).tePlannen.taken[0];
    expect(taak).toBeTruthy();
    const res = await inplannen(verzoek(`/api/sample-plans/${ids.dagen.overmorgen}/stops`, { body: { taakId: taak.id } }), metParams({ id: String(ids.dagen.overmorgen) }));
    expect(res.status).toBe(201);
    const stop = await json(res);
    expect(stop.planning).toEqual(await verseplanning());
    const weg = await stopWeg(verzoek(`/api/sample-plans/${ids.dagen.overmorgen}/stops/${stop.id}`, { method: 'DELETE' }), metParams({ id: String(ids.dagen.overmorgen), stopId: String(stop.id) }));
    expect((await json(weg)).planning).toEqual(await verseplanning());
  });

  it('een stop starten geeft de dag van het dagscherm terug', async () => {
    const stop = await prisma.samplePlanStop.findFirstOrThrow({ where: { planId: ids.dagen.vandaag } });
    const res = await stopWijzig(
      verzoek(`/api/sample-plans/${ids.dagen.vandaag}/stops/${stop.id}`, { method: 'PATCH', body: { actie: 'start' } }),
      metParams({ id: String(ids.dagen.vandaag), stopId: String(stop.id) })
    );
    const terug = await json(res);
    const dag = await json(await dagOphalen(verzoek(`/api/sample-plans/${ids.dagen.vandaag}`), metParams({ id: String(ids.dagen.vandaag) })));
    expect(terug.dag).toEqual(dag);
    expect(terug.dag.stops.find((s: { id: number }) => s.id === stop.id).startedAt).not.toBeNull();
  });

  it('Route berekenen geeft de planning mee (zonder tePlannen)', async () => {
    const res = await routeBerekenen(verzoek('/api/sample-plans/route-berekenen', { body: { analysisYear: 2026, herverdeel: true } }), {});
    expect(res.status).toBe(200);
    const terug = await json(res);
    const { tePlannen: _t, ...vers } = await verseplanning();
    void _t;
    expect(terug.planning).toEqual(vers);
    expect(terug.dagen).toBe(3);
  });
});

describe('klantdossier in één verzoek', () => {
  it('?jaar=nieuwste is het dossier van het jongste jaar met monsters', async () => {
    const k = String(ids.klanten.mourik);
    const nieuwste = await json(await dossier(verzoek(`/api/klanten/${k}/dossier?jaar=nieuwste`), metParams({ id: k })));
    expect(nieuwste.jaar).toBe(nieuwste.jaren[0].jaar);
    const vast = await json(await dossier(verzoek(`/api/klanten/${k}/dossier?jaar=${nieuwste.jaar}`), metParams({ id: k })));
    expect(nieuwste).toEqual(vast);
  });
  it('zonder monsters: alle jaren', async () => {
    const leeg = await prisma.klant.create({ data: { naam: 'Leeg BV' } });
    const k = String(leeg.id);
    const d = await json(await dossier(verzoek(`/api/klanten/${k}/dossier?jaar=nieuwste`), metParams({ id: k })));
    expect(d.jaar).toBeNull();
    expect(d.momenten).toEqual([]);
  });
});

describe('de oliemonsterpagina krijgt bij het openen hetzelfde als de API geeft', () => {
  it('beheerder', async () => {
    const kolommen = JSON.stringify(['status', 'oNumber', 'location']);
    await prisma.settings.upsert({ where: { key: 'columns' }, update: { value: kolommen }, create: { key: 'columns', value: kolommen } });
    const admin = (await haalGebruiker({ isLoggedIn: true, username: 'admin' }))!;
    const begin = await haalOliemonsterBegin(admin, 2026);
    await prisma.settings.delete({ where: { key: 'columns' } });
    expect(begin.kolommen).toEqual(['status', 'oNumber', 'location']);
    expect(begin.samples).toEqual(await json(await lijst(verzoek('/api/samples?year=2026'), {})));
    expect((await json(await instellingen(verzoek('/api/settings'), {}))).columns).toBeUndefined();
    expect(begin.objecten).toEqual(await json(await objectenKort(verzoek('/api/sample-objects?kort=1'), {})));
    expect(begin.jaren).toEqual((await json(await jarenRoute(verzoek('/api/samples/jaren'), {}))).jaren);
  });

  it('de Mourik-kijker: alleen zijn jaar en klant, geen objecten en geen jaarkeuze', async () => {
    uitloggen();
    await login(verzoek('/api/auth/login', { body: { username: 'kijker', password: 'kijker123' } }));
    const kijker = (await haalGebruiker({ isLoggedIn: true, username: 'kijker' }))!;
    // Ook als hij om een ander jaar vraagt: alleen 2025.
    const begin = await haalOliemonsterBegin(kijker, 2026);
    expect(begin.samples).toEqual(await json(await lijst(verzoek('/api/samples?year=2026'), {})));
    expect(begin.samples.length).toBeGreaterThan(0);
    expect((begin.samples as { analysisYear: number }[]).every((m) => m.analysisYear === 2025)).toBe(true);
    expect(JSON.stringify(begin.samples)).not.toMatch(/cancelledBy|unreachableBy|blob\.vercel/);
    expect(begin.objecten).toBeNull();
    expect(begin.jaren).toBeNull();
  });
});

describe('zetStopVolgorde', () => {
  it('zet volgorde en dag van een reeks stops in één keer', async () => {
    const stops = await prisma.samplePlanStop.findMany({ where: { planId: ids.dagen.vandaag }, orderBy: { orderIndex: 'asc' } });
    await zetStopVolgorde([
      { id: stops[0].id, orderIndex: 5, planId: ids.dagen.overmorgen },
      { id: stops[1].id, orderIndex: 0 },
    ]);
    const [a, b] = await Promise.all(stops.map((s) => prisma.samplePlanStop.findUniqueOrThrow({ where: { id: s.id } })));
    expect([a.planId, a.orderIndex]).toEqual([ids.dagen.overmorgen, 5]);
    expect([b.planId, b.orderIndex]).toEqual([ids.dagen.vandaag, 0]);
    expect(b.updatedAt.getTime()).toBeGreaterThan(stops[1].updatedAt.getTime());
    // updatedAt in UTC, zoals Prisma het zelf schrijft: niet uren ernaast.
    expect(Math.abs(b.updatedAt.getTime() - Date.now())).toBeLessThan(60_000);
  });
});
