import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { verwijderKolomBestaat, KOLOM_ONTBREEKT_VERWIJDEREN } from '@/lib/verwijderdeMonsters';

/**
 * POST - Zet een verwijderd monster terug uit de prullenbak (alleen admin).
 * Pogingen, datums en foto's zijn nooit weg geweest, dus die komen vanzelf mee.
 * Ook gebruikt door de knop Ongedaan maken direct na het verwijderen.
 */
export const POST = withAuth({ rol: 'admin', module: 'oliemonsters' }, async (
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
    if (!(await verwijderKolomBestaat())) {
      return NextResponse.json({ error: KOLOM_ONTBREEKT_VERWIJDEREN, tabelOntbreekt: true }, { status: 503 });
    }

    const sample = await prisma.oilSample.findUnique({
      where: { id: sampleId },
      select: { oNumber: true, analysisYear: true, deletedAt: true, deletedBy: true },
    });
    if (!sample) {
      return NextResponse.json({ error: 'Monster niet gevonden' }, { status: 404 });
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
  } catch (error) {
    console.error('Error restoring sample:', error);
    return NextResponse.json({ error: 'Fout bij terugzetten van het monster' }, { status: 500 });
  }
});
