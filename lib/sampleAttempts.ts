import { prisma } from './prisma';
import { tabelOntbreekt } from './kolommen';

/**
 * De velden van een poging zoals die bestonden vóór wensenronde 2. Zolang
 * ./db-push-wensen2.sh nog niet gedraaid is, bestaat partPhotoUrl niet in de
 * database; met deze select blijft de pogingenlijst gewoon werken.
 */
export const ATTEMPT_BASIS_SELECT = {
  id: true,
  oilSampleId: true,
  sampleDate: true,
  photoUrl: true,
  remarks: true,
  isTaken: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Synchroniseer de cache-velden op OilSample met de meest recente poging.
 * "Meest recent" = hoogste sampleDate; bij gelijkspel hoogste createdAt.
 *
 * - Is er géén poging meer over → reset velden naar null en isTaken=false.
 * - Is er wel een poging → spiegel sampleDate / photoUrl / partPhotoUrl /
 *   remarks / isTaken.
 *
 * De velden van het annuleren en van Niet bereikbaar blijven hier buiten: die
 * horen bij het monster zelf en zouden anders verdwijnen zodra er een
 * hermonstering bijkomt.
 */
export async function syncLatestAttemptToSample(oilSampleId: number) {
  let latest: {
    sampleDate: Date | null;
    photoUrl: string | null;
    partPhotoUrl?: string | null;
    remarks: string | null;
    isTaken: boolean;
  } | null;
  try {
    latest = await prisma.sampleAttempt.findFirst({
      where: { oilSampleId },
      orderBy: [{ sampleDate: 'desc' }, { createdAt: 'desc' }],
      select: { sampleDate: true, photoUrl: true, partPhotoUrl: true, remarks: true, isTaken: true },
    });
  } catch (error) {
    if (!tabelOntbreekt(error)) throw error;
    latest = await prisma.sampleAttempt.findFirst({
      where: { oilSampleId },
      orderBy: [{ sampleDate: 'desc' }, { createdAt: 'desc' }],
      select: { sampleDate: true, photoUrl: true, remarks: true, isTaken: true },
    });
  }

  const data = latest
    ? {
        sampleDate: latest.sampleDate,
        photoUrl: latest.photoUrl,
        partPhotoUrl: latest.partPhotoUrl ?? null,
        remarks: latest.remarks,
        isTaken: latest.isTaken,
      }
    : {
        sampleDate: null,
        photoUrl: null,
        partPhotoUrl: null,
        remarks: null,
        isTaken: false,
      };

  try {
    await prisma.oilSample.update({
      where: { id: oilSampleId },
      data,
      select: { id: true },
    });
  } catch (error) {
    if (!tabelOntbreekt(error)) throw error;
    // Kolom partPhotoUrl staat er nog niet: de rest wel bijwerken.
    await prisma.oilSample.update({
      where: { id: oilSampleId },
      data: {
        sampleDate: data.sampleDate,
        photoUrl: data.photoUrl,
        remarks: data.remarks,
        isTaken: data.isTaken,
      },
      select: { id: true },
    });
  }
}
