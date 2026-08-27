import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { createAuditLog, AuditActions } from '@/lib/auditLog';

// POST - Voortgang van een ronde resetten: alle straten weer op "nog te rijden".
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

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
