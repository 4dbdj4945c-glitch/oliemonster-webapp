// Afscherming per klant (fase 3): klant A ziet niets van klant B, ook niet met
// een id in de URL. Mourik is klant A (kijker, klassiek, 2025), de tweede klant
// is klant B (kempen, klantportaal, alle jaren).
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { vulMetNepdata } from '@/prisma/nepdata';
import { POST as login } from '@/app/api/auth/login/route';
import { GET as monsters } from '@/app/api/samples/route';
import { GET as jaren } from '@/app/api/samples/jaren/route';
import { GET as sessie } from '@/app/api/auth/session/route';
import { uitloggen, verzoek } from '../hulp/verzoek';

let ids: Awaited<ReturnType<typeof vulMetNepdata>>;

async function inloggenAls(username: string, password: string) {
  uitloggen();
  const res = await login(verzoek('/api/auth/login', { body: { username, password } }));
  expect(res.status).toBe(200);
}

type Monster = { id: number; analysisYear: number; oNumber: string };

async function lijst(pad: string): Promise<Monster[]> {
  const res = await monsters(verzoek(pad), undefined);
  expect(res.status).toBe(200);
  return (await res.json()) as Monster[];
}

beforeEach(async () => {
  ids = await vulMetNepdata(prisma);
});

describe('monsterlijst per klant', () => {
  it('de kijker van Mourik ziet alleen Mourik in 2025, net als voorheen', async () => {
    await inloggenAls('kijker', 'kijker123');
    const l = await lijst('/api/samples');
    expect(l).toHaveLength(12);
    expect(l.every((m) => m.oNumber.startsWith('O-2025-'))).toBe(true);
  });

  it('de kijker van Mourik ziet de tweede klant niet, ook niet als hij zoekt', async () => {
    await inloggenAls('kijker', 'kijker123');
    await prisma.user.update({ where: { id: ids.gebruikers.kijker }, data: { viewYear: null } });
    const l = await lijst('/api/samples?search=K-20');
    expect(l).toHaveLength(0);
    const alles = await lijst('/api/samples');
    expect(alles.some((m) => m.oNumber.startsWith('K-'))).toBe(false);
    // Het monster zonder object en zonder klant ziet geen enkele kijker.
    expect(alles.some((m) => m.id === ids.zonderKlant)).toBe(false);
  });

  it('de kijker van de tweede klant ziet alleen zijn eigen monsters, ook het losse zonder object', async () => {
    await inloggenAls('kempen', 'kempen123');
    const l = await lijst('/api/samples');
    const eigen = [...ids.tweedeMonsters[2025], ...ids.tweedeMonsters[2026]].sort();
    expect(l.map((m) => m.id).sort()).toEqual(eigen);
    expect(l.map((m) => m.id)).toContain(ids.losMonster);
    const van2025 = await lijst('/api/samples?year=2025');
    expect(van2025.map((m) => m.oNumber).sort()).toEqual(['K-2025-01', 'K-2025-02']);
  });

  it('met een kijkjaar blijft ook het jaar afgeschermd', async () => {
    await prisma.user.update({ where: { username: 'kempen' }, data: { viewYear: 2025 } });
    await inloggenAls('kempen', 'kempen123');
    const l = await lijst('/api/samples?year=2026');
    expect(new Set(l.map((m) => m.analysisYear))).toEqual(new Set([2025]));
  });

  it('een object dat naar een andere klant gaat, neemt zijn monsters mee', async () => {
    await prisma.sampleObject.update({ where: { id: ids.werkplaats }, data: { klantId: ids.klanten.mourik } });
    await inloggenAls('kempen', 'kempen123');
    const l = await lijst('/api/samples');
    expect(l.map((m) => m.id)).toEqual([ids.losMonster]);
  });

  it('de jaren tellen alleen de eigen monsters', async () => {
    await inloggenAls('kempen', 'kempen123');
    const res = await jaren(verzoek('/api/samples/jaren'), undefined);
    const { jaren: rijen } = (await res.json()) as { jaren: { jaar: number; totaal: number; genomen: number }[] };
    expect(rijen).toEqual([
      { jaar: 2026, totaal: 7, genomen: 3 },
      { jaar: 2025, totaal: 2, genomen: 2 },
    ]);
  });

  it('admin ziet alles, ook de tweede klant en het monster zonder klant', async () => {
    await inloggenAls('admin', 'admin123');
    const l = await lijst('/api/samples');
    expect(l.map((m) => m.id)).toContain(ids.zonderKlant);
    expect(l.map((m) => m.id)).toContain(ids.losMonster);
  });
});

describe('sessie', () => {
  it('geeft de klant en de weergave van de kijker mee', async () => {
    await inloggenAls('kempen', 'kempen123');
    const s = await (await sessie()).json();
    expect(s.klantId).toBe(ids.klanten.tweede);
    expect(s.portaalWeergave).toBe('klantportaal');
  });

  it('de kijker van Mourik blijft klassiek', async () => {
    await inloggenAls('kijker', 'kijker123');
    const s = await (await sessie()).json();
    expect(s.portaalWeergave).toBe('klassiek');
  });
});
