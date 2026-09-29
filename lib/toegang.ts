// Toegangscontrole voor alle API-routes, op één plek: withAuth.
//
//   export const GET = withAuth({ rol: 'user', module: 'acquisitie' }, async (request, context, sessie) => { ... });
//
// Bij elke aanvraag haalt withAuth de gebruiker uit de database (rol, kijkjaar,
// requiresPasswordChange). De cookie zegt alleen WIE je bent, niet wat je mag:
// een verwijderde gebruiker of een teruggezette rol geldt meteen, niet pas als
// de cookie na 30 dagen verloopt.
//
// De regels:
// - niet ingelogd, of de gebruiker bestaat niet meer: 401
// - moet eerst een wachtwoord instellen: 403 (proxy.ts dwingt dat ook af)
// - de rol alleen lezen mag UITSLUITEND lezen in de module oliemonsters, en
//   alleen de monsters van zijn eigen kijkjaar (sessie.viewYear)
// - rol 'admin' in de opties: alleen een admin
//
// De auth-routes zelf (inloggen, uitloggen, sessie, wachtwoord instellen,
// uitnodiging) gebruiken withAuth niet; die werken juist zonder volledige sessie.

import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { sessionOptions, SessionData } from './session';
import { isAlleenLezen, OUD_KIJKJAAR, ROLE_ADMIN, ROLE_VIEWER_OIL2025_OUD } from './roles';
import { tabelOntbreekt } from './kolommen';

export async function haalSessie() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

/** De melding als iemand eerst zijn wachtwoord moet instellen. */
export const EERST_WACHTWOORD = 'Stel eerst je wachtwoord in.';

/** De modules van de portal. Alleen oliemonsters is open voor de rol alleen lezen. */
export type Module =
  | 'oliemonsters'
  | 'planning'
  | 'objecten'
  | 'acquisitie'
  | 'controlerondes'
  | 'ultimo'
  | 'beheer';

/**
 * Wie mag erbij, van ruim naar streng:
 * - alleen_lezen: iedereen die ingelogd is, ook een kijker (alleen in module oliemonsters)
 * - user: iedereen behalve de rol alleen lezen
 * - admin: alleen admins (alles wat iets wijzigt)
 */
export type MinimaleRol = 'alleen_lezen' | 'user' | 'admin';

export interface ToegangsOpties {
  rol: MinimaleRol;
  module: Module;
  /** Eigen melding als een niet-admin een admin-actie probeert. */
  adminMelding?: string;
}

/** De gebruiker zoals hij NU in de database staat. */
export interface Gebruiker {
  userId: number;
  username: string;
  role: string;
  /** Het analysejaar dat deze gebruiker mag zien; null = alle jaren. */
  viewYear: number | null;
  requiresPasswordChange: boolean;
}

/** Wat een route van withAuth krijgt: een ingelogde gebruiker met volledige toegang. */
export interface Sessie extends Gebruiker {
  isLoggedIn: true;
}

/**
 * Het kijkjaar dat werkelijk geldt. Alleen de rol alleen lezen is beperkt; admin
 * en gewone gebruikers zien alles. De oude kijkersrol hoort bij 2025, ook als
 * er (nog) geen viewYear in de database staat.
 */
export function effectiefKijkjaar(role: string | null | undefined, viewYear: number | null | undefined): number | null {
  if (!isAlleenLezen(role)) return null;
  if (viewYear !== null && viewYear !== undefined) return viewYear;
  return role === ROLE_VIEWER_OIL2025_OUD ? OUD_KIJKJAAR : null;
}

/**
 * Zoekt de gebruiker bij de sessie op in de database. null als er geen sessie
 * is of de gebruiker niet meer bestaat.
 */
export async function haalGebruiker(session: SessionData): Promise<Gebruiker | null> {
  if (!session.isLoggedIn) return null;
  // Oude sessies zonder userId: terugvallen op de gebruikersnaam.
  const where = session.userId
    ? { id: session.userId }
    : session.username
      ? { username: session.username }
      : null;
  if (!where) return null;

  let rij: { id: number; username: string; role: string; viewYear?: number | null; requiresPasswordChange: boolean } | null;
  try {
    rij = await prisma.user.findUnique({
      where,
      select: { id: true, username: true, role: true, viewYear: true, requiresPasswordChange: true },
    });
  } catch (error) {
    // Kolom viewYear staat er nog niet (db nog niet bij): zonder kijkjaar verder.
    if (!tabelOntbreekt(error)) throw error;
    rij = await prisma.user.findUnique({
      where,
      select: { id: true, username: true, role: true, requiresPasswordChange: true },
    });
  }
  if (!rij) return null;
  return {
    userId: rij.id,
    username: rij.username,
    role: rij.role,
    viewYear: effectiefKijkjaar(rij.role, rij.viewYear),
    requiresPasswordChange: rij.requiresPasswordChange,
  };
}

/**
 * Het besluit zelf, zonder database: mag deze gebruiker dit? null = ja,
 * anders de status en het antwoord.
 */
export function toegangsBesluit(
  gebruiker: Gebruiker | null,
  opties: ToegangsOpties
): { status: number; body: { error: string; requiresPasswordChange?: true } } | null {
  if (!gebruiker) {
    return { status: 401, body: { error: 'Niet geautoriseerd' } };
  }
  if (gebruiker.requiresPasswordChange) {
    return { status: 403, body: { error: EERST_WACHTWOORD, requiresPasswordChange: true } };
  }
  if (isAlleenLezen(gebruiker.role)) {
    // Een kijker mag alleen lezen, en alleen in de oliemonstermodule.
    if (opties.rol !== 'alleen_lezen' || opties.module !== 'oliemonsters') {
      return { status: 403, body: { error: 'Geen toegang' } };
    }
    return null;
  }
  if (opties.rol === 'admin' && gebruiker.role !== ROLE_ADMIN) {
    return {
      status: 403,
      body: { error: opties.adminMelding ?? 'Alleen admins kunnen dit wijzigen' },
    };
  }
  return null;
}

/**
 * Omhult een route-handler met de toegangscontrole. De handler krijgt als derde
 * argument de sessie met de gegevens uit de database.
 */
export function withAuth<C = unknown>(
  opties: ToegangsOpties,
  handler: (request: NextRequest, context: C, sessie: Sessie) => Promise<Response> | Response
): (request: NextRequest, context: C) => Promise<Response> {
  return async (request, context) => {
    let gebruiker: Gebruiker | null;
    try {
      gebruiker = await haalGebruiker(await haalSessie());
    } catch (error) {
      console.error('Toegangscontrole mislukt:', error);
      return NextResponse.json({ error: 'Er ging iets mis bij het controleren van je sessie' }, { status: 500 });
    }
    const besluit = toegangsBesluit(gebruiker, opties);
    if (besluit || !gebruiker) {
      const b = besluit ?? { status: 401, body: { error: 'Niet geautoriseerd' } };
      return NextResponse.json(b.body, { status: b.status });
    }
    return handler(request, context, { ...gebruiker, isLoggedIn: true });
  };
}
