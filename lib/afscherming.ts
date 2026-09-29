// Afscherming per klant en per jaar, op één plek. Alleen op de server.
//
// Een kijker (rol alleen lezen) ziet:
// - met een klant (sessie.klantId): alleen de monsters, objecten, installaties,
//   planning, foto's en documenten van die klant;
// - met een kijkjaar (sessie.viewYear): daarbinnen alleen dat jaar;
// - zonder klant: het oude gedrag, alleen zijn jaar (zoals voor fase 3).
// Admin en gebruiker zien alles (klantId en viewYear zijn bij hen altijd null,
// zie haalGebruiker in lib/toegang.ts).
//
// Bij welke klant hoort een monster? Bij de klant van zijn object. Een monster
// zonder object (oude regels met alleen een locatie) heeft een eigen
// OilSample.klantId. Heeft het monster een object, dan telt alleen de klant
// van het object: een achtergebleven klantId op het monster doet dan niets.
//
// Elke route die een kijker toelaat, filtert met monsterFilter() of controleert
// een los monster met magMonsterZien(). Een id in de URL dat bij een andere
// klant hoort, geeft een 404, alsof het niet bestaat.

import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { actiefFilter } from './verwijderdeMonsters';
import type { Gebruiker } from './toegang';

type Wie = Pick<Gebruiker, 'klantId' | 'viewYear'>;

/** De monsters van één klant: via het object, of zonder object via het monster zelf. */
export function monstersVanKlant(klantId: number): Prisma.OilSampleWhereInput {
  return { OR: [{ object: { klantId } }, { objectId: null, klantId }] };
}

/**
 * Het filter op monsters voor deze gebruiker: klant en jaar, plus de
 * prullenbak eruit. Voor admin en gebruiker alleen de prullenbak.
 * `jaar` is het jaar waar de pagina om vraagt; het kijkjaar gaat altijd voor.
 */
export async function monsterFilter(wie: Wie, jaar?: number | null): Promise<Prisma.OilSampleWhereInput> {
  const effectiefJaar = wie.viewYear ?? jaar ?? null;
  return {
    ...(effectiefJaar !== null ? { analysisYear: effectiefJaar } : {}),
    ...(await actiefFilter()),
    ...(wie.klantId ? monstersVanKlant(wie.klantId) : {}),
  };
}

/** De objecten die deze gebruiker mag zien. */
export function objectFilter(wie: Pick<Gebruiker, 'klantId'>): Prisma.SampleObjectWhereInput {
  return wie.klantId ? { klantId: wie.klantId } : {};
}

/** Mag deze gebruiker dit jaar zien? */
export function magJaar(wie: Pick<Gebruiker, 'viewYear'>, jaar: number): boolean {
  return wie.viewYear === null || wie.viewYear === jaar;
}

/** Mag deze gebruiker gegevens van deze klant zien? */
export function magKlant(wie: Pick<Gebruiker, 'klantId'>, klantId: number | null | undefined): boolean {
  if (!wie.klantId) return true;
  return klantId === wie.klantId;
}

/** Mag deze gebruiker dit monster zien (klant, jaar, niet in de prullenbak)? */
export async function magMonsterZien(wie: Wie, monsterId: number): Promise<boolean> {
  const gevonden = await prisma.oilSample.findFirst({
    where: { id: monsterId, ...(await monsterFilter(wie)) },
    select: { id: true },
  });
  return gevonden !== null;
}
