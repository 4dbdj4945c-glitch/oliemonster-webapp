import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { tabelOntbreekt } from './kolommen';
import { LIJST_SELECT } from './monsterLijst';

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
/** Het monster zoals de update het teruggeeft als om de lijstvorm gevraagd is. */
export type SpiegelRij = Prisma.OilSampleGetPayload<{ select: typeof LIJST_SELECT }>;

async function spiegel(
  oilSampleId: number,
  latest: CacheBron,
  extra: Prisma.OilSampleUpdateInput = {},
  lijstRij = false
): Promise<SpiegelRij | null> {
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
    // Met lijstRij geeft dezelfde update het monster terug in de vorm van de
    // lijst (lib/monsterLijst.ts): geen aparte query meer om het op te halen.
    if (lijstRij) {
      return await prisma.oilSample.update({ where: { id: oilSampleId }, data: { ...extra, ...data }, select: LIJST_SELECT });
    }
    await prisma.oilSample.update({
      where: { id: oilSampleId },
      data: { ...extra, ...data },
      select: { id: true },
    });
    return null;
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
    return null;
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
export async function syncLatestAttemptToSample(oilSampleId: number, extra: Prisma.OilSampleUpdateInput = {}, lijstRij = false) {
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
  return spiegel(oilSampleId, latest, extra, lijstRij);
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
/** Wat wijzigLaatstePoging van de laatste poging nodig heeft (LAATSTE_POGING_SELECT). */
export const LAATSTE_POGING_SELECT = { id: true, sampleDate: true, photoUrl: true, partPhotoUrl: true, remarks: true, isTaken: true } as const;
type LaatstePoging = {
  id: number;
  sampleDate: Date | null;
  photoUrl: string | null;
  partPhotoUrl: string | null;
  remarks: string | null;
  isTaken: boolean;
};

export async function wijzigLaatstePoging(
  oilSampleId: number,
  wijziging: PogingVelden | ((vorige: Required<PogingVelden>) => PogingVelden),
  extra: Prisma.OilSampleUpdateInput = {},
  opties: {
    /** De laatste poging als de route hem al heeft (null: er is er geen); anders zoeken we hem op. */
    laatste?: LaatstePoging | null;
    /** Het bijgewerkte monster in de vorm van de lijst teruggeven (`monster`). */
    lijstRij?: boolean;
  } = {}
): Promise<{ attemptId: number | null; vorige: Required<PogingVelden> | null; wijziging: PogingVelden; monster: SpiegelRij | null }> {
  const lijstRij = opties.lijstRij ?? false;
  const laatste =
    opties.laatste !== undefined
      ? opties.laatste
      : await prisma.sampleAttempt.findFirst({
          where: { oilSampleId },
          orderBy: NIEUWSTE_EERST,
          select: LAATSTE_POGING_SELECT,
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
    const monster =
      w.sampleDate === undefined || zelfdeTijd(w.sampleDate, vorige.sampleDate)
        ? await spiegel(oilSampleId, bijgewerkt, extra, lijstRij)
        : await syncLatestAttemptToSample(oilSampleId, extra, lijstRij);
    return { attemptId: id, vorige, wijziging: w, monster };
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
    const rij = await spiegel(oilSampleId, null, extra, lijstRij);
    return { attemptId: null, vorige: monster, wijziging: w, monster: rij };
  }
  const poging = await prisma.sampleAttempt.create({
    data: { oilSampleId, ...nieuw, isTaken: nieuw.isTaken ?? false },
    select: { id: true, sampleDate: true, photoUrl: true, partPhotoUrl: true, remarks: true, isTaken: true },
  });
  // Er was geen poging, dus deze nieuwe is de laatste.
  const rij = await spiegel(oilSampleId, poging, extra, lijstRij);
  return { attemptId: poging.id, vorige: monster, wijziging: w, monster: rij };
}
