import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { syncLatestAttemptToSample } from '@/lib/sampleAttempts';

// POST - Foto uploaden voor een specifieke poging
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attemptId: string }> }
) {
  try {
    const { id, attemptId } = await params;
    const oilSampleId = parseInt(id);
    const aId = parseInt(attemptId);

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: 'Blob storage is niet geconfigureerd. Voeg BLOB_READ_WRITE_TOKEN toe in Vercel environment variables.' },
        { status: 500 }
      );
    }

    const existing = await prisma.sampleAttempt.findUnique({ where: { id: aId } });
    if (!existing || existing.oilSampleId !== oilSampleId) {
      return NextResponse.json({ error: 'Poging niet gevonden' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('photo') as File;
    if (!file) {
      return NextResponse.json({ error: 'Geen foto gevonden' }, { status: 400 });
    }

    const timestamp = Date.now();
    const extension = file.name.split('.').pop();
    const filename = `sample-${oilSampleId}-attempt-${aId}-${timestamp}.${extension}`;

    const blob = await put(filename, file, { access: 'public' });

    await prisma.sampleAttempt.update({
      where: { id: aId },
      data: { photoUrl: blob.url },
    });

    await syncLatestAttemptToSample(oilSampleId);

    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPLOAD_ATTEMPT_PHOTO,
      details: { oilSampleId, attemptId: aId, filename },
      request,
    });

    return NextResponse.json({ photoUrl: blob.url });
  } catch (error) {
    console.error('Error uploading attempt photo:', error);
    const msg = error instanceof Error ? error.message : 'Fout bij uploaden van foto';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE - Foto verwijderen van een poging
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attemptId: string }> }
) {
  try {
    const { id, attemptId } = await params;
    const oilSampleId = parseInt(id);
    const aId = parseInt(attemptId);

    const existing = await prisma.sampleAttempt.findUnique({ where: { id: aId } });
    if (!existing || existing.oilSampleId !== oilSampleId) {
      return NextResponse.json({ error: 'Poging niet gevonden' }, { status: 404 });
    }

    await prisma.sampleAttempt.update({
      where: { id: aId },
      data: { photoUrl: null },
    });

    await syncLatestAttemptToSample(oilSampleId);

    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_ATTEMPT_PHOTO,
      details: { oilSampleId, attemptId: aId },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting attempt photo:', error);
    return NextResponse.json({ error: 'Fout bij verwijderen van foto' }, { status: 500 });
  }
}
