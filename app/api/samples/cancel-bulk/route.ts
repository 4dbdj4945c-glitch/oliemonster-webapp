import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout, foutAntwoord } from '@/lib/planningApi';
import { bouwAnnuleerReden } from '@/lib/cancelReasons';
import { actiefFilter } from '@/lib/verwijderdeMonsters';

/**
 * POST - Annuleer in één keer alle nog openstaande monsters van een object in een
 * analysejaar, met dezelfde reden. Dit is het geval Stuw Grave: een heel object
 * valt weg, en dat ging de vorige keer met een wegwerpscript buiten de app om.
 *
 * Al genomen monsters blijven met rust; die hebben een uitslag.
 */
export async function POST(request: NextRequest) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const body = await request.json().catch(() => ({}));
    const objectId = parseInt(String(body.objectId ?? ''));
    const jaar = parseInt(String(body.analysisYear ?? ''));
    if (Number.isNaN(objectId) || Number.isNaN(jaar)) {
      return NextResponse.json({ error: 'Kies een object en een analysejaar' }, { status: 400 });
    }

    const reden = bouwAnnuleerReden(body.reason, body.toelichting);
    if ('fout' in reden) {
      return NextResponse.json({ error: reden.fout }, { status: 400 });
    }
    const inPdf = body.cancelReasonInPdf === false ? false : true;

    const object = await prisma.sampleObject.findUnique({
      where: { id: objectId },
      select: { id: true, name: true },
    });
    if (!object) {
      return NextResponse.json({ error: 'Object niet gevonden' }, { status: 404 });
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
  } catch (error) {
    return foutAntwoord(error, 'Fout bij annuleren van de monsters');
  }
}
