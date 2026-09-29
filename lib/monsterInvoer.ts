// Invoer van de monsterroutes: de zod-schema's en de controle van object en
// installatie. Gedeeld door POST /api/samples en PUT /api/samples/[id].

import { z } from 'zod';
import { prisma } from './prisma';
import { ApiFout, jaarSchema, optioneelId, optioneleDatum, optioneleTekst, tekst } from './apiRoute';

const VERPLICHT = 'O-nummer, locatie en omschrijving zijn verplicht';

export const MonsterSchema = z
  .object({
    oNumber: tekst(VERPLICHT, 100),
    location: tekst(VERPLICHT),
    description: tekst(VERPLICHT, 2000),
    sampleDate: optioneleDatum('De datum van de afname klopt niet'),
    oilType: optioneleTekst(200),
    remarks: optioneleTekst(),
    isTaken: z.boolean({ error: VERPLICHT }),
    analysisYear: jaarSchema.optional(),
    objectId: optioneelId('Onbekend object'),
    installatieId: optioneelId('Onbekende installatie'),
    // Alleen voor een monster zonder object: bij welke klant het hoort.
    klantId: optioneelId('Onbekende klant'),
  })
  .refine((d) => !d.isTaken || d.sampleDate, {
    error: 'Datum is verplicht voor genomen monsters',
    path: ['sampleDate'],
  });

export type MonsterInvoer = z.output<typeof MonsterSchema>;

/**
 * Een installatie mag alleen aan een monster als hij bestaat, niet verwijderd is
 * en op hetzelfde object staat als het monster.
 */
export async function controleerInstallatie(installatieId: number | null | undefined, objectId: number | null | undefined) {
  if (installatieId === undefined || installatieId === null) return;
  const installatie = await prisma.installatie.findFirst({
    where: { id: installatieId, deletedAt: null },
    select: { objectId: true },
  });
  if (!installatie) throw new ApiFout(400, 'Onbekende installatie');
  if (objectId !== installatie.objectId) {
    throw new ApiFout(400, 'Deze installatie hoort niet bij het gekozen object');
  }
}

/** Een object moet bestaan; anders een nette melding in plaats van een fout van de database. */
export async function controleerObject(objectId: number | null | undefined) {
  if (objectId === undefined || objectId === null) return;
  const object = await prisma.sampleObject.findUnique({ where: { id: objectId }, select: { id: true } });
  if (!object) throw new ApiFout(400, 'Onbekend object');
}

/**
 * Een monster dat zijn object verliest (object leeg gemaakt, locatie
 * losgekoppeld, object verwijderd) houdt de klant van dat object: die komt in
 * OilSample.klantId (zie lib/afscherming.ts). Anders ziet de kijker van die
 * klant het monster ineens niet meer. Een klant die er al staat blijft staan.
 * Roep dit aan VOORDAT objectId leeg wordt gemaakt.
 */
export async function bewaarKlantBijLoskoppelen(where: { id?: number | { in: number[] }; objectId?: number }) {
  const monsters = await prisma.oilSample.findMany({
    where: { ...where, objectId: where.objectId ?? { not: null }, klantId: null },
    select: { id: true, object: { select: { klantId: true } } },
  });
  const perKlant = new Map<number, number[]>();
  for (const m of monsters) {
    const k = m.object?.klantId;
    if (k) perKlant.set(k, [...(perKlant.get(k) ?? []), m.id]);
  }
  for (const [klantId, ids] of perKlant) {
    await prisma.oilSample.updateMany({ where: { id: { in: ids } }, data: { klantId } });
  }
}
