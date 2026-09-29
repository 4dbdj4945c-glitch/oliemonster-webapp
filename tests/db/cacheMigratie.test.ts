// Datamigratie 20260930090100_cache_naar_poging: een opmerking of foto die
// alleen op het monster staat (zo schreef main dat), komt op de laatste poging
// en overleeft daarna een klik via wijzigLaatstePoging.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { vulMetNepdata } from '@/prisma/nepdata';
import { wijzigLaatstePoging } from '@/lib/sampleAttempts';

const SQL = readFileSync('prisma/migrations/20260930090100_cache_naar_poging/migration.sql', 'utf8');
let ids: Awaited<ReturnType<typeof vulMetNepdata>>;

/** De migratie heeft twee statements; executeRaw doet er één tegelijk. */
async function draaiMigratie() {
  for (const stuk of SQL.split(/;\s*\n/).map((x) => x.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(stuk);
  }
}

beforeEach(async () => {
  ids = await vulMetNepdata(prisma);
});

describe('cache naar de laatste poging', () => {
  it('zet opmerking en foto van het monster op de poging, zonder iets te overschrijven', async () => {
    const id = ids.monsters[2025][0];
    await prisma.sampleAttempt.updateMany({ where: { oilSampleId: id }, data: { remarks: null } });
    await prisma.oilSample.update({ where: { id }, data: { remarks: 'lekkage pomp', photoUrl: 'https://x.public.blob.vercel-storage.com/a.jpg' } });
    // Een tweede monster waar de poging al iets heeft: blijft staan.
    const ander = ids.monsters[2025][1];
    await prisma.oilSample.update({ where: { id: ander }, data: { remarks: 'oud' } });

    await draaiMigratie();
    await draaiMigratie(); // vaker draaien doet niets extra

    const [poging] = await prisma.sampleAttempt.findMany({ where: { oilSampleId: id } });
    expect(poging.remarks).toBe('lekkage pomp');
    expect(poging.photoUrl).toBe('https://x.public.blob.vercel-storage.com/a.jpg');
    const [andere] = await prisma.sampleAttempt.findMany({ where: { oilSampleId: ander } });
    expect(andere.remarks).toBe('Monster zonder bijzonderheden');

    // De klik die vroeger de opmerking wiste.
    await wijzigLaatstePoging(id, { isTaken: true });
    const m = await prisma.oilSample.findUniqueOrThrow({ where: { id } });
    expect(m.remarks).toBe('lekkage pomp');
    expect(m.photoUrl).toBe('https://x.public.blob.vercel-storage.com/a.jpg');
  });

  it('kiest dezelfde laatste poging als de app: een poging zonder datum gaat voor', async () => {
    const id = ids.monsters[2025][2];
    const zonderDatum = await prisma.sampleAttempt.create({ data: { oilSampleId: id, isTaken: false } });
    await prisma.oilSample.update({ where: { id }, data: { remarks: 'alleen op het monster' } });
    await draaiMigratie();
    expect((await prisma.sampleAttempt.findUniqueOrThrow({ where: { id: zonderDatum.id } })).remarks).toBe('alleen op het monster');
    await wijzigLaatstePoging(id, { isTaken: true, sampleDate: new Date() });
    expect((await prisma.oilSample.findUniqueOrThrow({ where: { id } })).remarks).toBe('alleen op het monster');
  });
});

describe('datum en genomen van het monster naar de laatste poging', () => {
  const voerUit = draaiMigratie;

  it('een monster dat genomen is maar een lege poging heeft, blijft genomen na een foto', async () => {
    const id = ids.monsters[2026][6]; // open monster, zonder poging in de nepdata
    const leeg = await prisma.sampleAttempt.create({ data: { oilSampleId: id, isTaken: false } });
    const datum = new Date(Date.UTC(2026, 2, 12));
    await prisma.oilSample.update({ where: { id }, data: { isTaken: true, sampleDate: datum } });

    await voerUit();
    await voerUit();

    const p = await prisma.sampleAttempt.findUniqueOrThrow({ where: { id: leeg.id } });
    expect(p.isTaken).toBe(true);
    expect(p.sampleDate?.toISOString()).toBe(datum.toISOString());
    await wijzigLaatstePoging(id, { photoUrl: 'https://x.public.blob.vercel-storage.com/nieuw.jpg' });
    const m = await prisma.oilSample.findUniqueOrThrow({ where: { id } });
    expect(m.isTaken).toBe(true);
    expect(m.sampleDate?.toISOString()).toBe(datum.toISOString());
  });

  it('een andere datum op het monster wint als de poging de laatste blijft', async () => {
    const id = ids.monsters[2025][3];
    const datum = new Date(Date.UTC(2025, 4, 20));
    await prisma.oilSample.update({ where: { id }, data: { sampleDate: datum } });
    await voerUit();
    const [p] = await prisma.sampleAttempt.findMany({ where: { oilSampleId: id } });
    expect(p.sampleDate?.toISOString()).toBe(datum.toISOString());
  });

  it('verandert niets als een andere poging dan de laatste zou worden', async () => {
    const id = ids.monsters[2025][4];
    // Twee pogingen zonder datum: de nieuwste is de laatste. Krijgt die een datum,
    // dan schuift de andere naar boven. Dan dus niets aanpassen.
    const eerste = await prisma.sampleAttempt.create({ data: { oilSampleId: id, isTaken: false, createdAt: new Date(Date.UTC(2025, 5, 1)) } });
    const tweede = await prisma.sampleAttempt.create({ data: { oilSampleId: id, isTaken: false, createdAt: new Date(Date.UTC(2025, 5, 2)) } });
    await prisma.oilSample.update({ where: { id }, data: { isTaken: true, sampleDate: new Date(Date.UTC(2025, 5, 3)) } });
    await voerUit();
    // De nieuwste (tweede) is een geplande hermonstering en blijft dat; de
    // eerste krijgt de genomen-gegevens (deel 3).
    const t = await prisma.sampleAttempt.findUniqueOrThrow({ where: { id: tweede.id } });
    expect(t.isTaken).toBe(false);
    expect(t.sampleDate).toBeNull();
    expect((await prisma.sampleAttempt.findUniqueOrThrow({ where: { id: eerste.id } })).isTaken).toBe(true);
  });

  it('een genomen monster zonder poging krijgt er een, met de gegevens van het monster', async () => {
    const id = ids.monsters[2026][7];
    await prisma.sampleAttempt.deleteMany({ where: { oilSampleId: id } });
    const datum = new Date(Date.UTC(2026, 4, 4));
    await prisma.oilSample.update({ where: { id }, data: { isTaken: true, sampleDate: datum, remarks: 'oud genomen', photoUrl: '/nepdata/potje-1.jpg' } });
    await voerUit();
    await voerUit();
    const pogingen = await prisma.sampleAttempt.findMany({ where: { oilSampleId: id } });
    expect(pogingen).toHaveLength(1);
    expect(pogingen[0]).toMatchObject({ isTaken: true, remarks: 'oud genomen', photoUrl: '/nepdata/potje-1.jpg' });
    // Monsters die niets hebben, krijgen geen lege poging.
    const leeg = await prisma.oilSample.findFirstOrThrow({ where: { isTaken: false, remarks: null, attempts: { none: {} }, sampleDate: null } });
    expect(await prisma.sampleAttempt.count({ where: { oilSampleId: leeg.id } })).toBe(0);
  });
});

describe('geplande hermonstering (zoals O-4005)', () => {
  it('de hermonstering blijft gepland, de vorige poging krijgt genomen en de datum', async () => {
    const id = ids.monsters[2025][8];
    await prisma.sampleAttempt.deleteMany({ where: { oilSampleId: id } });
    const datum = new Date(Date.UTC(2025, 3, 9));
    // Eerste poging zonder status (op main bijgewerkt via het monster), daarna een geplande hermonstering.
    const eerste = await prisma.sampleAttempt.create({ data: { oilSampleId: id, isTaken: false, createdAt: new Date(Date.UTC(2025, 3, 1)) } });
    const herm = await prisma.sampleAttempt.create({ data: { oilSampleId: id, isTaken: false, createdAt: new Date(Date.UTC(2025, 4, 1)) } });
    await prisma.oilSample.update({ where: { id }, data: { isTaken: true, sampleDate: datum } });
    await draaiMigratie();
    await draaiMigratie();
    const h = await prisma.sampleAttempt.findUniqueOrThrow({ where: { id: herm.id } });
    expect(h.isTaken).toBe(false);
    expect(h.sampleDate).toBeNull();
    const e = await prisma.sampleAttempt.findUniqueOrThrow({ where: { id: eerste.id } });
    expect(e.isTaken).toBe(true);
    expect(e.sampleDate?.toISOString()).toBe(datum.toISOString());
  });

  it('staat de vorige poging al op een andere datum, dan blijft alles staan', async () => {
    const id = ids.monsters[2025][9];
    const [vorige] = await prisma.sampleAttempt.findMany({ where: { oilSampleId: id } });
    await prisma.sampleAttempt.update({ where: { id: vorige.id }, data: { isTaken: false } });
    const herm = await prisma.sampleAttempt.create({ data: { oilSampleId: id, isTaken: false } });
    await prisma.oilSample.update({ where: { id }, data: { isTaken: true, sampleDate: new Date(Date.UTC(2025, 7, 1)) } });
    await draaiMigratie();
    expect((await prisma.sampleAttempt.findUniqueOrThrow({ where: { id: herm.id } })).isTaken).toBe(false);
    expect((await prisma.sampleAttempt.findUniqueOrThrow({ where: { id: vorige.id } })).isTaken).toBe(false);
  });
});
