import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { foutAntwoord } from '@/lib/planningApi';
import { schrijfSampleIds } from '@/lib/samplePlans';

/**
 * PATCH - Een stop bijwerken (alleen admin): afvinken, starten, stoppen, de
 * geplande tijd aanpassen of een andere selectie monsters meenemen.
 *
 * Het dagscherm gebruikt deze route voor start, stop en afvinken; daarom houden
 * we hem klein en accepteren we alleen de velden die meegestuurd worden.
 */
export const PATCH = withAuth({ rol: 'admin', module: 'planning' }, async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stopId: string }> },
  session
) => {
  try {
    const { id, stopId } = await params;
    const planId = parseInt(id);
    const sId = parseInt(stopId);
    if (Number.isNaN(planId) || Number.isNaN(sId)) {
      return NextResponse.json({ error: 'Onbekende stop' }, { status: 400 });
    }

    const bestaand = await prisma.samplePlanStop.findUnique({
      where: { id: sId },
      select: { id: true, planId: true, objectId: true, startedAt: true },
    });
    if (!bestaand || bestaand.planId !== planId) {
      return NextResponse.json({ error: 'Stop niet gevonden' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const data: Record<string, unknown> = {};

    if (typeof body.isDone === 'boolean') {
      data.isDone = body.isDone;
      data.doneAt = body.isDone ? new Date() : null;
    }

    // Starten en stoppen op locatie. "stop" zet meteen de eindtijd.
    if (body.actie === 'start') {
      data.startedAt = new Date();
      data.endedAt = null;
    }
    if (body.actie === 'stop') {
      if (!bestaand.startedAt) {
        return NextResponse.json({ error: 'Deze stop is nog niet gestart' }, { status: 400 });
      }
      data.endedAt = new Date();
    }
    if (body.actie === 'wis-tijden') {
      data.startedAt = null;
      data.endedAt = null;
    }

    if ('plannedMinutes' in body) {
      const n = parseInt(String(body.plannedMinutes ?? ''));
      data.plannedMinutes = Number.isNaN(n) || n <= 0 ? null : n;
    }
    if ('sampleIds' in body) {
      data.sampleIds = schrijfSampleIds(body.sampleIds);
    }
    if ('orderIndex' in body) {
      const n = parseInt(String(body.orderIndex ?? ''));
      if (!Number.isNaN(n)) data.orderIndex = n;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Niets om bij te werken' }, { status: 400 });
    }

    const stop = await prisma.samplePlanStop.update({ where: { id: sId }, data: data as never });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPDATE_PLAN_STOP,
      details: { planId, stopId: sId, velden: Object.keys(data), actie: body.actie ?? null },
      request,
    });

    return NextResponse.json(stop);
  } catch (error) {
    return foutAntwoord(error, 'Fout bij bijwerken van de stop');
  }
});

// DELETE - Object van de dag halen (alleen admin)
export const DELETE = withAuth({ rol: 'admin', module: 'planning' }, async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stopId: string }> },
  session
) => {
  try {
    const { id, stopId } = await params;
    const planId = parseInt(id);
    const sId = parseInt(stopId);
    if (Number.isNaN(planId) || Number.isNaN(sId)) {
      return NextResponse.json({ error: 'Onbekende stop' }, { status: 400 });
    }

    const bestaand = await prisma.samplePlanStop.findUnique({
      where: { id: sId },
      select: { id: true, planId: true, object: { select: { name: true } } },
    });
    if (!bestaand || bestaand.planId !== planId) {
      return NextResponse.json({ error: 'Stop niet gevonden' }, { status: 404 });
    }

    await prisma.samplePlanStop.delete({ where: { id: sId } });

    // Opnieuw doornummeren, anders blijven er gaten in de volgorde zitten.
    const over = await prisma.samplePlanStop.findMany({
      where: { planId },
      orderBy: { orderIndex: 'asc' },
      select: { id: true },
    });
    for (let i = 0; i < over.length; i++) {
      await prisma.samplePlanStop.update({
        where: { id: over[i].id },
        data: { orderIndex: i },
        select: { id: true },
      });
    }

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_PLAN_STOP,
      details: { planId, stopId: sId, object: bestaand.object.name },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return foutAntwoord(error, 'Fout bij weghalen van de stop');
  }
});
