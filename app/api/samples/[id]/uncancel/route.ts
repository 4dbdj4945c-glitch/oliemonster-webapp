import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { foutAntwoord } from '@/lib/planningApi';
import { actiefFilter } from '@/lib/verwijderdeMonsters';

/**
 * PATCH - Draai de annulering van een monster terug. Het monster telt daarna
 * weer mee. De oude reden gaat eruit, maar blijft in het logboek staan.
 */
export const PATCH = withAuth({ rol: 'admin', module: 'oliemonsters' }, async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  session
) => {
  try {
    const { id } = await params;
    const sampleId = parseInt(id);
    if (Number.isNaN(sampleId)) {
      return NextResponse.json({ error: 'Onbekend monster' }, { status: 400 });
    }

    const sample = await prisma.oilSample.findUnique({
      where: { id: sampleId, ...(await actiefFilter()) },
      select: { id: true, oNumber: true, analysisYear: true, isDisabled: true, cancelReason: true },
    });
    if (!sample) {
      return NextResponse.json({ error: 'Monster niet gevonden' }, { status: 404 });
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
  } catch (error) {
    return foutAntwoord(error, 'Fout bij terugdraaien van de annulering');
  }
});
