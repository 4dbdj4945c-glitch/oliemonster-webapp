import { prisma } from './prisma';

/**
 * Synchroniseer de cache-velden op OilSample met de meest recente poging.
 * "Meest recent" = hoogste sampleDate; bij gelijkspel hoogste createdAt.
 *
 * - Is er géén poging meer over → reset velden naar null en isTaken=false.
 * - Is er wel een poging → spiegel sampleDate / photoUrl / remarks / isTaken.
 */
export async function syncLatestAttemptToSample(oilSampleId: number) {
  const latest = await prisma.sampleAttempt.findFirst({
    where: { oilSampleId },
    orderBy: [
      { sampleDate: 'desc' },
      { createdAt: 'desc' },
    ],
  });

  if (!latest) {
    await prisma.oilSample.update({
      where: { id: oilSampleId },
      data: {
        sampleDate: null,
        photoUrl: null,
        remarks: null,
        isTaken: false,
      },
    });
    return;
  }

  await prisma.oilSample.update({
    where: { id: oilSampleId },
    data: {
      sampleDate: latest.sampleDate,
      photoUrl: latest.photoUrl,
      remarks: latest.remarks,
      isTaken: latest.isTaken,
    },
  });
}
