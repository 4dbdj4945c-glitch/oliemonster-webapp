// Contracten met terugkerende taken via de API: aanmaken, de volgende datum die
// vanzelf doorschuift (inspectie afgerond, stop afgevinkt, met de hand), niets
// dubbel, en de afscherming (kijkers zien geen contracten; het klantportaal
// toont alleen de eigen komende momenten zonder interne notities).
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { vulMetNepdata } from '@/prisma/nepdata';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as contracten, POST as nieuwContract } from '@/app/api/contracten/route';
import { GET as contract, DELETE as wegContract } from '@/app/api/contracten/[id]/route';
import { POST as herstelContract } from '@/app/api/contracten/[id]/herstellen/route';
import { POST as nieuweTaak } from '@/app/api/contracten/[id]/taken/route';
import { GET as taken } from '@/app/api/contract-taken/route';
import { PUT as wijzigTaak } from '@/app/api/contract-taken/[id]/route';
import { POST as uitgevoerd, DELETE as nietUitgevoerd } from '@/app/api/contract-taken/[id]/uitgevoerd/route';
import { PUT as wijzigInspectie } from '@/app/api/inspecties/[id]/route';
import { PATCH as wijzigStop } from '@/app/api/sample-plans/[id]/stops/[stopId]/route';
import { GET as planning } from '@/app/api/sample-plans/route';
import { GET as portaal } from '@/app/api/portaal/route';
import { plusDagen, plusMaandenVast, vandaagNl } from '@/lib/contracten';
import { nlDag } from '@/lib/klantOpdracht';
import { metParams, uitloggen, verzoek } from '../hulp/verzoek';

let ids: Awaited<ReturnType<typeof vulMetNepdata>>;

async function inloggenAls(username: string, password: string) {
  uitloggen();
  const res = await login(verzoek('/api/auth/login', { body: { username, password } }));
  expect(res.status).toBe(200);
}
const admin = () => inloggenAls('admin', 'admin123');
const p = (id: number) => metParams({ id: String(id) });
const volgende = async (taakId: number) => nlDag((await prisma.contractTaak.findUniqueOrThrow({ where: { id: taakId } })).volgendeOp);

beforeEach(async () => {
  ids = await vulMetNepdata(prisma);
});

