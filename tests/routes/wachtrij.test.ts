// Idempotentie van de offline wachtrij op de server (lib/idempotentie.ts):
// hetzelfde Monster nemen of dezelfde nieuwe bevinding twee keer versturen met
// dezelfde sleutel doet het maar één keer, en geeft hetzelfde antwoord terug.
import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { vulMetNepdata } from '@/prisma/nepdata';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as nemen } from '@/app/api/samples/[id]/nemen/route';
import { POST as nieuwItem } from '@/app/api/inspecties/[id]/items/route';
import { HERHALING_HEADER, IDEMPOTENTIE_HEADER } from '@/lib/idempotentie';
import { PORTAL, metParams, uitloggen, verzoek } from '../hulp/verzoek';

let ids: Awaited<ReturnType<typeof vulMetNepdata>>;

async function inloggenAls(username: string, password: string) {
  uitloggen();
  const res = await login(verzoek('/api/auth/login', { body: { username, password } }));
  expect(res.status).toBe(200);
}
const p = (id: number) => metParams({ id: String(id) });

function nemenVerzoek(monsterId: number, sleutel?: string, datum = '2026-09-29') {
  const form = new FormData();
  form.append('sampleDate', datum);
  form.append('oilType', 'HLP 46');
  form.append('remarks', 'Uit de wachtrij');
  return new NextRequest(`${PORTAL}/api/samples/${monsterId}/nemen`, {
    method: 'POST',
    headers: { origin: PORTAL, ...(sleutel ? { [IDEMPOTENTIE_HEADER]: sleutel } : {}) },
    body: form,
  });
}

function itemVerzoek(inspectieId: number, sleutel: string, titel: string) {
  return new NextRequest(`${PORTAL}/api/inspecties/${inspectieId}/items`, {
    method: 'POST',
    headers: { origin: PORTAL, 'content-type': 'application/json', [IDEMPOTENTIE_HEADER]: sleutel },
    body: JSON.stringify({ titel, locatie: 'Hal 3', waarden: { db: '40', verliesLpm: '20' } }),
  });
}

beforeEach(async () => {
  ids = await vulMetNepdata(prisma);
});

describe('idempotentie', () => {
  it('Monster nemen twee keer met dezelfde sleutel: één poging, hetzelfde antwoord, de tweede als herhaling', async () => {
    await inloggenAls('admin', 'admin123');
    const monsterId = ids.monsters[2026][6]; // O-2026-007, open, zonder pogingen
    const voor = await prisma.sampleAttempt.count({ where: { oilSampleId: monsterId } });

    const eerste = await nemen(nemenVerzoek(monsterId, 'sleutel-0001'), p(monsterId));
    expect(eerste.status).toBe(200);
    const a = await eerste.json();
    expect(eerste.headers.get(HERHALING_HEADER)).toBeNull();

    const tweede = await nemen(nemenVerzoek(monsterId, 'sleutel-0001'), p(monsterId));
    expect(tweede.status).toBe(200);
    expect(tweede.headers.get(HERHALING_HEADER)).toBe('1');
    const b = await tweede.json();
    expect(b.attemptId).toBe(a.attemptId);

    expect(await prisma.sampleAttempt.count({ where: { oilSampleId: monsterId } })).toBe(voor + 1);
    expect(await prisma.auditLog.count({ where: { action: 'TAKE_SAMPLE', details: { contains: `"id":${monsterId}` } } })).toBe(1);

    // Een nieuwe sleutel is een nieuwe invoer: dan wel een tweede poging (hermonstering).
    await nemen(nemenVerzoek(monsterId, 'sleutel-0002'), p(monsterId));
    expect(await prisma.sampleAttempt.count({ where: { oilSampleId: monsterId } })).toBe(voor + 2);
  });

  it('zonder sleutel werkt de route zoals altijd', async () => {
    await inloggenAls('admin', 'admin123');
    const monsterId = ids.monsters[2026][6];
    expect((await nemen(nemenVerzoek(monsterId), p(monsterId))).status).toBe(200);
    expect(await prisma.verzending.count()).toBe(0);
  });

  it('mislukt het eerste verzoek, dan kan dezelfde sleutel het opnieuw proberen', async () => {
    await inloggenAls('admin', 'admin123');
    const monsterId = ids.monsters[2026][6];
    const fout = await nemen(nemenVerzoek(monsterId, 'sleutel-0003', 'geen-datum'), p(monsterId));
    expect(fout.status).toBe(400);
    expect(await prisma.verzending.count({ where: { sleutel: 'sleutel-0003' } })).toBe(0);
    expect((await nemen(nemenVerzoek(monsterId, 'sleutel-0003'), p(monsterId))).status).toBe(200);
  });

  it('een eerste verzoek dat nog bezig is: 409 met bezig, de wachtrij probeert het later', async () => {
    await inloggenAls('admin', 'admin123');
    const monsterId = ids.monsters[2026][6];
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
    await prisma.verzending.create({ data: { sleutel: 'sleutel-0004', userId: admin.id, route: `nemen-${monsterId}` } });
    const res = await nemen(nemenVerzoek(monsterId, 'sleutel-0004'), p(monsterId));
    expect(res.status).toBe(409);
    expect((await res.json()).bezig).toBe(true);
    expect(await prisma.sampleAttempt.count({ where: { oilSampleId: monsterId } })).toBe(0);
  });

  it('dezelfde sleutel voor een ander monster of een andere gebruiker: geweigerd', async () => {
    await inloggenAls('admin', 'admin123');
    const [m1, m2] = [ids.monsters[2026][6], ids.monsters[2026][9]];
    await nemen(nemenVerzoek(m1, 'sleutel-0005'), p(m1));
    expect((await nemen(nemenVerzoek(m2, 'sleutel-0005'), p(m2))).status).toBe(409);
    expect((await nemen(nemenVerzoek(m1, 'kort'), p(m1))).status).toBe(400);
  });

  it('een nieuwe bevinding twee keer versturen: één lek', async () => {
    await inloggenAls('admin', 'admin123');
    const id = ids.inspecties.conceptTweede;
    const voor = await prisma.inspectieItem.count({ where: { inspectieId: id } });
    const a = await (await nieuwItem(itemVerzoek(id, 'lek-sleutel-1', '301'), p(id))).json();
    const herhaling = await nieuwItem(itemVerzoek(id, 'lek-sleutel-1', '301'), p(id));
    expect(herhaling.status).toBe(201);
    expect((await herhaling.json()).itemId).toBe(a.itemId);
    expect(await prisma.inspectieItem.count({ where: { inspectieId: id } })).toBe(voor + 1);
  });

  it('een kijker komt niet eens bij de route', async () => {
    await inloggenAls('kempen', 'kempen123');
    const monsterId = ids.tweedeMonsters[2026][4];
    expect((await nemen(nemenVerzoek(monsterId, 'sleutel-0006'), p(monsterId))).status).toBe(403);
    expect(await prisma.verzending.count()).toBe(0);
  });
});
