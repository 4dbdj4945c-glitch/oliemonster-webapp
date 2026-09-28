import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout, foutAntwoord } from '@/lib/planningApi';
import { schrijfSampleIds } from '@/lib/samplePlans';

/**
 * POST - Zet een object op een dag (alleen admin).
 *
 * Met `sampleIds` neem je maar een deel van de monsters mee. Zo splits je een
 * object met veel monsters over twee dagen en weet je in het veld welke monsters
 * bij welke dag horen. Zonder `sampleIds` horen alle openstaande monsters van
 * het object bij dit bezoek.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const { id } = await params;
    const planId = parseInt(id);
    if (Number.isNaN(planId)) {
      return NextResponse.json({ error: 'Onbekende dag' }, { status: 400 });
    }

    const plan = await prisma.samplePlan.findUnique({
      where: { id: planId },
      select: { id: true, analysisYear: true },
    });
    if (!plan) {
      return NextResponse.json({ error: 'Dag niet gevonden' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const objectId = parseInt(String(body.objectId ?? ''));
    if (Number.isNaN(objectId)) {
      return NextResponse.json({ error: 'Kies een object' }, { status: 400 });
    }

    const object = await prisma.sampleObject.findUnique({
      where: { id: objectId },
      select: { id: true, name: true },
    });
    if (!object) {
      return NextResponse.json({ error: 'Object niet gevonden' }, { status: 404 });
    }

    const sampleIds = schrijfSampleIds(body.sampleIds);
    const minuten = parseInt(String(body.plannedMinutes ?? ''));

    // Achteraan in de volgorde van die dag.
    const laatste = await prisma.samplePlanStop.findFirst({
      where: { planId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });

    const stop = await prisma.samplePlanStop.create({
      data: {
        planId,
        objectId,
        sampleIds,
        orderIndex: (laatste?.orderIndex ?? -1) + 1,
        plannedMinutes: Number.isNaN(minuten) || minuten <= 0 ? null : minuten,
      },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.ADD_PLAN_STOP,
      details: { planId, stopId: stop.id, object: object.name, monsters: sampleIds ? JSON.parse(sampleIds).length : 'alle' },
      request,
    });

    return NextResponse.json(stop, { status: 201 });
  } catch (error) {
    return foutAntwoord(error, 'Fout bij inplannen van het object');
  }
}