describe('contracten en taken (admin)', () => {
  it('contract met een taak aanmaken; object moet bij de klant horen', async () => {
    await admin();
    const res = await nieuwContract(verzoek('/api/contracten', { body: { klantId: ids.klanten.tweede, naam: 'Nieuw contract', startOp: '2026-10-01' } }), undefined);
    expect(res.status).toBe(201);
    const c = await res.json();
    expect(c).toMatchObject({ naam: 'Nieuw contract', startOp: '2026-10-01', eindOp: null, taken: [] });

    // Object van Mourik bij een contract van de tweede klant: nee.
    const fout = await nieuweTaak(verzoek(`/api/contracten/${c.id}/taken`, { body: { soort: 'onderhoud', objectId: ids.objecten[0], intervalMaanden: 6, volgendeOp: '2026-11-01' } }), p(c.id));
    expect(fout.status).toBe(400);
    expect((await fout.json()).velden.objectId).toBeTruthy();

    const goed = await nieuweTaak(verzoek(`/api/contracten/${c.id}/taken`, { body: { soort: 'onderhoud', objectId: ids.werkplaats, installatieId: ids.installaties[2], intervalMaanden: '6', volgendeOp: '2026-11-01' } }), p(c.id));
    expect(goed.status).toBe(201);
    const { contract: na } = await goed.json();
    expect(na.taken[0]).toMatchObject({ soort: 'onderhoud', titel: 'Onderhoud', intervalMaanden: 6, volgendeOp: '2026-11-01', installatie: { id: ids.installaties[2] } });

    // Onzin: interval 0, datum die niet bestaat.
    const onzin = await nieuweTaak(verzoek(`/api/contracten/${c.id}/taken`, { body: { soort: 'onderhoud', objectId: ids.werkplaats, intervalMaanden: 0, volgendeOp: '2026-02-30' } }), p(c.id));
    expect(onzin.status).toBe(400);
    const velden = (await onzin.json()).velden;
    expect(velden.intervalMaanden).toBeTruthy();
    expect(velden.volgendeOp).toBeTruthy();
  });

  it('een afgeronde lekkeninspectie op het object zet de taak door, en maar één keer', async () => {
    await admin();
    const inspectieId = ids.inspecties.conceptTweede;
    const datum = nlDag((await prisma.inspectie.findUniqueOrThrow({ where: { id: inspectieId } })).datum);
    const voor = await volgende(ids.taken.lekken);

    const af = await wijzigInspectie(verzoek(`/api/inspecties/${inspectieId}`, { method: 'PUT', body: { status: 'afgerond' } }), p(inspectieId));
    expect(af.status).toBe(200);
    expect(await volgende(ids.taken.lekken)).toBe(plusMaandenVast(datum, 12));
    // De inspectie arbeidsmiddelen-taak op hetzelfde object blijft staan.
    const arbeidsmiddelenVoor = await volgende(ids.taken.arbeidsmiddelen);

    // Terug naar concept: de datum gaat terug.
    await wijzigInspectie(verzoek(`/api/inspecties/${inspectieId}`, { method: 'PUT', body: { status: 'concept' } }), p(inspectieId));
    expect(await volgende(ids.taken.lekken)).toBe(voor);

    // Twee keer afronden (dubbelklik): één uitvoering.
    await wijzigInspectie(verzoek(`/api/inspecties/${inspectieId}`, { method: 'PUT', body: { status: 'afgerond' } }), p(inspectieId));
    await wijzigInspectie(verzoek(`/api/inspecties/${inspectieId}`, { method: 'PUT', body: { status: 'afgerond' } }), p(inspectieId));
    expect(await prisma.contractTaakUitvoering.count({ where: { taakId: ids.taken.lekken, bron: `inspectie-${inspectieId}` } })).toBe(1);
    expect(await volgende(ids.taken.lekken)).toBe(plusMaandenVast(datum, 12));
    expect(await volgende(ids.taken.arbeidsmiddelen)).toBe(arbeidsmiddelenVoor);
  });

  it('een contracttaak op de planning afvinken zet hem door vanaf die dag; weer open zet hem terug', async () => {
    await admin();
    const voor = await volgende(ids.taken.compressor);
    const stop = await prisma.samplePlanStop.findUniqueOrThrow({ where: { id: ids.taakStop }, include: { plan: true } });
    const res = await wijzigStop(verzoek(`/api/sample-plans/${stop.planId}/stops/${stop.id}`, { method: 'PATCH', body: { isDone: true } }), metParams({ id: String(stop.planId), stopId: String(stop.id) }));
    expect(res.status).toBe(200);
    const zes = plusMaandenVast(nlDag(stop.plan.date), 6);
    expect((await res.json()).volgendeOp).toBe(zes);
    expect(await volgende(ids.taken.compressor)).toBe(zes);

    await wijzigStop(verzoek(`/api/sample-plans/${stop.planId}/stops/${stop.id}`, { method: 'PATCH', body: { isDone: false } }), metParams({ id: String(stop.planId), stopId: String(stop.id) }));
    expect(await volgende(ids.taken.compressor)).toBe(voor);
  });

  it('met de hand uitgevoerd en weer ongedaan', async () => {
    await admin();
    const voor = await volgende(ids.taken.olie);
    const res = await uitgevoerd(verzoek(`/api/contract-taken/${ids.taken.olie}/uitgevoerd`, { body: { datum: '2026-10-05' } }), p(ids.taken.olie));
    expect(res.status).toBe(200);
    const { bron, volgendeOp, contract: c } = await res.json();
    expect(volgendeOp).toBe('2027-04-05');
    expect(c.taken.find((t: { id: number }) => t.id === ids.taken.olie)).toMatchObject({ volgendeOp: '2027-04-05', laatstUitgevoerdOp: '2026-10-05' });

    const terug = await nietUitgevoerd(verzoek(`/api/contract-taken/${ids.taken.olie}/uitgevoerd`, { method: 'DELETE', body: { bron } }), p(ids.taken.olie));
    expect(terug.status).toBe(200);
    expect(await volgende(ids.taken.olie)).toBe(voor);
    // Nog een keer terug kan niet.
    expect((await nietUitgevoerd(verzoek(`/api/contract-taken/${ids.taken.olie}/uitgevoerd`, { method: 'DELETE', body: { bron } }), p(ids.taken.olie))).status).toBe(409);
  });

  it('status: verlopen, binnenkort en gepland; aandacht filtert', async () => {
    await admin();
    const lijst = await (await taken(verzoek('/api/contract-taken'), undefined)).json();
    const van = (id: number) => lijst.find((t: { id: number }) => t.id === id);
    expect(van(ids.taken.olie).status).toBe('verlopen');
    expect(van(ids.taken.compressor)).toMatchObject({ status: 'gepland', gepland: { dag: vandaagNl() } });
    expect(van(ids.taken.lekken).status).toBe('later');
    const aandacht = await (await taken(verzoek('/api/contract-taken?aandacht=1'), undefined)).json();
    expect(aandacht.map((t: { id: number }) => t.id)).toEqual([ids.taken.olie]);

    // Datum van de lekkentaak naar volgende week: binnenkort.
    await wijzigTaak(verzoek(`/api/contract-taken/${ids.taken.lekken}`, { method: 'PUT', body: { volgendeOp: plusDagen(vandaagNl(), 7) } }), p(ids.taken.lekken));
    const na = await (await taken(verzoek('/api/contract-taken?aandacht=1'), undefined)).json();
    expect(na.map((t: { id: number }) => t.id).sort()).toEqual([ids.taken.lekken, ids.taken.olie].sort());
  });

  it('verwijderd contract valt uit de lijsten en komt terug met herstellen', async () => {
    await admin();
    const id = ids.contracten.tweede;
    expect((await wegContract(verzoek(`/api/contracten/${id}`, { method: 'DELETE', body: { bevestigNaam: 'fout' } }), p(id))).status).toBe(400);
    expect((await wegContract(verzoek(`/api/contracten/${id}`, { method: 'DELETE', body: { bevestigNaam: 'onderhoudscontract werkplaats' } }), p(id))).status).toBe(200);
    expect((await contract(verzoek(`/api/contracten/${id}`), p(id))).status).toBe(404);
    expect((await (await taken(verzoek('/api/contract-taken'), undefined)).json()).some((t: { contractId: number }) => t.contractId === id)).toBe(false);
    expect((await herstelContract(verzoek(`/api/contracten/${id}/herstellen`, { method: 'POST' }), p(id))).status).toBe(200);
    expect((await (await contracten(verzoek('/api/contracten'), undefined)).json()).some((c: { id: number }) => c.id === id)).toBe(true);
  });
});

