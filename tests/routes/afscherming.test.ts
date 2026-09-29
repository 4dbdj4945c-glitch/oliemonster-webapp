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
import { POST as nieuweGebruiker } from '@/app/api/users/route';
import { PUT as wijzigGebruiker } from '@/app/api/users/[id]/route';
import { GET as foto } from '@/app/api/fotos/[...pad]/route';
import { PUT as wijzigMonster } from '@/app/api/samples/[id]/route';
import { POST as overnemen } from '@/app/api/samples/copy-year/route';
import { metParams, uitloggen, verzoek } from '../hulp/verzoek';

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

describe('gebruikersbeheer: klant en weergave', () => {
  beforeEach(async () => {
    await inloggenAls('admin', 'admin123');
  });

  it('een nieuwe kijker met een klant krijgt standaard het klantportaal', async () => {
    const res = await nieuweGebruiker(
      verzoek('/api/users', { body: { username: 'martin', role: 'alleen_lezen', viewYear: 2026, klantId: ids.klanten.mourik } }),
      undefined
    );
    expect(res.status).toBe(201);
    const u = await res.json();
    expect(u.klantId).toBe(ids.klanten.mourik);
    expect(u.portaalWeergave).toBe('klantportaal');
  });

  it('zonder klant blijft een nieuwe kijker klassiek, en klantportaal zonder klant kan niet', async () => {
    const zonder = await (await nieuweGebruiker(verzoek('/api/users', { body: { username: 'los', role: 'alleen_lezen' } }), undefined)).json();
    expect(zonder.portaalWeergave).toBe('klassiek');
    const fout = await nieuweGebruiker(
      verzoek('/api/users', { body: { username: 'los2', role: 'alleen_lezen', portaalWeergave: 'klantportaal' } }),
      undefined
    );
    expect(fout.status).toBe(400);
  });

  it('een onbekende klant wordt geweigerd', async () => {
    const res = await nieuweGebruiker(verzoek('/api/users', { body: { username: 'x', role: 'alleen_lezen', klantId: 99999 } }), undefined);
    expect(res.status).toBe(400);
  });

  it('de bestaande kijker blijft klassiek als je alleen zijn jaar wijzigt', async () => {
    const id = String(ids.gebruikers.kijker);
    const res = await wijzigGebruiker(verzoek(`/api/users/${id}`, { method: 'PUT', body: { viewYear: 2026 } }), metParams({ id }));
    expect(res.status).toBe(200);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ids.gebruikers.kijker } });
    expect(u.portaalWeergave).toBe('klassiek');
    expect(u.klantId).toBe(ids.klanten.mourik);
  });

  it('Roel zet de kijker om naar het klantportaal, en een andere rol maakt klant en weergave leeg', async () => {
    const id = String(ids.gebruikers.kijker);
    await wijzigGebruiker(verzoek(`/api/users/${id}`, { method: 'PUT', body: { portaalWeergave: 'klantportaal' } }), metParams({ id }));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: Number(id) } })).portaalWeergave).toBe('klantportaal');
    await wijzigGebruiker(verzoek(`/api/users/${id}`, { method: 'PUT', body: { role: 'user' } }), metParams({ id }));
    const u = await prisma.user.findUniqueOrThrow({ where: { id: Number(id) } });
    expect(u.klantId).toBeNull();
    expect(u.portaalWeergave).toBe('klassiek');
  });
});

