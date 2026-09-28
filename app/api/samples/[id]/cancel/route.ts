import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout, foutAntwoord } from '@/lib/planningApi';
import { bouwAnnuleerReden } from '@/lib/cancelReasons';

/**
 * PATCH - Annuleer een monster met een reden.
 *
 * Het monster blijft in de lijst staan, telt niet mee in de planning en de
 * tijdsberekening, en is terug te draaien via /uncancel. De reden komt in een
 * eigen veld, niet in het opmerkingenveld: daar werd hij overschreven zodra er
 * een hermonstering bijkwam.
 */
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

    const body = await request.json().catch(() => ({}));
    const reden = bouwAnnuleerReden(body.reason, body.toelichting);
    if ('fout' in reden) {
      return NextResponse.json({ error: reden.fout }, { status: 400 });
    }
    const inPdf = body.cancelReasonInPdf === false ? false : true;

    const sample = await prisma.oilSample.findUnique({
      where: { id: sampleId },
      select: { id: true, oNumber: true, analysisYear: true, isDisabled: true },
    });
    if (!sample) {
      return NextResponse.json({ error: 'Monster niet gevonden' }, { status: 404 });
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
  } catch (error) {
    return foutAntwoord(error, 'Fout bij annuleren van het monster');
  }
}
