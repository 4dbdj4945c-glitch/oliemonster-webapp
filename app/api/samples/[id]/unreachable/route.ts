import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout } from '@/lib/toegang';
import { bouwOnbereikbaarReden } from '@/lib/unreachableReasons';
import { foutAntwoordWensen2 } from '@/lib/kolommen';
import { actiefFilter } from '@/lib/verwijderdeMonsters';
import { fotoFout, fotoExtensie } from '@/lib/fotoControle';

/**
 * Niet bereikbaar: de locatie was door afzetting, andere werkzaamheden of
 * begroeiing niet te bereiken.
 *
 * Dit is met opzet iets anders dan annuleren. Een geannuleerd monster hoeft niet
 * meer en valt buiten de planning (isDisabled). Een onbereikbaar monster blijft
 * openstaan: isDisabled blijft false en isTaken blijft false, dus het blijft
 * meetellen in de planning, want het moet waarschijnlijk alsnog gebeuren.
 *
 * PATCH  zet de status, met reden, omschrijving en een eigen foto als bewijs.
 * DELETE draait het terug: het monster is weer gewoon niet genomen.
 */

/** Leest de velden uit een multipart-formulier of uit JSON. */
async function leesVelden(request: NextRequest): Promise<{
  reason: unknown;
  toelichting: unknown;
  note: string;
  file: File | null;
}> {
  const type = request.headers.get('content-type') || '';
  if (type.includes('multipart/form-data')) {
    const form = await request.formData();
    const bestand = form.get('photo');
    return {
      reason: form.get('reason'),
      toelichting: form.get('toelichting'),
      note: typeof form.get('note') === 'string' ? (form.get('note') as string) : '',
      file: bestand instanceof File && bestand.size > 0 ? bestand : null,
    };
  }
  const body = await request.json().catch(() => ({}));
  return {
    reason: body.reason,
    toelichting: body.toelichting,
    note: typeof body.note === 'string' ? body.note : '',
    file: null,
  };
}

export async function PATCH(
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

    const velden = await leesVelden(request);
    const reden = bouwOnbereikbaarReden(velden.reason, velden.toelichting);
    if ('fout' in reden) {
      return NextResponse.json({ error: reden.fout }, { status: 400 });
    }
    const omschrijving = velden.note.trim();
    if (!omschrijving) {
      return NextResponse.json(
        { error: 'Vul een korte omschrijving in van wat je aantrof' },
        { status: 400 }
      );
    }

    const sample = await prisma.oilSample.findUnique({
      where: { id: sampleId, ...(await actiefFilter()) },
      select: { id: true, oNumber: true, analysisYear: true, isDisabled: true, isTaken: true },
    });
    if (!sample) {
      return NextResponse.json({ error: 'Monster niet gevonden' }, { status: 404 });
    }
    if (sample.isDisabled) {
      return NextResponse.json(
        { error: 'Dit monster is geannuleerd. Draai de annulering eerst terug.' },
        { status: 400 }
      );
    }
    if (sample.isTaken) {
      return NextResponse.json(
        { error: 'Dit monster staat al als genomen te boek. Zet het eerst op niet genomen.' },
        { status: 400 }
      );
    }

    // De bewijsfoto is optioneel: liever een vastgelegde reden zonder foto dan
    // niets, want in het veld lukt een foto niet altijd.
    let photoUrl: string | null = null;
    if (velden.file) {
      const fotoMelding = fotoFout(velden.file);
      if (fotoMelding) {
        return NextResponse.json({ error: fotoMelding }, { status: 400 });
      }
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return NextResponse.json(
          { error: 'Blob storage is niet geconfigureerd. Voeg BLOB_READ_WRITE_TOKEN toe in Vercel environment variables.' },
          { status: 500 }
        );
      }
      const filename = `sample-${sampleId}-onbereikbaar-${Date.now()}.${fotoExtensie(velden.file)}`;
      const blob = await put(filename, velden.file, { access: 'public' });
      photoUrl = blob.url;
    }

    const bijgewerkt = await prisma.oilSample.update({
      where: { id: sampleId },
      data: {
        isUnreachable: true,
        unreachableReason: reden.tekst,
        unreachableNote: omschrijving,
        // Een nieuwe registratie zonder foto laat een eerdere bewijsfoto staan.
        ...(photoUrl ? { unreachablePhotoUrl: photoUrl } : {}),
        unreachableAt: new Date(),
        unreachableBy: session.username || 'onbekend',
      },
      select: {
        id: true,
        isUnreachable: true,
        unreachableReason: true,
        unreachableNote: true,
        unreachablePhotoUrl: true,
        unreachableAt: true,
        unreachableBy: true,
      },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.SET_SAMPLE_UNREACHABLE,
      details: {
        id: sampleId,
        oNumber: sample.oNumber,
        analysisYear: sample.analysisYear,
        reden: reden.tekst,
        omschrijving,
        metFoto: photoUrl !== null,
      },
      request,
    });

    return NextResponse.json(bijgewerkt);
  } catch (error) {
    return foutAntwoordWensen2(error, 'Fout bij vastleggen dat de locatie niet bereikbaar was');
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

    const sample = await prisma.oilSample.findUnique({
      where: { id: sampleId, ...(await actiefFilter()) },
      select: {
        id: true,
        oNumber: true,
        analysisYear: true,
        isUnreachable: true,
        unreachableReason: true,
      },
    });
    if (!sample) {
      return NextResponse.json({ error: 'Monster niet gevonden' }, { status: 404 });
    }

    const bijgewerkt = await prisma.oilSample.update({
      where: { id: sampleId },
      data: {
        isUnreachable: false,
        unreachableReason: null,
        unreachableNote: null,
        unreachablePhotoUrl: null,
        unreachableAt: null,
        unreachableBy: null,
      },
      select: { id: true, isUnreachable: true },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CLEAR_SAMPLE_UNREACHABLE,
      details: {
        id: sampleId,
        oNumber: sample.oNumber,
        analysisYear: sample.analysisYear,
        vorigeReden: sample.unreachableReason,
      },
      request,
    });

    return NextResponse.json(bijgewerkt);
  } catch (error) {
    return foutAntwoordWensen2(error, 'Fout bij terugdraaien van Niet bereikbaar');
  }
}
