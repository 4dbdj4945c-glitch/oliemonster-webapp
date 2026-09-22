// Kleine helpers die alle API-routes van de module Acquisitie delen:
// sessiecontrole, rolcontrole en een nette melding als de tabellen nog niet
// in de database staan (dan is `prisma db push` nog niet gedraaid).

import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, SessionData } from './session';
import { isOilViewer2025 } from './roles';
import { isProspectStatus, BENADER_KANALEN } from './prospects';

export async function haalSessie(): Promise<SessionData> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}

/**
 * Geeft een foutantwoord terug als de gebruiker niet mag, anders null.
 * `adminNodig` zet je op true bij alles wat schrijft.
 */
export function toegangsFout(session: SessionData, adminNodig: boolean): NextResponse | null {
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }
  if (isOilViewer2025(session.role)) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
  }
  if (adminNodig && session.role !== 'admin') {
    return NextResponse.json({ error: 'Alleen admins kunnen dit wijzigen' }, { status: 403 });
  }
  return null;
}

export const TABEL_ONTBREEKT =
  'De acquisitietabellen staan nog niet in de database. Draai db-push-acquisitie.sh in de projectmap en ververs deze pagina.';

/** Herkent de Prisma-fout die je krijgt als de tabel nog niet bestaat. */
export function tabelOntbreekt(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  if (e?.code === 'P2021' || e?.code === 'P2022') return true;
  return typeof e?.message === 'string' && /does not exist in the current database|relation ".*" does not exist/i.test(e.message);
}

/** Standaard foutantwoord: 503 met uitleg als de tabel ontbreekt, anders 500. */
export function foutAntwoord(error: unknown, melding: string): NextResponse {
  if (tabelOntbreekt(error)) {
    return NextResponse.json({ error: TABEL_ONTBREEKT, tabelOntbreekt: true }, { status: 503 });
  }
  console.error(melding, error);
  return NextResponse.json({ error: melding }, { status: 500 });
}

/* ---------- Velden uit een request-body halen ---------- */

const TEKST_VELDEN = [
  'bedrijfsnaam', 'segment', 'plaats', 'provincie', 'website', 'telefoon', 'email',
  'contactpersoon', 'functie', 'linkedin', 'omvang', 'activiteit', 'aanknopingspunt',
  'signaal', 'bron', 'scoreReden', 'volgendeActie', 'notities',
] as const;

const DATUM_VELDEN = ['volgendeActieOp', 'laatsteContactOp', 'afgemeldOp'] as const;

export interface ProspectData {
  [veld: string]: string | number | boolean | Date | null;
}

/**
 * Leest de velden van een prospect uit de body. Bij `nieuw` zijn bedrijfsnaam en
 * plaats verplicht; bij een wijziging worden alleen de meegestuurde velden gezet,
 * zodat de pagina ook één veld (bijvoorbeeld de status) kan bijwerken.
 */
export function bouwProspectData(
  body: Record<string, unknown>,
  nieuw: boolean
): { data: ProspectData } | { fout: string } {
  const data: ProspectData = {};

  for (const veld of TEKST_VELDEN) {
    if (!(veld in body)) continue;
    const waarde = body[veld];
    const tekst = typeof waarde === 'string' ? waarde.trim() : '';
    if ((veld === 'bedrijfsnaam' || veld === 'plaats') && !tekst) {
      return { fout: 'Bedrijfsnaam en plaats zijn verplicht' };
    }
    data[veld] = tekst === '' ? null : tekst;
  }

  if (nieuw && (!data.bedrijfsnaam || !data.plaats)) {
    return { fout: 'Bedrijfsnaam en plaats zijn verplicht' };
  }

  if ('score' in body) {
    const n = getal(body.score);
    if (n !== null && (n < 1 || n > 5)) return { fout: 'Score moet tussen 1 en 5 liggen' };
    data.score = n === null ? null : Math.round(n);
  }

  if ('afstandKm' in body) {
    const n = getal(body.afstandKm);
    data.afstandKm = n !== null && n >= 0 ? n : null;
  }

  if ('geschatteWaarde' in body) {
    const n = getal(body.geschatteWaarde);
    data.geschatteWaarde = n !== null && n >= 0 ? Math.round(n) : null;
  }

  for (const veld of DATUM_VELDEN) {
    if (!(veld in body)) continue;
    const waarde = body[veld];
    if (!waarde || typeof waarde !== 'string') { data[veld] = null; continue; }
    const datum = new Date(waarde);
    data[veld] = Number.isNaN(datum.getTime()) ? null : datum;
  }

  if ('archief' in body) data.archief = body.archief === true;

  if ('kanaal' in body) {
    const kanaal = body.kanaal;
    if (typeof kanaal !== 'string' || !(BENADER_KANALEN as readonly string[]).includes(kanaal)) {
      return { fout: 'Kies mail of LinkedIn als kanaal' };
    }
    data.kanaal = kanaal;
  }

  if ('status' in body) {
    const status = body.status;
    if (typeof status !== 'string' || !isProspectStatus(status)) {
      return { fout: 'Onbekende status' };
    }
    data.status = status;
  }

  return { data };
}

function getal(waarde: unknown): number | null {
  if (waarde === null || waarde === undefined || waarde === '') return null;
  const n = typeof waarde === 'number' ? waarde : parseFloat(String(waarde).replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}