describe("foto's via /api/fotos", () => {
  const haal = (pad: string) => foto(verzoek(`/api/fotos/${pad}?v=1`), { params: Promise.resolve({ pad: pad.split('/') }) });

  beforeEach(async () => {
    // Een Mourik-monster en een Mourik-installatie met een foto, om zeker te
    // weten dat een 404 door de afscherming komt en niet door een lege foto.
    await prisma.oilSample.update({ where: { id: ids.monsters[2025][0] }, data: { photoUrl: '/nepdata/potje-2.jpg' } });
    await prisma.sampleAttempt.updateMany({ where: { oilSampleId: ids.monsters[2025][0] }, data: { photoUrl: '/nepdata/potje-2.jpg' } });
    await prisma.installatie.update({ where: { id: ids.installaties[0] }, data: { fotoUrl: '/nepdata/onderdeel-1.jpg' } });
  });

  it('de kijker van de tweede klant krijgt zijn eigen foto, en niet die van Mourik', async () => {
    await inloggenAls('kempen', 'kempen123');
    const eigen = await haal(`monster/${ids.tweedeMonsters[2026][0]}/potje`);
    expect(eigen.status).toBe(200);
    expect(eigen.headers.get('content-type')).toBe('image/jpeg');
    expect(eigen.headers.get('cache-control')).toMatch(/^private/);
    expect((await haal(`monster/${ids.monsters[2025][0]}/potje`)).status).toBe(404);
    const pogingMourik = await prisma.sampleAttempt.findFirstOrThrow({ where: { oilSampleId: ids.monsters[2025][0] } });
    expect((await haal(`poging/${pogingMourik.id}/potje`)).status).toBe(404);
    expect((await haal(`installatie/${ids.installaties[0]}`)).status).toBe(404);
    expect((await haal(`klantlogo/${ids.klanten.mourik}`)).status).toBe(404);
  });

  it('de kijker van Mourik krijgt de foto van de tweede klant niet', async () => {
    await inloggenAls('kijker', 'kijker123');
    expect((await haal(`monster/${ids.monsters[2025][0]}/potje`)).status).toBe(200);
    expect((await haal(`monster/${ids.tweedeMonsters[2025][0]}/potje`)).status).toBe(404);
    const pogingTweede = await prisma.sampleAttempt.findFirstOrThrow({ where: { oilSampleId: ids.tweedeMonsters[2025][0] } });
    expect((await haal(`poging/${pogingTweede.id}/onderdeel`)).status).toBe(404);
    expect((await haal(`klantlogo/${ids.klanten.mourik}`)).status).toBe(200);
  });

  it('de lijst geeft een kijker alleen adressen van de fotoroute', async () => {
    await inloggenAls('kempen', 'kempen123');
    const l = (await (await monsters(verzoek('/api/samples'), undefined)).json()) as { id: number; photoUrl: string | null; partPhotoUrl: string | null }[];
    const metFoto = l.filter((m) => m.photoUrl);
    expect(metFoto.length).toBeGreaterThan(0);
    for (const m of metFoto) {
      expect(m.photoUrl).toMatch(new RegExp(`^/api/fotos/monster/${m.id}/potje\\?v=`));
      expect(m.partPhotoUrl).toMatch(new RegExp(`^/api/fotos/monster/${m.id}/onderdeel\\?v=`));
    }
  });

  it('een onzinnig pad of een monster uit de prullenbak geeft 404', async () => {
    await inloggenAls('admin', 'admin123');
    expect((await haal(`monster/abc/potje`)).status).toBe(404);
    expect((await haal(`monster/${ids.monsters[2025][0]}/iets`)).status).toBe(404);
    await prisma.oilSample.update({ where: { id: ids.monsters[2025][0] }, data: { deletedAt: new Date() } });
    expect((await haal(`monster/${ids.monsters[2025][0]}/potje`)).status).toBe(404);
    expect((await haal(`installatie/${ids.installaties[0]}`)).status).toBe(200);
  });

  it('niet ingelogd: 401', async () => {
    uitloggen();
    expect((await haal(`monster/${ids.tweedeMonsters[2026][0]}/potje`)).status).toBe(401);
  });
});

describe('de klant blijft bij het monster', () => {
  it('als het object eraf gaat, en bij overnemen naar een nieuw jaar', async () => {
    await inloggenAls('admin', 'admin123');
    const id = ids.monsters[2025][0];
    const m = await prisma.oilSample.findUniqueOrThrow({ where: { id } });
    const res = await wijzigMonster(
      verzoek(`/api/samples/${id}`, {
        method: 'PUT',
        body: { oNumber: m.oNumber, location: m.location, description: m.description, isTaken: m.isTaken, sampleDate: m.sampleDate?.toISOString(), objectId: null },
      }),
      metParams({ id: String(id) })
    );
    expect(res.status).toBe(200);
    const na = await prisma.oilSample.findUniqueOrThrow({ where: { id } });
    expect(na.objectId).toBeNull();
    expect(na.klantId).toBe(ids.klanten.mourik);

    const kopie = await overnemen(verzoek('/api/samples/copy-year', { body: { fromYear: 2025, toYear: 2027 } }), undefined);
    expect(kopie.status).toBe(200);
    const in2027 = await prisma.oilSample.findFirstOrThrow({ where: { oNumber: m.oNumber, analysisYear: 2027 } });
    expect(in2027.klantId).toBe(ids.klanten.mourik);

    await inloggenAls('kijker', 'kijker123');
    const l = await lijst('/api/samples');
    expect(l.map((x) => x.id)).toContain(id);
  });
});

describe('interne velden voor de kijker', () => {
  it('geen cancelledBy, unreachableBy en geen interne reden van annuleren', async () => {
    await prisma.oilSample.updateMany({ where: { oNumber: 'O-2025-005' }, data: { cancelReasonInPdf: false } });
    await inloggenAls('kijker', 'kijker123');
    const l = (await (await monsters(verzoek('/api/samples'), undefined)).json()) as Record<string, unknown>[];
    for (const m of l) {
      expect(m).not.toHaveProperty('cancelledBy');
      expect(m).not.toHaveProperty('unreachableBy');
    }
    expect(l.find((m) => m.oNumber === 'O-2025-005')?.cancelReason).toBeNull();
  });
  it('admin ziet ze wel', async () => {
    await inloggenAls('admin', 'admin123');
    const l = (await (await monsters(verzoek('/api/samples?year=2025'), undefined)).json()) as Record<string, unknown>[];
    expect(l.find((m) => m.oNumber === 'O-2025-005')?.cancelledBy).toBe('admin');
  });
});
