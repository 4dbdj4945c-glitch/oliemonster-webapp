import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { TABEL_ONTBREEKT_PLANNING } from '@/lib/planningApi';
import { actiefFilter } from '@/lib/verwijderdeMonsters';

/**
 * PATCH - Draai de annulering van een monster terug. Het monster telt daarna
 * weer mee. De oude reden gaat eruit, maar blijft in het logboek staan.
 */
export const PATCH = apiRoute({ rol: 'admin', module: 'oliemonsters', fout: 'Fout bij terugdraaien van de annulering', ontbreekt: TABEL_ONTBREEKT_PLANNING }, async (request, context, session) => {
  const sampleId = await leesId(context, 'Onbekend monster');

  const sample = await prisma.oilSample.findUnique({
    where: { id: sampleId, ...(await actiefFilter()) },
    select: { id: true, oNumber: true, analysisYear: true, isDisabled: true, cancelReason: true },
  });
  if (!sample) {
    throw new ApiFout(404, 'Monster niet gevonden');
  }

  const bijgewerkt = await prisma.oilSample.update({
    where: { id: sampleId },
    data: {
      isDisabled: false,
      cancelReason: null,
      cancelledAt: null,
      cancelledBy: null,
      cancelReasonInPdf: true,
    },
    select: { id: true, isDisabled: true, cancelReason: true },
  });

  await createAuditLog({
    userId: session.userId,
    username: session.username || 'unknown',
    action: AuditActions.UNCANCEL_SAMPLE,
    details: {
      id: sampleId,
      oNumber: sample.oNumber,
      analysisYear: sample.analysisYear,
      vorigeReden: sample.cancelReason,
    },
    request,
  });

  return NextResponse.json(bijgewerkt);
});
