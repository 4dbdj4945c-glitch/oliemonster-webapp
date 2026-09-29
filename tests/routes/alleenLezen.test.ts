// De rol alleen lezen, zoals de Mourik-kijker: alleen de oliemonsters van zijn
// eigen jaar lezen, niets wijzigen, geen andere modules.
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { vulMetNepdata } from '@/prisma/nepdata';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as monsters, POST as nieuwMonster } from '@/app/api/samples/route';
import { PUT as wijzigMonster, DELETE as verwijderMonster } from '@/app/api/samples/[id]/route';
import { POST as nemen } from '@/app/api/samples/[id]/nemen/route';
import { GET as planning } from '@/app/api/sample-plans/route';
import { GET as prospects } from '@/app/api/prospects/route';
import { GET as instellingen } from '@/app/api/settings/route';
import { GET as gebruikers } from '@/app/api/users/route';
import { metParams, uitloggen, verzoek } from '../hulp/verzoek';

let ids: Awaited<ReturnType<typeof vulMetNepdata>>;

async function inloggenAls(username: string, password: string) {
  uitloggen();
  const res = await login(verzoek('/api/auth/login', { body: { username, password } }));
  expect(res.status).toBe(200);
}

type Monster = { analysisYear: number; oNumber: string };

beforeEach(async () => {
  ids = await vulMetNepdata(prisma);
  await inloggenAls('kijker', 'kijker123');
});

describe('kijker (alleen lezen, 2025)', () => {
  it('ziet alleen 2025, ook als hij om 2026 vraagt', async () => {
    for (const pad of ['/api/samples', '/api/samples?year=2026', '/api/samples?year=2025&search=Sluis']) {
      const res = await monsters(verzoek(pad), undefined);
      expect(res.status).toBe(200);
      const lijst = (await res.json()) as Monster[];
      expect(lijst.length).toBeGreaterThan(0);
      expect(new Set(lijst.map((m) => m.analysisYear))).toEqual(new Set([2025]));
    }
  });

  it('ziet geen monsters uit de prullenbak', async () => {
    await prisma.user.update({ where: { id: ids.gebruikers.kijker }, data: { viewYear: 2026 } });
    const lijst = (await (await monsters(verzoek('/api/samples'), undefined)).json()) as Monster[];
    expect(lijst.map((m) => m.oNumber)).not.toContain('O-2026-099');
    expect(lijst).toHaveLength(12);
  });

  it('mag de kolominstellingen lezen', async () => {
    expect((await instellingen(verzoek('/api/settings'), undefined)).status).toBe(200);
  });

  it('kan niets wijzigen', async () => {
    const id = String(ids.monsters[2025][0]);
    const body = { oNumber: 'X', location: 'X', description: 'X', isTaken: false, analysisYear: 2025 };
    expect((await nieuwMonster(verzoek('/api/samples', { body }), undefined)).status).toBe(403);
    expect((await wijzigMonster(verzoek(`/api/samples/${id}`, { method: 'PUT', body }), metParams({ id }))).status).toBe(403);
    expect((await verwijderMonster(verzoek(`/api/samples/${id}`, { method: 'DELETE', body: { bevestigONummer: 'O-2025-001' } }), metParams({ id }))).status).toBe(403);
    expect((await nemen(verzoek(`/api/samples/${id}/nemen`, { body: {} }), metParams({ id }))).status).toBe(403);
    const m = await prisma.oilSample.findUniqueOrThrow({ where: { id: Number(id) } });
    expect(m.deletedAt).toBeNull();
  });

  it('komt niet in andere modules', async () => {
    expect((await planning(verzoek('/api/sample-plans?year=2025'), undefined)).status).toBe(403);
    expect((await prospects(verzoek('/api/prospects'), undefined)).status).toBe(403);
    expect((await gebruikers(verzoek('/api/users'), undefined)).status).toBe(403);
  });

  it('verliest zijn toegang meteen als hij verwijderd wordt', async () => {
    await prisma.user.delete({ where: { id: ids.gebruikers.kijker } });
    expect((await monsters(verzoek('/api/samples'), undefined)).status).toBe(401);
  });
});

describe('admin en gebruiker', () => {
  it('admin ziet beide jaren en mag een monster aanmaken', async () => {
    await inloggenAls('admin', 'admin123');
    const lijst = (await (await monsters(verzoek('/api/samples'), undefined)).json()) as Monster[];
    expect(new Set(lijst.map((m) => m.analysisYear))).toEqual(new Set([2025, 2026]));
    const res = await nieuwMonster(
      verzoek('/api/samples', { body: { oNumber: 'O-2026-500', location: 'Sluis Grave', description: 'Nieuw', isTaken: false, analysisYear: 2026 } }),
      undefined
    );
    expect(res.status).toBe(201);
  });

  it('gebruiker mag lezen maar niet wijzigen', async () => {
    await inloggenAls('gebruiker', 'user123');
    expect((await planning(verzoek('/api/sample-plans?year=2026'), undefined)).status).toBe(200);
    const body = { oNumber: 'X', location: 'X', description: 'X', isTaken: false, analysisYear: 2026 };
    expect((await nieuwMonster(verzoek('/api/samples', { body }), undefined)).status).toBe(403);
  });

  it('een admin die in de database teruggezet wordt, is meteen geen admin meer', async () => {
    await inloggenAls('admin', 'admin123');
    await prisma.user.update({ where: { id: ids.gebruikers.admin }, data: { role: 'alleen_lezen', viewYear: 2025 } });
    expect((await gebruikers(verzoek('/api/users'), undefined)).status).toBe(403);
    const lijst = (await (await monsters(verzoek('/api/samples?year=2026'), undefined)).json()) as Monster[];
    expect(new Set(lijst.map((m) => m.analysisYear))).toEqual(new Set([2025]));
  });
});
