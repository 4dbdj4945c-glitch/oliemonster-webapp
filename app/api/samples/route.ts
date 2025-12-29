import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { createAuditLog, AuditActions } from '@/lib/auditLog';

// GET - Lijst van alle samples (met optionele zoekfunctie)
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json(
        { error: 'Niet geautoriseerd' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    let samples;

    if (search) {
      // Zoek in o-nummer, locatie, of omschrijving (case-insensitive)
      samples = await prisma.oilSample.findMany({
        where: {
          OR: [
            { oNumber: { contains: search, mode: 'insensitive' } },
            { location: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        },
        orderBy: { sampleDate: 'desc' },
      });
    } else {
      samples = await prisma.oilSample.findMany({
        orderBy: { sampleDate: 'desc' },
      });
    }

    return NextResponse.json(samples);
  } catch (error) {
    console.error('Error fetching samples:', error);
    return NextResponse.json(
      { error: 'Fout bij ophalen van monsters' },
      { status: 500 }
    );
  }
}

// POST - Nieuw sample toevoegen (alleen admin)
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json(
        { error: 'Niet geautoriseerd' },
        { status: 401 }
      );
    }

    if (session.role !== 'admin') {
      return NextResponse.json(
        { error: 'Alleen admins kunnen monsters toevoegen' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { oNumber, sampleDate, location, description, oilType, remarks, isTaken } = body;

    // Datum is alleen verplicht als monster genomen is
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

    // Check of o-nummer al bestaat
    const existing = await prisma.oilSample.findUnique({
      where: { oNumber },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'O-nummer bestaat al' },
        { status: 400 }
      );
    }

    const sample = await prisma.oilSample.create({
      data: {
        oNumber,
        sampleDate: sampleDate ? new Date(sampleDate) : null,
        location,
        description,
        oilType: oilType || null,
        remarks: remarks || null,
        isTaken,
      },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CREATE_SAMPLE,
      details: { oNumber, location, isTaken },
      request,
    });

    return NextResponse.json(sample, { status: 201 });
  } catch (error) {
    console.error('Error creating sample:', error);
    return NextResponse.json(
      { error: 'Fout bij aanmaken van monster' },
      { status: 500 }
    );
  }
}
