import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { verwijderKolomBestaat, KOLOM_ONTBREEKT_VERWIJDEREN } from '@/lib/verwijderdeMonsters';

/**
 * POST - Zet een verwijderd monster terug uit de prullenbak (alleen admin).
 * Pogingen, datums en foto's zijn nooit weg geweest, dus die komen vanzelf mee.
 * Ook gebruikt door de knop Ongedaan maken direct na het verwijderen.
 */
export const POST = apiRoute({ rol: 'admin', module: 'oliemonsters', fout: 'Fout bij terugzetten van het monster' }, async (request, context, session) => {
  const sampleId = await leesId(context, 'Onbekend monster');
  if (!(await verwijderKolomBestaat())) {
    throw new ApiFout(503, KOLOM_ONTBREEKT_VERWIJDEREN, { tabelOntbreekt: true });
  }

  const sample = await prisma.oilSample.findUnique({
    where: { id: sampleId },
    select: { oNumber: true, analysisYear: true, deletedAt: true, deletedBy: true },
  });
  if (!sample) {
    throw new ApiFout(404, 'Monster niet gevonden');
  }
  if (!sample.deletedAt) {
    return NextResponse.json({ success: true, id: sampleId, oNumber: sample.oNumber, alTerug: true });
  }

  await prisma.oilSample.update({
    where: { id: sampleId },
    data: { deletedAt: null, deletedBy: null },
    select: { id: true },
  });

  await createAuditLog({
    userId: session.userId,
    username: session.username || 'unknown',
    action: AuditActions.RESTORE_SAMPLE,
    details: {
      id: sampleId,
      oNumber: sample.oNumber,
      analysisYear: sample.analysisYear,
      verwijderdOp: sample.deletedAt,
      verwijderdDoor: sample.deletedBy,
    },
    request,
  });

  return NextResponse.json({ success: true, id: sampleId, oNumber: sample.oNumber });
});
