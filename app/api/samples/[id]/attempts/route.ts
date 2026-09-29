import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { ATTEMPT_BASIS_SELECT, syncLatestAttemptToSample } from '@/lib/sampleAttempts';
import { haalSessie, toegangsFout } from '@/lib/toegang';
import { foutAntwoordWensen2, tabelOntbreekt } from '@/lib/kolommen';

// GET - Alle pogingen voor een monster (chronologisch, oudste eerst)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // De rol alleen lezen mag de pogingen niet zien: die zit alleen in het
  // bewerkvenster van een admin. toegangsFout weigert hem, ook serverside.
  const session = await haalSessie();
  const fout = toegangsFout(session, false);
  if (fout) return fout;

  try {
    const { id } = await params;
    const oilSampleId = parseInt(id);
    if (Number.isNaN(oilSampleId)) {
      return NextResponse.json({ error: 'Onbekend monster' }, { status: 400 });
    }

    const volgorde = [{ sampleDate: 'asc' as const }, { createdAt: 'asc' as const }];

    // Met de tweede foto erbij. Zolang ./db-push-wensen2.sh nog niet gedraaid is
    // bestaat partPhotoUrl niet; dan halen we de oude velden op, zodat de lijst
    // met pogingen gewoon blijft werken.
    try {
      const attempts = await prisma.sampleAttempt.findMany({
        where: { oilSampleId },
        orderBy: volgorde,
        select: { ...ATTEMPT_BASIS_SELECT, partPhotoUrl: true },
      });
      return NextResponse.json(attempts);
    } catch (error) {
      if (!tabelOntbreekt(error)) throw error;
      const oud = await prisma.sampleAttempt.findMany({
        where: { oilSampleId },
        orderBy: volgorde,
        select: ATTEMPT_BASIS_SELECT,
      });
      return NextResponse.json(oud.map((a) => ({ ...a, partPhotoUrl: null })));
    }
  } catch (error) {
    return foutAntwoordWensen2(error, 'Fout bij ophalen van pogingen');
  }
}

// POST - Nieuwe poging toevoegen (hermonstering)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const { id } = await params;
    const oilSampleId = parseInt(id);
    if (Number.isNaN(oilSampleId)) {
      return NextResponse.json({ error: 'Onbekend monster' }, { status: 400 });
    }

    const sample = await prisma.oilSample.findUnique({
      where: { id: oilSampleId },
      select: { id: true, oNumber: true },
    });
    if (!sample) {
      return NextResponse.json({ error: 'Monster niet gevonden' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { sampleDate, photoUrl, partPhotoUrl, remarks, isTaken } = body as {
      sampleDate?: string | null;
      photoUrl?: string | null;
      partPhotoUrl?: string | null;
      remarks?: string | null;
      isTaken?: boolean;
    };

    const attempt = await prisma.sampleAttempt.create({
      data: {
        oilSampleId,
        sampleDate: sampleDate ? new Date(sampleDate) : null,
        photoUrl: photoUrl || null,
        partPhotoUrl: partPhotoUrl || null,
        remarks: remarks || null,
        isTaken: isTaken ?? false,
      },
      select: { ...ATTEMPT_BASIS_SELECT, partPhotoUrl: true },
    });

    await syncLatestAttemptToSample(oilSampleId);

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CREATE_ATTEMPT,
      details: { oilSampleId, oNumber: sample.oNumber, attemptId: attempt.id },
      request,
    });

    return NextResponse.json(attempt, { status: 201 });
  } catch (error) {
    return foutAntwoordWensen2(error, 'Fout bij aanmaken van poging');
  }
}
