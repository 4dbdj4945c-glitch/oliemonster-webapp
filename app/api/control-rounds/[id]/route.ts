import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';

// GET - Eén ronde met alle straten in rijvolgorde.
export const GET = withAuth({ rol: 'user', module: 'controlerondes' }, async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params;
    const round = await prisma.controlRound.findUnique({
      where: { id: parseInt(id) },
      include: { streets: { orderBy: { orderIndex: 'asc' } } },
    });

    if (!round) {
      return NextResponse.json({ error: 'Ronde niet gevonden' }, { status: 404 });
    }

    return NextResponse.json(round);
  } catch (error) {
    console.error('Error fetching control round:', error);
    return NextResponse.json({ error: 'Fout bij ophalen van ronde' }, { status: 500 });
  }
});

// PATCH - Naam/notities van een ronde bijwerken.
export const PATCH = withAuth({ rol: 'admin', module: 'controlerondes' }, async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  session
) => {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, notes } = body as { name?: string; notes?: string | null };

    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ error: 'Naam mag niet leeg zijn' }, { status: 400 });
    }

    const round = await prisma.controlRound.update({
      where: { id: parseInt(id) },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
      },
      include: { streets: { orderBy: { orderIndex: 'asc' } } },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPDATE_CONTROL_ROUND,
      details: { id: round.id, name: round.name },
      request,
    });

    return NextResponse.json(round);
  } catch (error) {
    console.error('Error updating control round:', error);
    return NextResponse.json({ error: 'Fout bij bijwerken van ronde' }, { status: 500 });
  }
});

// DELETE - Ronde verwijderen (straten verdwijnen mee via cascade).
export const DELETE = withAuth({ rol: 'admin', module: 'controlerondes' }, async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  session
) => {
  try {
    const { id } = await params;
    const round = await prisma.controlRound.findUnique({ where: { id: parseInt(id) } });

    await prisma.controlRound.delete({ where: { id: parseInt(id) } });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_CONTROL_ROUND,
      details: { id: parseInt(id), name: round?.name, place: round?.place },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting control round:', error);
    return NextResponse.json({ error: 'Fout bij verwijderen van ronde' }, { status: 500 });
  }
});
