import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';

// POST - Voortgang van een ronde resetten: alle straten weer op "nog te rijden".
export const POST = withAuth({ rol: 'admin', module: 'controlerondes' }, async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  session
) => {
  try {
    const { id } = await params;

    await prisma.controlRoundStreet.updateMany({
      where: { roundId: parseInt(id) },
      data: { isDone: false, doneAt: null },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.RESET_CONTROL_ROUND,
      details: { id: parseInt(id) },
      request,
    });

    const round = await prisma.controlRound.findUnique({
      where: { id: parseInt(id) },
      include: { streets: { orderBy: { orderIndex: 'asc' } } },
    });

    return NextResponse.json(round);
  } catch (error) {
    console.error('Error resetting control round:', error);
    return NextResponse.json({ error: 'Fout bij resetten van ronde' }, { status: 500 });
  }
});
