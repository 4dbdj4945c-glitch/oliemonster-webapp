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

    await prisma.$executeRawUnsafe(SQL);
    await prisma.$executeRawUnsafe(SQL); // vaker draaien doet niets extra

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
    await prisma.$executeRawUnsafe(SQL);
    expect((await prisma.sampleAttempt.findUniqueOrThrow({ where: { id: zonderDatum.id } })).remarks).toBe('alleen op het monster');
    await wijzigLaatstePoging(id, { isTaken: true, sampleDate: new Date() });
    expect((await prisma.oilSample.findUniqueOrThrow({ where: { id } })).remarks).toBe('alleen op het monster');
  });
});
