import type { Prisma } from '@prisma/client';
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

/** Wat er van de laatste poging op het monster gespiegeld wordt. */
type CacheBron = {
  sampleDate: Date | null;
  photoUrl: string | null;
  partPhotoUrl?: string | null;
  remarks: string | null;
  isTaken: boolean;
} | null;

/**
 * Zet de cachevelden van het monster op die van de laatste poging (of leeg als
 * er geen poging meer is), samen met `extra`: andere velden van het monster
 * die in dezelfde update mee kunnen (bijvoorbeeld Niet bereikbaar wissen).
 */
async function spiegel(oilSampleId: number, latest: CacheBron, extra: Prisma.OilSampleUpdateInput = {}) {
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
      data: { ...extra, ...data },
      select: { id: true },
    });
  } catch (error) {
    if (!tabelOntbreekt(error)) throw error;
    // Kolom partPhotoUrl staat er nog niet: de rest wel bijwerken.
    await prisma.oilSample.update({
      where: { id: oilSampleId },
      data: {
        ...extra,
        sampleDate: data.sampleDate,
        photoUrl: data.photoUrl,
        remarks: data.remarks,
        isTaken: data.isTaken,
      },
      select: { id: true },
    });
  }
}

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
 * hermonstering bijkomt. Met `extra` gaan andere velden van het monster in
 * dezelfde update mee.
 */
export async function syncLatestAttemptToSample(oilSampleId: number, extra: Prisma.OilSampleUpdateInput = {}) {
  let latest: CacheBron;
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
  await spiegel(oilSampleId, latest, extra);
}

/** De velden van een monster die uit de laatste poging komen (de cache). */
export interface PogingVelden {
  sampleDate?: Date | null;
  photoUrl?: string | null;
  partPhotoUrl?: string | null;
  remarks?: string | null;
  isTaken?: boolean;
}

/** Dezelfde volgorde als syncLatestAttemptToSample: de nieuwste poging eerst. */
export const NIEUWSTE_EERST = [{ sampleDate: 'desc' as const }, { createdAt: 'desc' as const }];

const zelfdeTijd = (a: Date | null | undefined, b: Date | null) =>
  (a ?? null) === null ? b === null : b !== null && a!.getTime() === b.getTime();

/**
 * De enige manier om de cachevelden van een monster te wijzigen: via de laatste
 * poging, en daarna syncLatestAttemptToSample. Zo kan een volgende wijziging aan
 * de pogingen niets meer wissen dat alleen op het monster stond (dat was de
 * cachebug: een opmerking of foto die rechtstreeks op OilSample stond,
 * verdween bij de eerstvolgende hermonstering of pogingwijziging).
 *
 * Heeft het monster nog geen poging (oude monsters, of net aangemaakt), dan
 * komt er een, gevuld met wat er nu op het monster staat plus de wijziging.
 * Staat er dan nog helemaal niets in (geen datum, niet genomen, geen opmerking,
 * geen foto), dan maken we geen lege poging aan.
 *
 * `wijziging` mag ook een functie zijn van wat er stond (de laatste poging, of
 * zonder poging het monster), bijvoorbeeld om de bestaande datum te houden.
 * Met `extra` gaan andere velden van het monster in dezelfde update mee.
 *
 * Geeft de poging terug zoals hij was, zodat de route oude foto's kan opruimen.
 */
export async function wijzigLaatstePoging(
  oilSampleId: number,
  wijziging: PogingVelden | ((vorige: Required<PogingVelden>) => PogingVelden),
  extra: Prisma.OilSampleUpdateInput = {}
): Promise<{ attemptId: number | null; vorige: Required<PogingVelden> | null; wijziging: PogingVelden }> {
  const laatste = await prisma.sampleAttempt.findFirst({
    where: { oilSampleId },
    orderBy: NIEUWSTE_EERST,
    select: { id: true, sampleDate: true, photoUrl: true, partPhotoUrl: true, remarks: true, isTaken: true },
  });

  if (laatste) {
    const { id, ...vorige } = laatste;
    const w = typeof wijziging === 'function' ? wijziging(vorige) : wijziging;
    const bijgewerkt = await prisma.sampleAttempt.update({
      where: { id },
      data: w,
      select: { sampleDate: true, photoUrl: true, partPhotoUrl: true, remarks: true, isTaken: true },
    });
    // Blijft de datum gelijk, dan blijft deze poging de laatste: meteen
    // spiegelen, zonder de laatste opnieuw te zoeken.
    if (w.sampleDate === undefined || zelfdeTijd(w.sampleDate, vorige.sampleDate)) await spiegel(oilSampleId, bijgewerkt, extra);
    else await syncLatestAttemptToSample(oilSampleId, extra);
    return { attemptId: id, vorige, wijziging: w };
  }

  const monster = await prisma.oilSample.findUniqueOrThrow({
    where: { id: oilSampleId },
    select: { sampleDate: true, photoUrl: true, partPhotoUrl: true, remarks: true, isTaken: true },
  });
  const w = typeof wijziging === 'function' ? wijziging(monster) : wijziging;
  const nieuw = { ...monster, ...w };
  const leeg =
    !nieuw.isTaken && !nieuw.sampleDate && !nieuw.remarks && !nieuw.photoUrl && !nieuw.partPhotoUrl;
  if (leeg) {
    // Niets om te bewaren; het monster zelf ook leeg zetten, zodat het klopt.
    await spiegel(oilSampleId, null, extra);
    return { attemptId: null, vorige: monster, wijziging: w };
  }
  const poging = await prisma.sampleAttempt.create({
    data: { oilSampleId, ...nieuw, isTaken: nieuw.isTaken ?? false },
    select: { id: true, sampleDate: true, photoUrl: true, partPhotoUrl: true, remarks: true, isTaken: true },
  });
  // Er was geen poging, dus deze nieuwe is de laatste.
  await spiegel(oilSampleId, poging, extra);
  return { attemptId: poging.id, vorige: monster, wijziging: w };
}
