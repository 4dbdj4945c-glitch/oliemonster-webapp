import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout } from '@/lib/toegang';
import { tabelOntbreekt } from '@/lib/kolommen';
import { actiefFilter } from '@/lib/verwijderdeMonsters';

/**
 * PATCH - Zet een monster met één handeling op genomen of niet genomen.
 *
 * Dit is de hoofdhandeling in de monsterlijst: één tik op de statuscel in plaats
 * van vijf handelingen via het bewerkvenster. Bij "genomen" komt de datum op
 * vandaag, tenzij er al een datum meegestuurd wordt.
 *
 * De velden op OilSample zijn een spiegel van de meest recente poging
 * (SampleAttempt). Bestaat die poging, dan zetten we de status op allebei, zodat
 * hij blijft kloppen zodra er een hermonstering bijkomt.
 *
 * Bewust géén syncLatestAttemptToSample: die spiegelt ook remarks en photoUrl
 * terug, en het bewerkvenster schrijft de opmerking op het monster zelf. Eén tik
 * op de status zou die opmerking dan stilletjes wissen. Deze route raakt alleen
 * de status en de datum aan. De datum van een bestaande poging blijft staan als
 * je op "niet genomen" zet, anders ben je een afnamedatum kwijt die je niet
 * terugkrijgt; de lijst toont de datum toch alleen bij een genomen monster.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // De rol alleen lezen mag niets wijzigen, ook niet via de API.
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
    if (typeof body.isTaken !== 'boolean') {
      return NextResponse.json({ error: 'Geef mee of het monster genomen is' }, { status: 400 });
    }
    const isTaken: boolean = body.isTaken;

    const basis = { id: true, oNumber: true, isTaken: true, isDisabled: true, analysisYear: true, sampleDate: true } as const;
    let sample: { id: number; oNumber: string; isTaken: boolean; isDisabled: boolean; analysisYear: number; sampleDate: Date | null; isUnreachable?: boolean } | null;
    try {
      sample = await prisma.oilSample.findUnique({
        where: { id: sampleId, ...(await actiefFilter()) },
        select: { ...basis, isUnreachable: true },
      });
    } catch (error) {
      if (!tabelOntbreekt(error)) throw error;
      sample = await prisma.oilSample.findUnique({ where: { id: sampleId, ...(await actiefFilter()) }, select: basis });
    }
    if (!sample) {
      return NextResponse.json({ error: 'Monster niet gevonden' }, { status: 404 });
    }
    if (sample.isDisabled) {
      return NextResponse.json(
        { error: 'Dit monster is geannuleerd. Draai de annulering eerst terug.' },
        { status: 400 }
      );
    }

    const laatste = await prisma.sampleAttempt.findFirst({
      where: { oilSampleId: sampleId },
      orderBy: [{ sampleDate: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, sampleDate: true },
    });

    // Datum bij "genomen": de meegestuurde datum, anders de datum die er al
    // stond, anders vandaag. Bij "niet genomen" blijft de datum staan.
    const bestaandeDatum = laatste ? laatste.sampleDate : sample.sampleDate;
    let sampleDate: Date | null = bestaandeDatum;
    if (isTaken) {
      const gekozen =
        typeof body.sampleDate === 'string' && body.sampleDate ? new Date(body.sampleDate) : null;
      sampleDate =
        gekozen && !Number.isNaN(gekozen.getTime()) ? gekozen : bestaandeDatum ?? new Date();
    }

    if (laatste) {
      await prisma.sampleAttempt.update({
        where: { id: laatste.id },
        data: { isTaken, sampleDate },
        select: { id: true },
      });
    }
    // Een genomen monster is niet meer onbereikbaar: die registratie gaat eruit,
    // anders houdt het monster twee statussen tegelijk. De reden blijft in het
    // logboek staan.
    const wasOnbereikbaar = sample.isUnreachable === true;
    const wisOnbereikbaar = isTaken && wasOnbereikbaar;
    try {
      await prisma.oilSample.update({
        where: { id: sampleId },
        data: {
          isTaken,
          sampleDate,
          ...(wisOnbereikbaar
            ? {
                isUnreachable: false,
                unreachableReason: null,
                unreachableNote: null,
                unreachablePhotoUrl: null,
                unreachableAt: null,
                unreachableBy: null,
              }
            : {}),
        },
        select: { id: true },
      });
    } catch (error) {
      if (!tabelOntbreekt(error)) throw error;
      // Kolommen van Niet bereikbaar staan er nog niet: alleen de status zetten.
      await prisma.oilSample.update({
        where: { id: sampleId },
        data: { isTaken, sampleDate },
        select: { id: true },
      });
    }

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.SET_SAMPLE_STATUS,
      details: {
        id: sampleId,
        oNumber: sample.oNumber,
        analysisYear: sample.analysisYear,
        van: sample.isTaken ? 'genomen' : 'niet genomen',
        naar: isTaken ? 'genomen' : 'niet genomen',
        vorigeDatum: bestaandeDatum,
        nieuweDatum: sampleDate,
        onbereikbaarGewist: wisOnbereikbaar,
      },
      request,
    });

    return NextResponse.json({ id: sampleId, isTaken, sampleDate });
  } catch (error) {
    console.error('Error updating sample status:', error);
    return NextResponse.json({ error: 'Fout bij bijwerken van de status' }, { status: 500 });
  }
}
