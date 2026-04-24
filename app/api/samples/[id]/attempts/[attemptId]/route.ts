import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { syncLatestAttemptToSample } from '@/lib/sampleAttempts';

// PUT - Poging bijwerken
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attemptId: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Alleen admins kunnen pogingen bewerken' }, { status: 403 });
    }

    const { id, attemptId } = await params;
    const oilSampleId = parseInt(id);
    const aId = parseInt(attemptId);

    const existing = await prisma.sampleAttempt.findUnique({ where: { id: aId } });
    if (!existing || existing.oilSampleId !== oilSampleId) {
      return NextResponse.json({ error: 'Poging niet gevonden' }, { status: 404 });
    }

    const body = await request.json();
    const { sampleDate, photoUrl, remarks, isTaken } = body as {
      sampleDate?: string | null;
      photoUrl?: string | null;
      remarks?: string | null;
      isTaken?: boolean;
    };

    if (isTaken && !sampleDate) {
      return NextResponse.json(
        { error: 'Datum is verplicht voor genomen monsters' },
        { status: 400 }
      );
    }

    const attempt = await prisma.sampleAttempt.update({
      where: { id: aId },
      data: {
        sampleDate: sampleDate ? new Date(sampleDate) : null,
        photoUrl: photoUrl === undefined ? existing.photoUrl : photoUrl,
        remarks: remarks ?? null,
        isTaken: isTaken ?? existing.isTaken,
      },
    });

    await syncLatestAttemptToSample(oilSampleId);

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPDATE_ATTEMPT,
      details: { oilSampleId, attemptId: aId },
      request,
    });

    return NextResponse.json(attempt);
  } catch (error) {
    console.error('Error updating attempt:', error);
    return NextResponse.json({ error: 'Fout bij bijwerken van poging' }, { status: 500 });
  }
}

// DELETE - Poging verwijderen
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attemptId: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Alleen admins kunnen pogingen verwijderen' }, { status: 403 });
    }

    const { id, attemptId } = await params;
    const oilSampleId = parseInt(id);
    const aId = parseInt(attemptId);

    const existing = await prisma.sampleAttempt.findUnique({ where: { id: aId } });
    if (!existing || existing.oilSampleId !== oilSampleId) {
      return NextResponse.json({ error: 'Poging niet gevonden' }, { status: 404 });
    }

    await prisma.sampleAttempt.delete({ where: { id: aId } });
    await syncLatestAttemptToSample(oilSampleId);

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_ATTEMPT,
      details: { oilSampleId, attemptId: aId },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting attempt:', error);
    return NextResponse.json({ error: 'Fout bij verwijderen van poging' }, { status: 500 });
  }
}
