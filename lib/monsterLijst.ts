// Een monster zoals de monsterlijst (GET /api/samples) het geeft: alle velden,
// het object, het aantal pogingen en de foto's via de eigen fotoroute. De
// routes die een monster wijzigen (bewerken, status aantikken, Monster nemen)
// geven het bijgewerkte monster in precies deze vorm terug, zodat het scherm die
// ene regel kan vervangen in plaats van de hele lijst opnieuw op te halen.

import { prisma } from './prisma';
import {
  tabelOntbreekt,
  SAMPLE_BASIS_SELECT,
  SAMPLE_PLANNING_SELECT,
  SAMPLE_VOL_SELECT,
  SAMPLE_PLANNING_LEEG,
  SAMPLE_WENSEN2_LEEG,
} from './planningApi';
import { monsterFilter } from './afscherming';
import { metMonsterFotos } from './fotoAdres';
import { isAlleenLezen, krijgtKlantportaal } from './roles';
import type { Gebruiker } from './toegang';

/** Wat de lijst naast de velden van het monster zelf meeneemt. */
export const LIJST_EXTRA = {
  _count: { select: { attempts: true } },
  object: { select: { id: true, name: true, objectType: true } },
} as const;

export const LIJST_SELECT = { ...SAMPLE_VOL_SELECT, ...LIJST_EXTRA } as const;

/**
 * Wat een kijker (rol alleen lezen) niet krijgt: wie annuleerde of iets als niet
 * bereikbaar vastlegde (gebruikersnamen; main toonde die de kijker ook nergens).
 * De reden van annuleren:
 * - klassieke weergave (de Mourik-kijker): altijd, precies zoals op main, waar
 *   de lijst de reden toonde ongeacht de keuze voor de PDF;
 * - klantportaal: alleen als hij in de PDF mag (cancelReasonInPdf), dezelfde
 *   regel als het rapport voor de klant.
 */
export function voorKijker<T extends { cancelledBy?: string | null; unreachableBy?: string | null; cancelReason?: string | null; cancelReasonInPdf?: boolean }>(
  m: T,
  klantportaal: boolean
): T {
  const { cancelledBy: _a, unreachableBy: _b, ...rest } = m;
  void _a;
  void _b;
  if (!klantportaal) return rest as T;
  return { ...rest, cancelReason: m.cancelReasonInPdf === false ? null : m.cancelReason ?? null } as T;
}

type Wie = Pick<Gebruiker, 'role' | 'klantId' | 'portaalWeergave'>;

/**
 * Een rij uit de database (met `_count`) zoals de lijst hem geeft: attemptsCount
 * als veld, de foto's via /api/fotos/... (lib/fotoAdres.ts), nooit het echte
 * opslagadres, en voor een kijker zonder de velden die hij niet krijgt.
 */
export function alsLijstRij<T extends { id: number; _count: { attempts: number }; cancelledBy?: string | null; unreachableBy?: string | null; cancelReason?: string | null; cancelReasonInPdf?: boolean }>(
  rij: T,
  wie: Wie
) {
  const { _count, ...rest } = rij;
  const metFotos = metMonsterFotos(rest);
  return {
    ...(isAlleenLezen(wie.role) ? voorKijker(metFotos, krijgtKlantportaal(wie)) : metFotos),
    attemptsCount: _count.attempts,
  };
}

/** Eén monster in de vorm van de lijst, of null als het er niet (meer) is. */
export async function haalLijstRij(id: number, wie: Wie) {
  const rij = await prisma.oilSample.findFirst({ where: { id, deletedAt: null }, select: LIJST_SELECT });
  return rij ? alsLijstRij(rij, wie) : null;
}

/**
 * De monsterlijst (GET /api/samples) voor deze gebruiker: kijkjaar en klant
 * worden hier afgedwongen (lib/afscherming.ts), wat hij ook vraagt. Ook voor
 * de oliemonsterpagina zelf, die de lijst meteen meegeeft bij het openen.
 */
export async function haalMonsterLijst(wie: Wie & Pick<Gebruiker, 'viewYear'>, jaar: number | null, search: string) {
  const yearFilter = await monsterFilter(wie, jaar);

  const whereClause = search
    ? {
        AND: [
          yearFilter,
          {
            OR: [
              { oNumber: { contains: search, mode: 'insensitive' as const } },
              { location: { contains: search, mode: 'insensitive' as const } },
              { description: { contains: search, mode: 'insensitive' as const } },
            ],
          },
        ],
      }
    : yearFilter;

  // Alles erbij: het object, de tweede foto en de velden van Niet bereikbaar.
  // Staat de database nog niet bij, dan in twee stappen terugvallen, zodat er
  // telkens zo veel mogelijk blijft werken.
  const extra = LIJST_EXTRA;
  const zoek = { where: whereClause, orderBy: { sampleDate: 'desc' as const } };

  let samples;
  try {
    samples = await prisma.oilSample.findMany({
      ...zoek,
      select: { ...SAMPLE_VOL_SELECT, ...extra },
    });
  } catch (error) {
    if (!tabelOntbreekt(error)) throw error;
    try {
      const zonderWensen2 = await prisma.oilSample.findMany({
        ...zoek,
        select: { ...SAMPLE_PLANNING_SELECT, ...extra },
      });
      samples = zonderWensen2.map((s) => ({ ...s, ...SAMPLE_WENSEN2_LEEG }));
    } catch (tweede) {
      if (!tabelOntbreekt(tweede)) throw tweede;
      const oud = await prisma.oilSample.findMany({
        ...zoek,
        select: { ...SAMPLE_BASIS_SELECT, _count: { select: { attempts: true } } },
      });
      samples = oud.map((s) => ({ ...s, ...SAMPLE_PLANNING_LEEG, ...SAMPLE_WENSEN2_LEEG }));
    }
  }

  // attemptsCount als veld op het monster voor de schermen. De foto's gaan
  // via /api/fotos/... (lib/fotoAdres.ts), nooit het echte opslagadres.
  return samples.map((s) => alsLijstRij(s, wie));
}

/**
 * De analysejaren met monsters, met per jaar het aantal en hoeveel er genomen
 * zijn (geannuleerde tellen niet als genomen), voor wat deze gebruiker mag zien
 * (GET /api/samples/jaren).
 */
export async function haalMonsterJaren(wie: Pick<Gebruiker, 'klantId' | 'viewYear'>) {
  const where = await monsterFilter(wie);
  const [totaal, genomen] = await Promise.all([
    prisma.oilSample.groupBy({ by: ['analysisYear'], where, _count: { _all: true } }),
    prisma.oilSample.groupBy({
      by: ['analysisYear'],
      where: { ...where, isTaken: true, isDisabled: false },
      _count: { _all: true },
    }),
  ]);
  const genomenPerJaar = new Map(genomen.map((g) => [g.analysisYear, g._count._all]));
  return totaal
    .map((t) => ({ jaar: t.analysisYear, totaal: t._count._all, genomen: genomenPerJaar.get(t.analysisYear) ?? 0 }))
    .sort((a, b) => b.jaar - a.jaar);
}
