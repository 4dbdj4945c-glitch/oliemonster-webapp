import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, kijkjaar, leesToegangsFout, toegangsFout } from '@/lib/toegang';
import {
  tabelOntbreekt,
  SAMPLE_BASIS_SELECT,
  SAMPLE_PLANNING_SELECT,
  SAMPLE_VOL_SELECT,
  SAMPLE_PLANNING_LEEG,
  SAMPLE_WENSEN2_LEEG,
} from '@/lib/planningApi';
import { actiefFilter } from '@/lib/verwijderdeMonsters';

// GET - Lijst van alle samples (met optionele zoekfunctie en analysisYear-filter)
export async function GET(request: NextRequest) {
  // De monsterlijst is het enige dat de rol alleen lezen mag ophalen.
  const session = await haalSessie();
  const fout = leesToegangsFout(session);
  if (fout) return fout;

  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    // Heeft deze gebruiker een eigen kijkjaar, dan geldt dat jaar en niets
    // anders, ongeacht wat er in de query staat. Dat wordt hier serverside
    // afgedwongen en niet alleen in de schermen. null = alle jaren.
    const eigenJaar = await kijkjaar(session);
    const year = eigenJaar !== null ? String(eigenJaar) : searchParams.get('year');

    // Verwijderde monsters (prullenbak) ziet niemand in de lijst, ook de rol
    // alleen lezen niet; alleen een admin ziet ze via /api/samples/verwijderd.
    const yearFilter = { ...(year ? { analysisYear: parseInt(year) } : {}), ...(await actiefFilter()) };

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
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
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
    const existing = await prisma.oilSample.findFirst({
      where: { oNumber, analysisYear: jaar, ...(await actiefFilter()) },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: `O-nummer bestaat al in ${jaar}` }, { status: 400 });
    }
    // Staat dit nummer in de prullenbak, dan is het in de database nog bezet
    // (uniek per jaar). Een nieuw monster zou de oude pogingen en foto's
    // verbergen; terugzetten is dan de bedoeling. De pagina toont een knop.
    const inPrullenbak = await prisma.oilSample.findFirst({
      where: { oNumber, analysisYear: jaar },
      select: { id: true },
    });
    if (inPrullenbak) {
      return NextResponse.json(
        {
          error: `O-nummer ${oNumber} staat in ${jaar} in de prullenbak. Zet het daar terug, dan komen de pogingen, datums en foto's ook weer terug.`,
          inPrullenbak: inPrullenbak.id,
        },
        { status: 409 }
      );
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
