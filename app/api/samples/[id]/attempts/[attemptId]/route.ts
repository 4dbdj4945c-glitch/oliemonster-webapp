import { NextResponse } from 'next/server';
import { metPogingFotos } from '@/lib/fotoAdres';
import { geenFotoRoute } from '@/lib/fotoOpslag';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { ATTEMPT_BASIS_SELECT, syncLatestAttemptToSample } from '@/lib/sampleAttempts';
import { KOLOM_ONTBREEKT_WENSEN2 } from '@/lib/kolommen';
import { ruimFotoOpAls } from '@/lib/fotoOpslag';
import { apiRoute, ApiFout, leesId, leesJson, optioneleDatum, optioneleTekst } from '@/lib/apiRoute';

const OPTIES = { rol: 'admin', module: 'oliemonsters', ontbreekt: KOLOM_ONTBREEKT_WENSEN2 } as const;

async function leesPoging(context: unknown) {
  const oilSampleId = await leesId(context, 'Onbekende poging');
  const aId = await leesId(context, 'Onbekende poging', 'attemptId');
  const existing = await prisma.sampleAttempt.findUnique({
    where: { id: aId },
    select: { id: true, oilSampleId: true, photoUrl: true, partPhotoUrl: true, isTaken: true },
  });
  if (!existing || existing.oilSampleId !== oilSampleId) throw new ApiFout(404, 'Poging niet gevonden');
  return { oilSampleId, aId, existing };
}

const PogingSchema = z
  .object({
    sampleDate: optioneleDatum(),
    photoUrl: optioneleTekst(2000).refine(geenFotoRoute, { error: 'Onbekend fotoadres' }),
    partPhotoUrl: optioneleTekst(2000).refine(geenFotoRoute, { error: 'Onbekend fotoadres' }),
    remarks: optioneleTekst(),
    isTaken: z.boolean().optional(),
  })
  .refine((d) => !d.isTaken || d.sampleDate, { error: 'Datum is verplicht voor genomen monsters', path: ['sampleDate'] });

// PUT - Poging bijwerken
export const PUT = apiRoute({ ...OPTIES, fout: 'Fout bij bijwerken van poging' }, async (request, context, session) => {
  const { oilSampleId, aId, existing } = await leesPoging(context);
  const invoer = await leesJson(request, PogingSchema);

  const attempt = await prisma.sampleAttempt.update({
    where: { id: aId },
    data: {
      sampleDate: invoer.sampleDate ?? null,
      // Een foto die niet meegestuurd wordt blijft staan; de foto's gaan via
      // hun eigen route en niet via dit formulier.
      ...(invoer.photoUrl === undefined ? {} : { photoUrl: invoer.photoUrl }),
      ...(invoer.partPhotoUrl === undefined ? {} : { partPhotoUrl: invoer.partPhotoUrl }),
      remarks: invoer.remarks ?? null,
      isTaken: invoer.isTaken ?? existing.isTaken,
    },
    select: { ...ATTEMPT_BASIS_SELECT, partPhotoUrl: true },
  });

  await syncLatestAttemptToSample(oilSampleId);
  await ruimFotoOpAls(
    invoer.photoUrl !== undefined && invoer.photoUrl !== existing.photoUrl ? existing.photoUrl : null,
    invoer.partPhotoUrl !== undefined && invoer.partPhotoUrl !== existing.partPhotoUrl ? existing.partPhotoUrl : null
  );

  await createAuditLog({
    userId: session.userId,
    username: session.username || 'unknown',
    action: AuditActions.UPDATE_ATTEMPT,
    details: { oilSampleId, attemptId: aId },
    request,
  });

  return NextResponse.json(metPogingFotos(attempt));
});

// DELETE - Poging verwijderen. De foto's blijven bewust in de opslag staan
// (net als bij Afname ongedaan maken): hun adressen staan in het logboek, zodat
// een vergissing met de hand terug te zetten is.
export const DELETE = apiRoute({ ...OPTIES, fout: 'Fout bij verwijderen van poging' }, async (request, context, session) => {
  const { oilSampleId, aId, existing } = await leesPoging(context);

  await prisma.sampleAttempt.delete({ where: { id: aId } });
  await syncLatestAttemptToSample(oilSampleId);

  await createAuditLog({
    userId: session.userId,
    username: session.username || 'unknown',
    action: AuditActions.DELETE_ATTEMPT,
    details: { oilSampleId, attemptId: aId, fotoPotje: existing.photoUrl, fotoOnderdeel: existing.partPhotoUrl },
    request,
  });

  return NextResponse.json({ success: true });
});
