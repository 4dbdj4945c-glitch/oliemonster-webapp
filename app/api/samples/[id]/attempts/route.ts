import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { syncLatestAttemptToSample } from '@/lib/sampleAttempts';

// GET - Alle pogingen voor een monster (chronologisch, oudste eerst)
export async function GET(
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
    const oilSampleId = parseInt(id);

    const attempts = await prisma.sampleAttempt.findMany({
      where: { oilSampleId },
      orderBy: [
        { sampleDate: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    return NextResponse.json(attempts);
  } catch (error) {
    console.error('Error fetching attempts:', error);
    return NextResponse.json({ error: 'Fout bij ophalen van pogingen' }, { status: 500 });
  }
}

// POST - Nieuwe poging toevoegen (hermonstering)
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

    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Alleen admins kunnen pogingen toevoegen' }, { status: 403 });
    }

    const { id } = await params;
    const oilSampleId = parseInt(id);

    const sample = await prisma.oilSample.findUnique({ where: { id: oilSampleId } });
    if (!sample) {
      return NextResponse.json({ error: 'Monster niet gevonden' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { sampleDate, photoUrl, remarks, isTaken } = body as {
      sampleDate?: string | null;
      photoUrl?: string | null;
      remarks?: string | null;
      isTaken?: boolean;
    };

    const attempt = await prisma.sampleAttempt.create({
      data: {
        oilSampleId,
        sampleDate: sampleDate ? new Date(sampleDate) : null,
        photoUrl: photoUrl || null,
        remarks: remarks || null,
        isTaken: isTaken ?? false,
      },
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
    console.error('Error creating attempt:', error);
    return NextResponse.json({ error: 'Fout bij aanmaken van poging' }, { status: 500 });
  }
}
