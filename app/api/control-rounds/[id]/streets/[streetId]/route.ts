import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';

// PATCH - Straat markeren als gereden/nog te rijden. Body: { isDone: boolean }
// Bewust geen audit-log per straat (te veel ruis tijdens het rijden).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; streetId: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

    const { id, streetId } = await params;
    const body = await request.json();
    const { isDone } = body as { isDone?: boolean };

    if (typeof isDone !== 'boolean') {
      return NextResponse.json({ error: 'isDone (boolean) is verplicht' }, { status: 400 });
    }

    const existing = await prisma.controlRoundStreet.findFirst({
      where: { id: parseInt(streetId), roundId: parseInt(id) },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Straat niet gevonden' }, { status: 404 });
    }

    const street = await prisma.controlRoundStreet.update({
      where: { id: parseInt(streetId) },
      data: { isDone, doneAt: isDone ? new Date() : null },
    });

    return NextResponse.json(street);
  } catch (error) {
    console.error('Error updating street:', error);
    return NextResponse.json({ error: 'Fout bij bijwerken van straat' }, { status: 500 });
  }
}
