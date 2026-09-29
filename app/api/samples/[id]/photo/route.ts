import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout } from '@/lib/toegang';
import { fotoLabel, fotoVeld, leesFotoSoort } from '@/lib/samplePhotos';
import { foutAntwoordWensen2 } from '@/lib/kolommen';
import { actiefFilter } from '@/lib/verwijderdeMonsters';
import { fotoFout, fotoExtensie } from '@/lib/fotoControle';

/*
  Foto's op het monster zelf. Er zijn er twee: het onderdeel waar het monster
  vandaan komt (soort "onderdeel", kolom partPhotoUrl) en het monsterpotje
  (soort "potje", kolom photoUrl). Wie geen soort meestuurt krijgt de potjesfoto,
  zodat bestaande aanroepen en bestaande foto's blijven kloppen.
*/

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const { id } = await params;
    const sampleId = parseInt(id);
    if (Number.isNaN(sampleId)) {
      return NextResponse.json({ error: 'Onbekend monster' }, { status: 400 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: 'Blob storage is niet geconfigureerd. Voeg BLOB_READ_WRITE_TOKEN toe in Vercel environment variables.' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('photo');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Geen foto gevonden' }, { status: 400 });
    }
    const fotoMelding = fotoFout(file);
    if (fotoMelding) {
      return NextResponse.json({ error: fotoMelding }, { status: 400 });
    }

    const soort = leesFotoSoort(formData.get('soort'));
    if (!soort) {
      return NextResponse.json({ error: 'Onbekende soort foto' }, { status: 400 });
    }

    const sample = await prisma.oilSample.findUnique({
      where: { id: sampleId, ...(await actiefFilter()) },
      select: { id: true, oNumber: true },
    });
    if (!sample) {
      return NextResponse.json({ error: 'Monster niet gevonden' }, { status: 404 });
    }

    const timestamp = Date.now();
    const filename = `sample-${sampleId}-${soort}-${timestamp}.${fotoExtensie(file)}`;

    const blob = await put(filename, file, { access: 'public' });

    await prisma.oilSample.update({
      where: { id: sampleId },
      data: { [fotoVeld(soort)]: blob.url },
      select: { id: true },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPLOAD_PHOTO,
      details: { sampleId, oNumber: sample.oNumber, soort, filename },
      request,
    });

    return NextResponse.json({ photoUrl: blob.url, soort });
  } catch (error) {
    return foutAntwoordWensen2(error, 'Fout bij uploaden van foto');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const { id } = await params;
    const sampleId = parseInt(id);
    if (Number.isNaN(sampleId)) {
      return NextResponse.json({ error: 'Onbekend monster' }, { status: 400 });
    }

    // Welke van de twee foto's: ?soort=onderdeel of ?soort=potje (standaard potje).
    const soort = leesFotoSoort(new URL(request.url).searchParams.get('soort'));
    if (!soort) {
      return NextResponse.json({ error: 'Onbekende soort foto' }, { status: 400 });
    }

    const sample = await prisma.oilSample.findUnique({
      where: { id: sampleId, ...(await actiefFilter()) },
      select: { id: true, oNumber: true },
    });
    if (!sample) {
      return NextResponse.json({ error: 'Monster niet gevonden' }, { status: 404 });
    }

    await prisma.oilSample.update({
      where: { id: sampleId },
      data: { [fotoVeld(soort)]: null },
      select: { id: true },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_PHOTO,
      details: { sampleId, oNumber: sample.oNumber, soort, label: fotoLabel(soort) },
      request,
    });

    return NextResponse.json({ success: true, soort });
  } catch (error) {
    return foutAntwoordWensen2(error, 'Fout bij verwijderen van foto');
  }
}
