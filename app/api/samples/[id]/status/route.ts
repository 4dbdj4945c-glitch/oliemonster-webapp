import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { syncLatestAttemptToSample } from '@/lib/sampleAttempts';
import { isOilViewer2025 } from '@/lib/roles';

/**
 * PATCH - Zet een monster met één handeling op genomen of niet genomen.
 *
 * Dit is de hoofdhandeling in de monsterlijst: één tik op de statuscel in plaats
 * van vijf handelingen via het bewerkvenster. Bij "genomen" komt de datum op
 * vandaag, tenzij er al een datum meegestuurd wordt.
 *
 * De velden op OilSample zijn een spiegel van de meest recente poging
 * (SampleAttempt). Bestaat die poging, dan werken we die bij en laten we de
 * bestaande synchronisatie het monster bijwerken; anders zetten we het monster
 * zelf. Zo blijft de status kloppen zodra er een hermonstering bijkomt.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }
    // De beperkte kijker mag niets wijzigen, ook niet via de API.
    if (isOilViewer2025(session.role)) {
      return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Alleen admins kunnen de status wijzigen' }, { status: 403 });
    }

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

    const sample = await prisma.oilSample.findUnique({
      where: { id: sampleId },
      select: { id: true, oNumber: true, isTaken: true, isDisabled: true, analysisYear: true },
    });
    if (!sample) {
      return NextResponse.json({ error: 'Monster niet gevonden' }, { status: 404 });
    }
    if (sample.isDisabled) {
      return NextResponse.json(
        { error: 'Dit monster is geannuleerd. Draai de annulering eerst terug.' },
        { status: 400 }
      );
    }

    // Datum: meegestuurd, anders vandaag. Bij "niet genomen" gaat de datum eruit,
    // net zoals in het bewerkvenster.
    let sampleDate: Date | null = null;
    if (isTaken) {
      const gekozen = typeof body.sampleDate === 'string' && body.sampleDate ? new Date(body.sampleDate) : new Date();
      sampleDate = Number.isNaN(gekozen.getTime()) ? new Date() : gekozen;
    }

    const laatste = await prisma.sampleAttempt.findFirst({
      where: { oilSampleId: sampleId },
      orderBy: [{ sampleDate: 'desc' }, { createdAt: 'desc' }],
      select: { id: true },
    });

    if (laatste) {
      await prisma.sampleAttempt.update({
        where: { id: laatste.id },
        data: { isTaken, sampleDate },
        select: { id: true },
      });
      await syncLatestAttemptToSample(sampleId);
    } else {
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
      },
      request,
    });

    return NextResponse.json({ id: sampleId, isTaken, sampleDate });
  } catch (error) {
    console.error('Error updating sample status:', error);
    return NextResponse.json({ error: 'Fout bij bijwerken van de status' }, { status: 500 });
  }
}
