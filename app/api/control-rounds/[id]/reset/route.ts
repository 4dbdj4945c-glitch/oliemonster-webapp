import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout } from '@/lib/toegang';

// POST - Voortgang van een ronde resetten: alle straten weer op "nog te rijden".
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await haalSessie();
    // Wijzigen alleen door een admin, net als in de andere modules. De kijker
    // komt hier helemaal niet.
    const fout = toegangsFout(session, true);
    if (fout) return fout;

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
}
