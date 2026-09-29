import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { bouwOnbereikbaarReden } from '@/lib/unreachableReasons';
import { KOLOM_ONTBREEKT_WENSEN2 } from '@/lib/kolommen';
import { actiefFilter } from '@/lib/verwijderdeMonsters';
import { fotoFout, fotoExtensie } from '@/lib/fotoControle';
import { bewaarFoto, ruimFotoOpAls } from '@/lib/fotoOpslag';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';

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
 *        Een nieuwe bewijsfoto vervangt de oude; die gaat uit de opslag.
 * DELETE draait het terug: het monster is weer gewoon niet genomen. De
 *        bewijsfoto blijft in de opslag staan en het adres gaat in het logboek.
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

export const PATCH = apiRoute(
  { rol: 'admin', module: 'oliemonsters', fout: 'Fout bij vastleggen dat de locatie niet bereikbaar was', ontbreekt: KOLOM_ONTBREEKT_WENSEN2 },
  async (request, context, session) => {
    const sampleId = await leesId(context, 'Onbekend monster');

    const velden = await leesVelden(request);
    const reden = bouwOnbereikbaarReden(velden.reason, velden.toelichting);
    if ('fout' in reden) {
      throw new ApiFout(400, reden.fout);
    }
    const omschrijving = velden.note.trim();
    if (!omschrijving) {
      throw new ApiFout(400, 'Vul een korte omschrijving in van wat je aantrof');
    }

    const sample = await prisma.oilSample.findUnique({
      where: { id: sampleId, ...(await actiefFilter()) },
      select: { id: true, oNumber: true, analysisYear: true, isDisabled: true, isTaken: true },
    });
    if (!sample) {
      throw new ApiFout(404, 'Monster niet gevonden');
    }
    if (sample.isDisabled) {
      throw new ApiFout(400, 'Dit monster is geannuleerd. Draai de annulering eerst terug.');
    }
    if (sample.isTaken) {
      throw new ApiFout(400, 'Dit monster staat al als genomen te boek. Zet het eerst op niet genomen.');
    }

    // De bewijsfoto is optioneel: liever een vastgelegde reden zonder foto dan
    // niets, want in het veld lukt een foto niet altijd.
    let photoUrl: string | null = null;
    if (velden.file) {
      const fotoMelding = fotoFout(velden.file);
      if (fotoMelding) {
        throw new ApiFout(400, fotoMelding);
      }
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        throw new ApiFout(500, 'Blob storage is niet geconfigureerd. Voeg BLOB_READ_WRITE_TOKEN toe in Vercel environment variables.');
      }
      const filename = `sample-${sampleId}-onbereikbaar-${Date.now()}.${fotoExtensie(velden.file)}`;
      photoUrl = await bewaarFoto(filename, velden.file);
    }
    const vorigeFoto = photoUrl
      ? (await prisma.oilSample.findUnique({ where: { id: sampleId }, select: { unreachablePhotoUrl: true } }))?.unreachablePhotoUrl ?? null
      : null;

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
    await ruimFotoOpAls(vorigeFoto);

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
  }
);

export const DELETE = apiRoute(
  { rol: 'admin', module: 'oliemonsters', fout: 'Fout bij terugdraaien van Niet bereikbaar', ontbreekt: KOLOM_ONTBREEKT_WENSEN2 },
  async (request, context, session) => {
    const sampleId = await leesId(context, 'Onbekend monster');

    const sample = await prisma.oilSample.findUnique({
      where: { id: sampleId, ...(await actiefFilter()) },
      select: {
        id: true,
        oNumber: true,
        analysisYear: true,
        isUnreachable: true,
        unreachableReason: true,
        unreachablePhotoUrl: true,
      },
    });
    if (!sample) {
      throw new ApiFout(404, 'Monster niet gevonden');
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
        bewijsfoto: sample.unreachablePhotoUrl,
      },
      request,
    });

    return NextResponse.json(bijgewerkt);
  }
);
