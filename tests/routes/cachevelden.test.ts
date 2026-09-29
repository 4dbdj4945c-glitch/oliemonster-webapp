// De cachebug: opmerking, datum, status en foto's op OilSample komen uit de
// laatste poging. Vroeger schreven het bewerkvenster, de statusknop en de
// fotoroute ze rechtstreeks op het monster, en wiste de eerstvolgende
// pogingwijziging ze weer. Nu gaat alles via de poging.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const blob = vi.hoisted(() => ({
  teller: 0,
  put: vi.fn(async (naam: string, _bestand: unknown, opties: { addRandomSuffix?: boolean }) => ({
    url: `https://test.public.blob.vercel-storage.com/${naam.replace(/\.jpg$/, '')}-${opties.addRandomSuffix ? `r${++blob.teller}` : 'vast'}.jpg`,
  })),
  del: vi.fn(async () => {}),
}));
vi.mock('@vercel/blob', () => ({ put: blob.put, del: blob.del }));

import { prisma } from '@/lib/prisma';
import { vulMetNepdata } from '@/prisma/nepdata';
import { POST as login } from '@/app/api/auth/login/route';
import { PUT as wijzigMonster } from '@/app/api/samples/[id]/route';
import { POST as nieuwMonster } from '@/app/api/samples/route';
import { PATCH as zetStatus } from '@/app/api/samples/[id]/status/route';
import { POST as fotoOp, DELETE as fotoAf } from '@/app/api/samples/[id]/photo/route';
import { POST as nieuwePoging } from '@/app/api/samples/[id]/attempts/route';
import { PUT as wijzigPoging } from '@/app/api/samples/[id]/attempts/[attemptId]/route';
import { POST as pogingFoto } from '@/app/api/samples/[id]/attempts/[attemptId]/photo/route';
import { POST as afnameOngedaan } from '@/app/api/samples/[id]/afname-ongedaan/route';
import { fotoVerzoek, metParams, nepFoto, uitloggen, verzoek } from '../hulp/verzoek';

let ids: Awaited<ReturnType<typeof vulMetNepdata>>;

const monster = (id: number) => prisma.oilSample.findUniqueOrThrow({ where: { id } });
const pogingen = (id: number) =>
  prisma.sampleAttempt.findMany({ where: { oilSampleId: id }, orderBy: [{ sampleDate: 'asc' }, { createdAt: 'asc' }] });

async function bewerk(id: number, wijziging: Record<string, unknown>) {
  const m = await monster(id);
  const body = {
    oNumber: m.oNumber,
    location: m.location,
    description: m.description,
    oilType: m.oilType,
    isTaken: m.isTaken,
    sampleDate: m.sampleDate?.toISOString().slice(0, 10) ?? '',
    remarks: m.remarks ?? '',
    ...wijziging,
  };
  const res = await wijzigMonster(verzoek(`/api/samples/${id}`, { method: 'PUT', body }), metParams({ id: String(id) }));
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
}

beforeEach(async () => {
  process.env.BLOB_READ_WRITE_TOKEN = 'test';
  blob.put.mockClear();
  blob.del.mockClear();
  ids = await vulMetNepdata(prisma);
  uitloggen();
  const res = await login(verzoek('/api/auth/login', { body: { username: 'admin', password: 'admin123' } }));
  expect(res.status).toBe(200);
});

