import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { ATTEMPT_BASIS_SELECT, syncLatestAttemptToSample } from '@/lib/sampleAttempts';
import { foutAntwoordWensen2 } from '@/lib/kolommen';

// PUT - Poging bijwerken
export const PUT = withAuth({ rol: 'admin', module: 'oliemonsters' }, async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attemptId: string }> },
  session
) => {
  try {
    const { id, attemptId } = await params;
    const oilSampleId = parseInt(id);
    const aId = parseInt(attemptId);
    if (Number.isNaN(oilSampleId) || Number.isNaN(aId)) {
      return NextResponse.json({ error: 'Onbekende poging' }, { status: 400 });
    }

    const existing = await prisma.sampleAttempt.findUnique({
      where: { id: aId },
      select: { id: true, oilSampleId: true, photoUrl: true, isTaken: true },
    });
    if (!existing || existing.oilSampleId !== oilSampleId) {
      return NextResponse.json({ error: 'Poging niet gevonden' }, { status: 404 });
    }

    const body = await request.json();
    const { sampleDate, photoUrl, partPhotoUrl, remarks, isTaken } = body as {
      sampleDate?: string | null;
      photoUrl?: string | null;
      partPhotoUrl?: string | null;
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
        // Een foto die niet meegestuurd wordt blijft staan; de foto's gaan via
        // hun eigen route en niet via dit formulier.
        ...(partPhotoUrl === undefined ? {} : { partPhotoUrl }),
        remarks: remarks ?? null,
        isTaken: isTaken ?? existing.isTaken,
      },
      select: { ...ATTEMPT_BASIS_SELECT, partPhotoUrl: true },
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
    return foutAntwoordWensen2(error, 'Fout bij bijwerken van poging');
  }
});

// DELETE - Poging verwijderen
export const DELETE = withAuth({ rol: 'admin', module: 'oliemonsters' }, async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attemptId: string }> },
  session
) => {
  try {
    const { id, attemptId } = await params;
    const oilSampleId = parseInt(id);
    const aId = parseInt(attemptId);
    if (Number.isNaN(oilSampleId) || Number.isNaN(aId)) {
      return NextResponse.json({ error: 'Onbekende poging' }, { status: 400 });
    }

    const existing = await prisma.sampleAttempt.findUnique({
      where: { id: aId },
      select: { id: true, oilSampleId: true },
    });
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
    return foutAntwoordWensen2(error, 'Fout bij verwijderen van poging');
  }
});
