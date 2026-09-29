import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { apiRoute, ApiFout, jaarSchema, leesJson, optioneleTekst } from '@/lib/apiRoute';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { TABEL_ONTBREEKT_PLANNING } from '@/lib/planningApi';
import { bouwAnnuleerReden } from '@/lib/cancelReasons';
import { actiefFilter } from '@/lib/verwijderdeMonsters';

/**
 * POST - Annuleer in één keer alle nog openstaande monsters van een object in een
 * analysejaar, met dezelfde reden. Dit is het geval Stuw Grave: een heel object
 * valt weg, en dat ging de vorige keer met een wegwerpscript buiten de app om.
 *
 * Al genomen monsters blijven met rust; die hebben een uitslag.
 */
const BulkSchema = z.object({
  objectId: z.coerce.number({ error: 'Kies een object en een analysejaar' }).int({ error: 'Kies een object en een analysejaar' }).positive({ error: 'Kies een object en een analysejaar' }),
  analysisYear: jaarSchema,
  reason: z.string({ error: 'Kies een reden' }).optional(),
  toelichting: optioneleTekst(1000),
  cancelReasonInPdf: z.boolean().optional(),
});

export const POST = apiRoute({ rol: 'admin', module: 'oliemonsters', fout: 'Fout bij annuleren van de monsters', ontbreekt: TABEL_ONTBREEKT_PLANNING }, async (request, _context, session) => {
  const body = await leesJson(request, BulkSchema);
  const objectId = body.objectId;
  const jaar = body.analysisYear;

  const reden = bouwAnnuleerReden(body.reason, body.toelichting);
  if ('fout' in reden) {
    throw new ApiFout(400, reden.fout);
  }
  const inPdf = body.cancelReasonInPdf === false ? false : true;

  const object = await prisma.sampleObject.findUnique({
    where: { id: objectId },
    select: { id: true, name: true },
  });
  if (!object) {
    throw new ApiFout(404, 'Object niet gevonden');
  }

  const teAnnuleren = await prisma.oilSample.findMany({
    where: { objectId, analysisYear: jaar, isDisabled: false, isTaken: false, ...(await actiefFilter()) },
    select: { id: true, oNumber: true },
  });

  if (teAnnuleren.length === 0) {
    return NextResponse.json({
      aantal: 0,
      melding: `Er staan geen openstaande monsters van ${object.name} in ${jaar}.`,
    });
  }

  const resultaat = await prisma.oilSample.updateMany({
    where: { id: { in: teAnnuleren.map((s) => s.id) } },
    data: {
      isDisabled: true,
      cancelReason: reden.tekst,
      cancelledAt: new Date(),
      cancelledBy: session.username || 'onbekend',
      cancelReasonInPdf: inPdf,
    },
  });

  await createAuditLog({
    userId: session.userId,
    username: session.username || 'unknown',
    action: AuditActions.CANCEL_SAMPLE,
    details: {
      object: object.name,
      objectId,
      analysisYear: jaar,
      aantal: resultaat.count,
      oNummers: teAnnuleren.map((s) => s.oNumber),
      reden: reden.tekst,
      redenInPdf: inPdf,
    },
    request,
  });

  return NextResponse.json({
    aantal: resultaat.count,
    melding: `${resultaat.count} monsters van ${object.name} geannuleerd.`,
  });
});