describe('opmerking via het bewerkvenster', () => {
  it('blijft staan als daarna een foto op de poging komt', async () => {
    const id = ids.monsters[2025][0];
    await bewerk(id, { remarks: 'Lekkage bij de flens' });
    const [poging] = await pogingen(id);
    expect(poging.remarks).toBe('Lekkage bij de flens');

    const res = await pogingFoto(
      fotoVerzoek(`/api/samples/${id}/attempts/${poging.id}/photo`, { photo: nepFoto(), soort: 'potje' }),
      metParams({ id: String(id), attemptId: String(poging.id) })
    );
    expect(res.status).toBe(200);
    const m = await monster(id);
    expect(m.remarks).toBe('Lekkage bij de flens');
    expect(m.photoUrl).toMatch(/blob\.vercel-storage\.com/);
  });

  it('gaat niet verloren bij een hermonstering: hij blijft op de eerste poging', async () => {
    const id = ids.monsters[2025][1];
    await bewerk(id, { remarks: 'Olie donker van kleur' });
    const res = await nieuwePoging(verzoek(`/api/samples/${id}/attempts`, { body: { isTaken: false } }), metParams({ id: String(id) }));
    expect(res.status).toBe(201);
    const lijst = await pogingen(id);
    expect(lijst).toHaveLength(2);
    expect(lijst.find((p) => p.isTaken)?.remarks).toBe('Olie donker van kleur');
  });

  it('bij een monster zonder poging komt er een poging bij, met wat er al stond', async () => {
    const id = ids.monsters[2026][6]; // 2026, nog niet genomen, zonder poging
    expect(await pogingen(id)).toHaveLength(0);
    await bewerk(id, { remarks: 'Sleutel bij de sluiswachter' });
    const lijst = await pogingen(id);
    expect(lijst).toHaveLength(1);
    expect(lijst[0].remarks).toBe('Sleutel bij de sluiswachter');
    expect(lijst[0].isTaken).toBe(false);
    expect((await monster(id)).remarks).toBe('Sleutel bij de sluiswachter');
  });

  it('Bijwerken zonder wijziging raakt de poging niet aan', async () => {
    const id = ids.monsters[2025][2];
    const [eerst] = await pogingen(id);
    // In het pogingenpaneel is de opmerking net gewijzigd; het formulier stuurt dezelfde waarden als de cache.
    const voor = await prisma.sampleAttempt.update({ where: { id: eerst.id }, data: { remarks: 'uit het paneel' } });
    await prisma.oilSample.update({ where: { id }, data: { remarks: 'uit het paneel' } });
    await bewerk(id, { location: 'Andere locatie' });
    const [na] = await pogingen(id);
    expect(na.remarks).toBe('uit het paneel');
    expect(na.updatedAt.getTime()).toBe(voor.updatedAt.getTime());
    expect((await monster(id)).location).toBe('Andere locatie');
  });
});

describe('de statusknop', () => {
  it('laat opmerking en foto staan', async () => {
    const id = ids.monsters[2025][3];
    await bewerk(id, { remarks: 'Monster troebel' });
    const up = await fotoOp(fotoVerzoek(`/api/samples/${id}/photo`, { photo: nepFoto(), soort: 'onderdeel' }), metParams({ id: String(id) }));
    expect(up.status).toBe(200);

    for (const isTaken of [false, true]) {
      const res = await zetStatus(verzoek(`/api/samples/${id}/status`, { method: 'PATCH', body: { isTaken } }), metParams({ id: String(id) }));
      expect(res.status).toBe(200);
      const m = await monster(id);
      expect(m.isTaken).toBe(isTaken);
      expect(m.remarks).toBe('Monster troebel');
      expect(m.partPhotoUrl).toMatch(/blob\.vercel-storage\.com/);
    }
  });
});

