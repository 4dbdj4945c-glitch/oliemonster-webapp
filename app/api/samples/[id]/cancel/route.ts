import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { apiRoute, ApiFout, leesId, leesJson, optioneleTekst } from '@/lib/apiRoute';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { TABEL_ONTBREEKT_PLANNING } from '@/lib/planningApi';
import { bouwAnnuleerReden } from '@/lib/cancelReasons';
import { actiefFilter } from '@/lib/verwijderdeMonsters';

/**
 * PATCH - Annuleer een monster met een reden.
 *
 * Het monster blijft in de lijst staan, telt niet mee in de planning en de
 * tijdsberekening, en is terug te draaien via /uncancel. De reden komt in een
 * eigen veld, niet in het opmerkingenveld: daar werd hij overschreven zodra er
 * een hermonstering bijkwam.
 */
const AnnuleerSchema = z.object({
  reason: z.string({ error: 'Kies een reden' }).optional(),
  toelichting: optioneleTekst(1000),
  cancelReasonInPdf: z.boolean().optional(),
});

export const PATCH = apiRoute({ rol: 'admin', module: 'oliemonsters', fout: 'Fout bij annuleren van het monster', ontbreekt: TABEL_ONTBREEKT_PLANNING }, async (request, context, session) => {
  const sampleId = await leesId(context, 'Onbekend monster');

  const body = await leesJson(request, AnnuleerSchema);
  const reden = bouwAnnuleerReden(body.reason, body.toelichting);
  if ('fout' in reden) {
    throw new ApiFout(400, reden.fout);
  }
  const inPdf = body.cancelReasonInPdf === false ? false : true;

  const sample = await prisma.oilSample.findUnique({
    where: { id: sampleId, ...(await actiefFilter()) },
    select: { id: true, oNumber: true, analysisYear: true, isDisabled: true },
  });
  if (!sample) {
    throw new ApiFout(404, 'Monster niet gevonden');
  }
  // Niet twee keer annuleren: anders overschrijf je wie het wanneer en waarom
  // deed, en dat is precies wat we wilden vastleggen.
  if (sample.isDisabled) {
    throw new ApiFout(400, 'Dit monster is al geannuleerd. Draai de annulering eerst terug als je de reden wilt wijzigen.');
  }

  const bijgewerkt = await prisma.oilSample.update({
    where: { id: sampleId },
    data: {
      isDisabled: true,
      cancelReason: reden.tekst,
      cancelledAt: new Date(),
      cancelledBy: session.username || 'onbekend',
      cancelReasonInPdf: inPdf,
    },
    select: { id: true, isDisabled: true, cancelReason: true, cancelledAt: true, cancelledBy: true, cancelReasonInPdf: true },
  });

  await createAuditLog({
    userId: session.userId,
    username: session.username || 'unknown',
    action: AuditActions.CANCEL_SAMPLE,
    details: {
      id: sampleId,
      oNumber: sample.oNumber,
      analysisYear: sample.analysisYear,
      reden: reden.tekst,
      redenInPdf: inPdf,
    },
    request,
  });

  return NextResponse.json(bijgewerkt);
});
