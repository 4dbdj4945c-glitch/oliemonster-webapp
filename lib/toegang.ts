// Toegangscontrole die alle API-routes delen: de sessie ophalen, de rol
// alleen lezen weigeren, admin eisen, en uitzoeken welk analysejaar een kijker
// mag zien. Staat los van lib/prospectApi.ts en lib/planningApi.ts, omdat het
// voor elke module geldt en niet alleen voor de acquisitie of de planning.
//
// De regel: de rol alleen lezen mag niets wijzigen en mag buiten de
// oliemonstermodule niets ophalen. Dat wordt hier serverside afgedwongen, niet
// alleen in de schermen.

import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { sessionOptions, SessionData } from './session';
import { isAlleenLezen, OUD_KIJKJAAR, ROLE_ADMIN, ROLE_VIEWER_OIL2025_OUD } from './roles';
import { tabelOntbreekt } from './kolommen';

export async function haalSessie(): Promise<SessionData> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

/** Niet ingelogd: 401. Anders null. */
export function sessieFout(session: SessionData): NextResponse | null {
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }
  return null;
}

/**
 * De poortwachter voor alles buiten de oliemonsterlijst: niet ingelogd geeft 401,
 * de rol alleen lezen geeft 403. Zet `adminNodig` op true bij elke route die
 * schrijft.
 */
export function toegangsFout(session: SessionData, adminNodig: boolean): NextResponse | null {
  const fout = sessieFout(session);
  if (fout) return fout;
  if (isAlleenLezen(session.role)) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
  }
  if (adminNodig && session.role !== ROLE_ADMIN) {
    return NextResponse.json({ error: 'Alleen admins kunnen dit wijzigen' }, { status: 403 });
  }
  return null;
}

/**
 * Voor de oliemonsterroutes die een kijker wél mag ophalen. Niet ingelogd geeft
 * 401; de rol alleen lezen komt er bij een leesactie langs, maar nooit bij iets
 * dat schrijft.
 */
export function leesToegangsFout(session: SessionData): NextResponse | null {
  return sessieFout(session);
}

/**
 * Welk analysejaar mag deze gebruiker zien? null = alle jaren.
 *
 * Alleen de rol alleen lezen is beperkt; admin en gewone gebruikers zien alles.
 * De waarde komt uit de database en niet uit de sessie, zodat een wijziging in
 * het gebruikersbeheer direct geldt en niet pas na opnieuw inloggen.
 */
export async function kijkjaar(session: SessionData): Promise<number | null> {
  if (!isAlleenLezen(session.role)) return null;
  // De oude kijkersrol hoort bij 2025; dat blijft gelden tot het migratiescript
  // gedraaid is.
  const terugval = session.role === ROLE_VIEWER_OIL2025_OUD ? OUD_KIJKJAAR : null;
  if (!session.userId) return terugval;
  try {
    const gebruiker = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { viewYear: true },
    });
    return gebruiker?.viewYear ?? terugval;
  } catch (error) {
    // Kolom staat er nog niet (db push nog niet gedraaid): houd de oude grens aan.
    if (tabelOntbreekt(error)) return terugval;
    throw error;
  }
}
