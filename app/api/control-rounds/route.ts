import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { optimizeRoute, RouteStreet } from '@/lib/routePlanner';

// GET - Lijst van alle controlerondes met voortgang (aantal straten / gereden).
export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

    const rounds = await prisma.controlRound.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { streets: { select: { isDone: true } } },
    });

    const response = rounds.map(({ streets, ...rest }) => ({
      ...rest,
      streetsCount: streets.length,
      doneCount: streets.filter((s) => s.isDone).length,
    }));

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching control rounds:', error);
    return NextResponse.json({ error: 'Fout bij ophalen van rondes' }, { status: 500 });
  }
}

// POST - Nieuwe ronde aanmaken. Body: { name, place, notes?, streets: [{street, lat, lng}] }
// De rijvolgorde + route-traject worden berekend en opgeslagen.
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

    const body = await request.json();
    const { name, place, notes, streets } = body as {
      name?: string;
      place?: string;
      notes?: string | null;
      streets?: {
        street?: string;
        lat?: number;
        lng?: number;
        lines?: number[][][];
        a?: { lat?: number; lng?: number };
        b?: { lat?: number; lng?: number };
      }[];
    };

    if (!name?.trim() || !place?.trim()) {
      return NextResponse.json({ error: 'Naam en plaats zijn verplicht' }, { status: 400 });
    }

    const valid = (streets || []).filter(
      (s) =>
        s.street?.trim() &&
        typeof s.lat === 'number' && Number.isFinite(s.lat) &&
        typeof s.lng === 'number' && Number.isFinite(s.lng)
    );

    if (valid.length === 0) {
      return NextResponse.json({ error: 'Selecteer minstens één straat' }, { status: 400 });
    }

    // Endpoints voor de route; val terug op het midpunt als ze ontbreken.
    const routeStreets: RouteStreet[] = valid.map((s) => ({
      street: s.street!.trim(),
      a: {
        lat: typeof s.a?.lat === 'number' ? s.a!.lat : s.lat!,
        lng: typeof s.a?.lng === 'number' ? s.a!.lng : s.lng!,
      },
      b: {
        lat: typeof s.b?.lat === 'number' ? s.b!.lat : s.lat!,
        lng: typeof s.b?.lng === 'number' ? s.b!.lng : s.lng!,
      },
    }));

    const optimized = await optimizeRoute(routeStreets);

    const round = await prisma.controlRound.create({
      data: {
        name: name.trim(),
        place: place.trim(),
        notes: notes?.trim() || null,
        routeGeometry: optimized.geometry.length ? JSON.stringify(optimized.geometry) : null,
        routeDistance: optimized.distance,
        routeSteps: optimized.steps ? JSON.stringify(optimized.steps) : null,
        streets: {
          create: valid.map((s, i) => ({
            street: s.street!.trim(),
            lat: s.lat!,
            lng: s.lng!,
            geometry: s.lines && s.lines.length ? JSON.stringify(s.lines) : null,
            orderIndex: optimized.order[i] ?? i,
          })),
        },
      },
      include: { streets: { orderBy: { orderIndex: 'asc' } } },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CREATE_CONTROL_ROUND,
      details: { id: round.id, name: round.name, place: round.place, streets: valid.length },
      request,
    });

    return NextResponse.json(round, { status: 201 });
  } catch (error) {
    console.error('Error creating control round:', error);
    return NextResponse.json({ error: 'Fout bij aanmaken van ronde' }, { status: 500 });
  }
}
