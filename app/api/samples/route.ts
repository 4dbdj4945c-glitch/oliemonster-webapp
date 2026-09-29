import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { isAlleenLezen } from '@/lib/roles';
import {
  tabelOntbreekt,
  SAMPLE_BASIS_SELECT,
  SAMPLE_PLANNING_SELECT,
  SAMPLE_VOL_SELECT,
  SAMPLE_PLANNING_LEEG,
  SAMPLE_WENSEN2_LEEG,
} from '@/lib/planningApi';

// GET - Lijst van alle samples (met optionele zoekfunctie en analysisYear-filter)
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    // De beperkte kijker mag uitsluitend 2025 zien; forceer dat serverside,
    // ongeacht welk jaar er in de query staat.
    const year = isAlleenLezen(session.role) ? '2025' : searchParams.get('year');

    const yearFilter = year ? { analysisYear: parseInt(year) } : {};

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
    // Draait een van de db-push-scripts nog niet, dan bestaan die kolommen nog
    // niet in de database. Daarom vallen we in twee stappen terug, zodat er
    // telkens zo veel mogelijk blijft werken: eerst zonder de velden van
    // wensenronde 2, daarna zonder die van de planning.
    const extra = {
      _count: { select: { attempts: true } },
      object: { select: { id: true, name: true, objectType: true } },
    } as const;
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

    // Exposeer attemptsCount als top-level veld voor de UI.
    const response = samples.map(({ _count, ...rest }) => ({
      ...rest,
      attemptsCount: _count.attempts,
    }));

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching samples:', error);
    return NextResponse.json({ error: 'Fout bij ophalen van monsters' }, { status: 500 });
  }
}

// POST - Nieuw sample toevoegen (alleen admin)
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Alleen admins kunnen monsters toevoegen' }, { status: 403 });
    }

    const body = await request.json();
    const { oNumber, sampleDate, location, description, oilType, remarks, isTaken, analysisYear, objectId } = body;

    if (!oNumber || !location || !description || isTaken === undefined) {
      return NextResponse.json(
        { error: 'O-nummer, locatie en omschrijving zijn verplicht' },
        { status: 400 }
      );
    }

    if (isTaken && !sampleDate) {
      return NextResponse.json(
        { error: 'Datum is verplicht voor genomen monsters' },
        { status: 400 }
      );
    }

    // Object: leeg betekent geen object; onzin geeft een nette melding, geen 500.
    let gelezenObjectId: number | null = null;
    if (objectId !== undefined && objectId !== null && objectId !== '') {
      gelezenObjectId = parseInt(String(objectId));
      if (Number.isNaN(gelezenObjectId)) {
        return NextResponse.json({ error: 'Onbekend object' }, { status: 400 });
      }
    }

    // O-nummers zijn uniek per analyse-jaar (2025 en 2026 mogen hetzelfde nummer hebben)
    const jaar = analysisYear ?? 2025;
    const existing = await prisma.oilSample.findFirst({ where: { oNumber, analysisYear: jaar } });
    if (existing) {
      return NextResponse.json({ error: `O-nummer bestaat al in ${jaar}` }, { status: 400 });
    }

    const sample = await prisma.oilSample.create({
      data: {
        oNumber,
        analysisYear: analysisYear ?? 2025,
        sampleDate: sampleDate ? new Date(sampleDate) : null,
        location,
        description,
        oilType: oilType || null,
        remarks: remarks || null,
        isTaken,
        // Alleen meesturen als de pagina een object koos; anders raken we de
        // kolom niet aan en werkt dit ook zolang db push nog niet gedraaid is.
        ...(objectId === undefined ? {} : { objectId: gelezenObjectId }),
      },
      select: SAMPLE_BASIS_SELECT,
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CREATE_SAMPLE,
      details: { oNumber, location, isTaken, analysisYear: analysisYear ?? 2025 },
      request,
    });

    return NextResponse.json(sample, { status: 201 });
  } catch (error) {
    console.error('Error creating sample:', error);
    return NextResponse.json({ error: 'Fout bij aanmaken van monster' }, { status: 500 });
  }
}
