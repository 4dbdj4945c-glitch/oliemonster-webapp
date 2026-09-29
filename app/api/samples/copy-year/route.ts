import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { tabelOntbreekt } from '@/lib/planningApi';
import { actiefFilter } from '@/lib/verwijderdeMonsters';

// POST - Neem de te nemen monsters van een vorig analyse-jaar over naar een nieuw jaar (alleen admin).
// Body: { fromYear: 2025, toYear: 2026 }
// Alle monsters uit fromYear, ook de daar geannuleerde, worden als "gepland" (niet genomen,
// niet geannuleerd, zonder datum, foto of opmerking) aangemaakt in toYear. O-nummers die in toYear al bestaan worden overgeslagen.
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Alleen admins kunnen monsters overnemen' }, { status: 403 });
    }

    const body = await request.json();
    const fromYear = Number(body.fromYear);
    const toYear = Number(body.toYear);
    if (!Number.isInteger(fromYear) || !Number.isInteger(toYear) || fromYear === toYear) {
      return NextResponse.json({ error: 'Ongeldig bron- of doeljaar' }, { status: 400 });
    }

    // Objecten zijn jaaroverstijgend: dezelfde sluis komt elk jaar terug. Neem de
    // koppeling dus mee, anders staat de planning van het nieuwe jaar leeg.
    // Zolang ./db-push-planning.sh nog niet gedraaid is bestaat de kolom niet;
    // dan halen we alleen de oude velden op.
    let bron: { oNumber: string; location: string; description: string; oilType: string | null; objectId?: number | null }[];
    try {
      bron = await prisma.oilSample.findMany({
        where: { analysisYear: fromYear, ...(await actiefFilter()) },
        select: { oNumber: true, location: true, description: true, oilType: true, objectId: true },
        orderBy: { oNumber: 'asc' },
      });
    } catch (error) {
      if (!tabelOntbreekt(error)) throw error;
      bron = await prisma.oilSample.findMany({
        where: { analysisYear: fromYear, ...(await actiefFilter()) },
        select: { oNumber: true, location: true, description: true, oilType: true },
        orderBy: { oNumber: 'asc' },
      });
    }

    // Hier bewust ook de monsters in de prullenbak: hun O-nummer is in de
    // database nog bezet, dus overnemen zou op de unieke sleutel stuklopen.
    const bestaand = await prisma.oilSample.findMany({
      where: { analysisYear: toYear },
      select: { oNumber: true },
    });
    const alAanwezig = new Set(bestaand.map((s) => s.oNumber));

    const nieuw = bron.filter((s) => !alAanwezig.has(s.oNumber));

    if (nieuw.length > 0) {
      await prisma.oilSample.createMany({
        data: nieuw.map((s) => ({
          oNumber: s.oNumber,
          analysisYear: toYear,
          location: s.location,
          description: s.description,
          oilType: s.oilType,
          isTaken: false,
          isDisabled: false,
          ...(s.objectId === undefined ? {} : { objectId: s.objectId }),
        })),
      });
    }

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.COPY_SAMPLES,
      details: { fromYear, toYear, overgenomen: nieuw.length, overgeslagen: bron.length - nieuw.length },
      request,
    });

    return NextResponse.json({
      overgenomen: nieuw.length,
      overgeslagen: bron.length - nieuw.length,
      bron: bron.length,
    });
  } catch (error) {
    console.error('Error copying samples:', error);
    return NextResponse.json({ error: 'Fout bij overnemen van monsters' }, { status: 500 });
  }
}
