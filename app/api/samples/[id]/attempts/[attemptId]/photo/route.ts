import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { syncLatestAttemptToSample } from '@/lib/sampleAttempts';
import { fotoLabel, fotoVeld, leesFotoSoort } from '@/lib/samplePhotos';
import { KOLOM_ONTBREEKT_WENSEN2 } from '@/lib/kolommen';
import { fotoFout, fotoExtensie } from '@/lib/fotoControle';
import { bewaarFoto, ruimFotoOpAls } from '@/lib/fotoOpslag';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';

/*
  Foto's per poging. Net als op het monster zelf zijn er twee: het onderdeel
  (soort "onderdeel", kolom partPhotoUrl) en het monsterpotje (soort "potje",
  kolom photoUrl). Zonder soort wordt het de potjesfoto. Een vervangen of
  verwijderde foto gaat uit de opslag, tenzij iets anders er nog naar wijst.
*/

const OPTIES = { rol: 'admin', module: 'oliemonsters', ontbreekt: KOLOM_ONTBREEKT_WENSEN2 } as const;

async function leesPoging(context: unknown) {
  const oilSampleId = await leesId(context, 'Onbekende poging');
  const aId = await leesId(context, 'Onbekende poging', 'attemptId');
  const existing = await prisma.sampleAttempt.findUnique({
    where: { id: aId },
    select: { id: true, oilSampleId: true, photoUrl: true, partPhotoUrl: true },
  });
  if (!existing || existing.oilSampleId !== oilSampleId) throw new ApiFout(404, 'Poging niet gevonden');
  return { oilSampleId, aId, existing };
}

// POST - Foto uploaden voor een specifieke poging
export const POST = apiRoute({ ...OPTIES, fout: 'Fout bij uploaden van foto' }, async (request, context, session) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new ApiFout(500, 'Blob storage is niet geconfigureerd. Voeg BLOB_READ_WRITE_TOKEN toe in Vercel environment variables.');
  }
  const { oilSampleId, aId, existing } = await leesPoging(context);

  const formData = await request.formData();
  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) throw new ApiFout(400, 'Geen foto gevonden');
  const fotoMelding = fotoFout(file);
  if (fotoMelding) throw new ApiFout(400, fotoMelding);

  const soort = leesFotoSoort(formData.get('soort'));
  if (!soort) throw new ApiFout(400, 'Onbekende soort foto');

  const filename = `sample-${oilSampleId}-attempt-${aId}-${soort}-${Date.now()}.${fotoExtensie(file)}`;
  const url = await bewaarFoto(filename, file);

  const veld = fotoVeld(soort);
  await prisma.sampleAttempt.update({ where: { id: aId }, data: { [veld]: url }, select: { id: true } });
  await syncLatestAttemptToSample(oilSampleId);
  await ruimFotoOpAls(existing[veld]);

  await createAuditLog({
    userId: session.userId,
    username: session.username || 'unknown',
    action: AuditActions.UPLOAD_ATTEMPT_PHOTO,
    details: { oilSampleId, attemptId: aId, soort, filename, vervangen: existing[veld] },
    request,
  });

  return NextResponse.json({ photoUrl: url, soort });
});

// DELETE - Foto verwijderen van een poging
export const DELETE = apiRoute({ ...OPTIES, fout: 'Fout bij verwijderen van foto' }, async (request, context, session) => {
  const soort = leesFotoSoort(new URL(request.url).searchParams.get('soort'));
  if (!soort) throw new ApiFout(400, 'Onbekende soort foto');
  const { oilSampleId, aId, existing } = await leesPoging(context);

  const veld = fotoVeld(soort);
  await prisma.sampleAttempt.update({ where: { id: aId }, data: { [veld]: null }, select: { id: true } });
  await syncLatestAttemptToSample(oilSampleId);
  await ruimFotoOpAls(existing[veld]);

  await createAuditLog({
    userId: session.userId,
    username: session.username || 'unknown',
    action: AuditActions.DELETE_ATTEMPT_PHOTO,
    details: { oilSampleId, attemptId: aId, soort, label: fotoLabel(soort), url: existing[veld] },
    request,
  });

  return NextResponse.json({ success: true, soort });
});
