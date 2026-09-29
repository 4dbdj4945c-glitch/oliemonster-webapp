import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';

// PATCH - Straat markeren als gereden/nog te rijden. Body: { isDone: boolean }
// Bewust geen audit-log per straat (te veel ruis tijdens het rijden).
export const PATCH = withAuth({ rol: 'admin', module: 'controlerondes' }, async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; streetId: string }> }
) => {
  try {
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
});