describe('planning met een contracttaak', () => {
  it('de taakstop heeft geen monsters, een eigen tijd, en plant de monsters van het object niet in', async () => {
    await admin();
    const jaar = new Date().getFullYear();
    const data = await (await planning(verzoek(`/api/sample-plans?year=${jaar}`), undefined)).json();
    const dag = data.dagen.find((d: { id: number }) => d.id === ids.dagen.vandaag);
    const taakStop = dag.stops.find((s: { id: number }) => s.id === ids.taakStop);
    expect(taakStop).toMatchObject({ soort: 'taak', aantalMonsters: 0, samples: [], werkMinuten: 90, taak: { id: ids.taken.compressor, titel: 'Halfjaarlijks onderhoud schroefcompressor' } });
    // De oliemonsterstops tellen zoals altijd, de taak komt er bij in het dagtotaal.
    const werk = dag.stops.reduce((n: number, s: { werkMinuten: number }) => n + s.werkMinuten, 0);
    expect(dag.werkMinuten).toBe(werk);
    // K-2026-05 staat alleen op dag 3; de rest van de werkplaats is niet gepland door de taak.
    const werkplaats = data.objecten.find((o: { id: number }) => o.id === ids.werkplaats);
    expect(werkplaats.aantalOngepland).toBeGreaterThan(0);
    // Te plannen: de taken die niet op een dag staan, en de concept-inspecties.
    expect(data.tePlannen.taken.map((t: { id: number }) => t.id)).not.toContain(ids.taken.compressor);
    expect(data.tePlannen.taken.map((t: { id: number }) => t.id)).toContain(ids.taken.olie);
    expect(data.tePlannen.inspecties.map((i: { id: number }) => i.id)).toContain(ids.inspecties.conceptTweede);
  });
});

describe('afscherming', () => {
  it('kijkers komen niet bij de contracten, ook niet met het klantportaal; gebruiker leest, wijzigt niet', async () => {
    for (const [wie, ww] of [['kijker', 'kijker123'], ['kempen', 'kempen123']]) {
      await inloggenAls(wie, ww);
      expect((await contracten(verzoek('/api/contracten'), undefined)).status).toBe(403);
      expect((await taken(verzoek('/api/contract-taken'), undefined)).status).toBe(403);
      expect((await contract(verzoek(`/api/contracten/${ids.contracten.tweede}`), p(ids.contracten.tweede))).status).toBe(403);
    }
    await inloggenAls('gebruiker', 'user123');
    expect((await contracten(verzoek('/api/contracten'), undefined)).status).toBe(200);
    expect((await uitgevoerd(verzoek(`/api/contract-taken/${ids.taken.olie}/uitgevoerd`, { body: {} }), p(ids.taken.olie))).status).toBe(403);
  });

  it('het klantportaal toont de eigen komende momenten, zonder notities of contractnaam', async () => {
    await inloggenAls('kempen', 'kempen123');
    const res = await portaal(verzoek('/api/portaal'), undefined);
    expect(res.status).toBe(200);
    const data = await res.json();
    const titels = data.onderhoud.map((o: { titel: string }) => o.titel);
    expect(titels).toContain('Halfjaarlijks onderhoud schroefcompressor');
    expect(titels).not.toContain('Jaarlijkse monstername'); // die is van Mourik
    const tekst = JSON.stringify(data.onderhoud);
    expect(tekst).not.toMatch(/Intern|filterset|Onderhoudscontract|intervalMaanden|notities/);
    const compressor = data.onderhoud.find((o: { titel: string }) => o.titel.startsWith('Halfjaarlijks'));
    expect(compressor).toMatchObject({ gepland: true, datum: vandaagNl() });
    const olie = data.onderhoud.find((o: { soort: string }) => o.soort === 'oliemonsters');
    expect(olie).toMatchObject({ gepland: false, wordtIngepland: true });

    // De klassieke kijker heeft geen klantportaal (zoals op main).
    await inloggenAls('kijker', 'kijker123');
    expect((await portaal(verzoek('/api/portaal'), undefined)).status).toBe(403);
  });
});
