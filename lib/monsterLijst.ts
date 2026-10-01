// Een monster zoals de monsterlijst (GET /api/samples) het geeft: alle velden,
// het object, het aantal pogingen en de foto's via de eigen fotoroute. De
// routes die een monster wijzigen (bewerken, status aantikken, Monster nemen)
// geven het bijgewerkte monster in precies deze vorm terug, zodat het scherm die
// ene regel kan vervangen in plaats van de hele lijst opnieuw op te halen.

import { prisma } from './prisma';
import { SAMPLE_VOL_SELECT } from './planningApi';
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
