// syncLatestAttemptToSample: de cachevelden op OilSample volgen de nieuwste poging.
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { syncLatestAttemptToSample } from '@/lib/sampleAttempts';
import { vulMetNepdata } from '@/prisma/nepdata';

let monsterId: number;

beforeEach(async () => {
  await vulMetNepdata(prisma);
  const m = await prisma.oilSample.create({
    data: {
      oNumber: 'O-TEST-1',
      analysisYear: 2026,
      location: 'Testlocatie',
      description: 'Testmonster',
      isTaken: false,
      isUnreachable: true,
      unreachableReason: 'Afzetting',
      cancelReason: 'blijft staan',
    },
  });
  monsterId = m.id;
});

describe('syncLatestAttemptToSample', () => {
  it('spiegelt de poging met de nieuwste datum', async () => {
    await prisma.sampleAttempt.createMany({
      data: [
        { oilSampleId: monsterId, sampleDate: new Date('2026-04-01'), isTaken: false, remarks: 'eerste', photoUrl: 'oud.jpg' },
        { oilSampleId: monsterId, sampleDate: new Date('2026-05-01'), isTaken: true, remarks: 'tweede', photoUrl: 'nieuw.jpg', partPhotoUrl: 'onderdeel.jpg' },
      ],
    });
    await syncLatestAttemptToSample(monsterId);
    const m = await prisma.oilSample.findUniqueOrThrow({ where: { id: monsterId } });
    expect(m.isTaken).toBe(true);
    expect(m.remarks).toBe('tweede');
    expect(m.photoUrl).toBe('nieuw.jpg');
    expect(m.partPhotoUrl).toBe('onderdeel.jpg');
    expect(m.sampleDate?.toISOString()).toBe('2026-05-01T00:00:00.000Z');
  });

  it('bij gelijke datum telt de laatst aangemaakte', async () => {
    const datum = new Date('2026-04-01');
    await prisma.sampleAttempt.create({ data: { oilSampleId: monsterId, sampleDate: datum, remarks: 'eerst' } });
    await prisma.sampleAttempt.create({ data: { oilSampleId: monsterId, sampleDate: datum, remarks: 'later', createdAt: new Date(Date.now() + 1000) } });
    await syncLatestAttemptToSample(monsterId);
    const m = await prisma.oilSample.findUniqueOrThrow({ where: { id: monsterId } });
    expect(m.remarks).toBe('later');
  });

  it('zonder pogingen gaat alles terug naar leeg en niet genomen', async () => {
    await prisma.oilSample.update({ where: { id: monsterId }, data: { isTaken: true, remarks: 'x', photoUrl: 'y' } });
    await syncLatestAttemptToSample(monsterId);
    const m = await prisma.oilSample.findUniqueOrThrow({ where: { id: monsterId } });
    expect(m.isTaken).toBe(false);
    expect(m.remarks).toBeNull();
    expect(m.photoUrl).toBeNull();
    expect(m.sampleDate).toBeNull();
  });

  it('laat de velden van annuleren en niet bereikbaar ongemoeid', async () => {
    await prisma.sampleAttempt.create({ data: { oilSampleId: monsterId, sampleDate: new Date(), isTaken: true } });
    await syncLatestAttemptToSample(monsterId);
    const m = await prisma.oilSample.findUniqueOrThrow({ where: { id: monsterId } });
    expect(m.isUnreachable).toBe(true);
    expect(m.unreachableReason).toBe('Afzetting');
    expect(m.cancelReason).toBe('blijft staan');
  });
});
