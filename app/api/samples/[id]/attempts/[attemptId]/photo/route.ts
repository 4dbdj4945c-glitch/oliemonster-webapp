import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { syncLatestAttemptToSample } from '@/lib/sampleAttempts';
import { haalSessie, toegangsFout } from '@/lib/toegang';
import { fotoLabel, fotoVeld, leesFotoSoort } from '@/lib/samplePhotos';
import { foutAntwoordWensen2 } from '@/lib/kolommen';

/*
  Foto's per poging. Net als op het monster zelf zijn er twee: het onderdeel
  (soort "onderdeel", kolom partPhotoUrl) en het monsterpotje (soort "potje",
  kolom photoUrl). Zonder soort wordt het de potjesfoto.
*/

// POST - Foto uploaden voor een specifieke poging
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attemptId: string }> }
) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const { id, attemptId } = await params;
    const oilSampleId = parseInt(id);
    const aId = parseInt(attemptId);
    if (Number.isNaN(oilSampleId) || Number.isNaN(aId)) {
      return NextResponse.json({ error: 'Onbekende poging' }, { status: 400 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: 'Blob storage is niet geconfigureerd. Voeg BLOB_READ_WRITE_TOKEN toe in Vercel environment variables.' },
        { status: 500 }
      );
    }

    const existing = await prisma.sampleAttempt.findUnique({
      where: { id: aId },
      select: { id: true, oilSampleId: true },
    });
    if (!existing || existing.oilSampleId !== oilSampleId) {
      return NextResponse.json({ error: 'Poging niet gevonden' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('photo') as File;
    if (!file) {
      return NextResponse.json({ error: 'Geen foto gevonden' }, { status: 400 });
    }

    const soort = leesFotoSoort(formData.get('soort'));
    if (!soort) {
      return NextResponse.json({ error: 'Onbekende soort foto' }, { status: 400 });
    }

    const timestamp = Date.now();
    const extension = file.name.split('.').pop();
    const filename = `sample-${oilSampleId}-attempt-${aId}-${soort}-${timestamp}.${extension}`;

    const blob = await put(filename, file, { access: 'public' });

    await prisma.sampleAttempt.update({
      where: { id: aId },
      data: { [fotoVeld(soort)]: blob.url },
      select: { id: true },
    });

    await syncLatestAttemptToSample(oilSampleId);

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPLOAD_ATTEMPT_PHOTO,
      details: { oilSampleId, attemptId: aId, soort, filename },
      request,
    });

    return NextResponse.json({ photoUrl: blob.url, soort });
  } catch (error) {
    return foutAntwoordWensen2(error, 'Fout bij uploaden van foto');
  }
}

// DELETE - Foto verwijderen van een poging
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attemptId: string }> }
) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const { id, attemptId } = await params;
    const oilSampleId = parseInt(id);
    const aId = parseInt(attemptId);
    if (Number.isNaN(oilSampleId) || Number.isNaN(aId)) {
      return NextResponse.json({ error: 'Onbekende poging' }, { status: 400 });
    }

    const soort = leesFotoSoort(new URL(request.url).searchParams.get('soort'));
    if (!soort) {
      return NextResponse.json({ error: 'Onbekende soort foto' }, { status: 400 });
    }

    const existing = await prisma.sampleAttempt.findUnique({
      where: { id: aId },
      select: { id: true, oilSampleId: true },
    });
    if (!existing || existing.oilSampleId !== oilSampleId) {
      return NextResponse.json({ error: 'Poging niet gevonden' }, { status: 404 });
    }

    await prisma.sampleAttempt.update({
      where: { id: aId },
      data: { [fotoVeld(soort)]: null },
      select: { id: true },
    });

    await syncLatestAttemptToSample(oilSampleId);

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_ATTEMPT_PHOTO,
      details: { oilSampleId, attemptId: aId, soort, label: fotoLabel(soort) },
      request,
    });

    return NextResponse.json({ success: true, soort });
  } catch (error) {
    return foutAntwoordWensen2(error, 'Fout bij verwijderen van foto');
  }
}
