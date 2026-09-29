import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { haalSessie, toegangsFout } from '@/lib/toegang';

// PATCH - Straat markeren als gereden/nog te rijden. Body: { isDone: boolean }
// Bewust geen audit-log per straat (te veel ruis tijdens het rijden).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; streetId: string }> }
) {
  try {
    const session = await haalSessie();
    // Wijzigen alleen door een admin, net als in de andere modules. De kijker
    // komt hier helemaal niet.
    const fout = toegangsFout(session, true);
    if (fout) return fout;

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