describe('foto op het monster', () => {
  it('komt op de laatste poging en verdwijnt niet bij het bijwerken van die poging', async () => {
    const id = ids.monsters[2025][4 + 1]; // genomen monster met een poging
    const res = await fotoOp(fotoVerzoek(`/api/samples/${id}/photo`, { photo: nepFoto() }), metParams({ id: String(id) }));
    expect(res.status).toBe(200);
    const { photoUrl } = await res.json();
    const [poging] = await pogingen(id);
    expect(poging.photoUrl).toBe(photoUrl);

    const put = await wijzigPoging(
      verzoek(`/api/samples/${id}/attempts/${poging.id}`, {
        method: 'PUT',
        body: { isTaken: true, sampleDate: poging.sampleDate?.toISOString(), remarks: 'na de foto' },
      }),
      metParams({ id: String(id), attemptId: String(poging.id) })
    );
    expect(put.status).toBe(200);
    const m = await monster(id);
    expect(m.photoUrl).toBe(photoUrl);
    expect(m.remarks).toBe('na de foto');
  });

  it('krijgt een willekeurig achtervoegsel; vervangen en verwijderen ruimen het oude bestand op', async () => {
    const id = ids.monsters[2025][6];
    const eerste = await (await fotoOp(fotoVerzoek(`/api/samples/${id}/photo`, { photo: nepFoto() }), metParams({ id: String(id) }))).json();
    expect(blob.put).toHaveBeenCalledWith(expect.stringMatching(/^sample-\d+-potje-\d+\.jpg$/), expect.anything(), { access: 'public', addRandomSuffix: true });
    expect(blob.del).not.toHaveBeenCalled();

    const tweede = await (await fotoOp(fotoVerzoek(`/api/samples/${id}/photo`, { photo: nepFoto() }), metParams({ id: String(id) }))).json();
    expect(tweede.photoUrl).not.toBe(eerste.photoUrl);
    expect(blob.del).toHaveBeenCalledWith(eerste.photoUrl);

    const weg = await fotoAf(verzoek(`/api/samples/${id}/photo?soort=potje`, { method: 'DELETE' }), metParams({ id: String(id) }));
    expect(weg.status).toBe(200);
    expect(blob.del).toHaveBeenCalledWith(tweede.photoUrl);
    expect((await monster(id)).photoUrl).toBeNull();
  });

  it('een adres dat nog ergens anders gebruikt wordt, blijft staan', async () => {
    const id = ids.monsters[2025][7];
    const eerste = await (await fotoOp(fotoVerzoek(`/api/samples/${id}/photo`, { photo: nepFoto() }), metParams({ id: String(id) }))).json();
    // Dezelfde foto hangt ook aan een ander monster (bijvoorbeeld overgenomen).
    await prisma.oilSample.update({ where: { id: ids.monsters[2025][8] }, data: { unreachablePhotoUrl: eerste.photoUrl } });
    await fotoAf(verzoek(`/api/samples/${id}/photo?soort=potje`, { method: 'DELETE' }), metParams({ id: String(id) }));
    expect(blob.del).not.toHaveBeenCalled();
  });

  it('Afname ongedaan maken koppelt de foto los maar wist hem niet', async () => {
    const id = ids.monsters[2025][9];
    await fotoOp(fotoVerzoek(`/api/samples/${id}/photo`, { photo: nepFoto() }), metParams({ id: String(id) }));
    const res = await afnameOngedaan(verzoek(`/api/samples/${id}/afname-ongedaan`, { body: {} }), metParams({ id: String(id) }));
    expect(res.status).toBe(200);
    const m = await monster(id);
    expect(m.isTaken).toBe(false);
    expect(m.photoUrl).toBeNull();
    expect(m.remarks).toBe('Monster zonder bijzonderheden');
    expect(blob.del).not.toHaveBeenCalled();
  });
});

describe('nieuw monster', () => {
  it('datum, status en opmerking gaan via een eerste poging', async () => {
    const res = await nieuwMonster(
      verzoek('/api/samples', {
        body: { oNumber: 'O-2026-777', location: 'Sluis Grave', description: 'Nieuw', isTaken: true, sampleDate: '2026-09-01', remarks: 'Direct genomen', analysisYear: 2026 },
      }),
      undefined
    );
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const lijst = await pogingen(id);
    expect(lijst).toHaveLength(1);
    expect(lijst[0]).toMatchObject({ isTaken: true, remarks: 'Direct genomen' });
    expect((await monster(id)).remarks).toBe('Direct genomen');
  });

  it('een installatie moet bij het gekozen object horen', async () => {
    const body = { oNumber: 'O-2026-778', location: 'x', description: 'x', isTaken: false, analysisYear: 2026 };
    const fout = await nieuwMonster(verzoek('/api/samples', { body: { ...body, objectId: ids.objecten[1], installatieId: ids.installaties[0] } }), undefined);
    expect(fout.status).toBe(400);
    expect((await fout.json()).error).toBe('Deze installatie hoort niet bij het gekozen object');
    const goed = await nieuwMonster(verzoek('/api/samples', { body: { ...body, objectId: ids.objecten[0], installatieId: ids.installaties[0] } }), undefined);
    expect(goed.status).toBe(201);
  });

  it('ongeldige invoer geeft een 400 met de melding, geen 500', async () => {
    const res = await nieuwMonster(verzoek('/api/samples', { body: { oNumber: '', isTaken: 'ja' } }), undefined);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('O-nummer, locatie en omschrijving zijn verplicht');
  });
});
