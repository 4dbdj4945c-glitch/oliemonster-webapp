import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { foutAntwoord } from '@/lib/planningApi';
import { haalPlanDag, haalPlanning, schrijfSampleIds, zetStopVolgorde } from '@/lib/samplePlans';
import { haalPlanningScherm } from '@/lib/planningScherm';
import { maakUitvoeringOngedaan, registreerUitvoering } from '@/lib/contractenServer';
import { nlDag } from '@/lib/klantOpdracht';
import { vandaagNl } from '@/lib/contracten';

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
      select: { id: true, planId: true, objectId: true, startedAt: true, isDone: true, taakId: true, plan: { select: { date: true } } },
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

    // Een contracttaak die je op de dag afvinkt, is uitgevoerd op die dag: de
    // volgende datum schuift door. Weer open (Toch niet klaar): terug.
    // Afvinken voor de planningsdag (een dag eerder gedaan): de werkelijke dag telt.
    let taak: { volgendeOp: string } | null = null;
    let taakTerug: boolean | null = null;
    if (bestaand.taakId && typeof body.isDone === 'boolean' && body.isDone !== bestaand.isDone) {
      const bron = `stop-${sId}`;
      if (body.isDone) {
        const planDag = nlDag(bestaand.plan.date);
        const vandaag = vandaagNl();
        taak = await registreerUitvoering(bestaand.taakId, { datum: planDag > vandaag ? vandaag : planDag, bron, door: session.username || null });
      } else {
        // Niet stil niets doen: zeg het als de taak niet terug kon (er kwam een latere uitvoering bij).
        taakTerug = await maakUitvoeringOngedaan(bestaand.taakId, bron);
      }
    }

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPDATE_PLAN_STOP,
      details: { planId, stopId: sId, velden: Object.keys(data), actie: body.actie ?? null, ...(bestaand.taakId ? { taakId: bestaand.taakId } : {}) },
      request,
    });

    // De dag zoals hij nu is, voor het dagscherm: dat hoeft hem dan niet opnieuw op te halen.
    return NextResponse.json({
      ...stop,
      ...(taak ? { volgendeOp: taak.volgendeOp } : {}),
      ...(taakTerug !== null ? { taakTerug } : {}),
      dag: await haalPlanDag(planId),
    });
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
      select: { id: true, planId: true, isDone: true, taakId: true, inspectieId: true, object: { select: { name: true } }, plan: { select: { analysisYear: true } } },
    });
    if (!bestaand || bestaand.planId !== planId) {
      return NextResponse.json({ error: 'Stop niet gevonden' }, { status: 404 });
    }

    await prisma.samplePlanStop.delete({ where: { id: sId } });
    // Een afgevinkte taak die van de dag gaat, is ook niet meer uitgevoerd.
    if (bestaand.taakId && bestaand.isDone) await maakUitvoeringOngedaan(bestaand.taakId, `stop-${sId}`);

    // Opnieuw doornummeren, anders blijven er gaten in de volgorde zitten.
    const over = await prisma.samplePlanStop.findMany({
      where: { planId },
      orderBy: { orderIndex: 'asc' },
      select: { id: true },
    });
    await zetStopVolgorde(over.map((s, i) => ({ id: s.id, orderIndex: i })));

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_PLAN_STOP,
      details: { planId, stopId: sId, object: bestaand.object.name },
      request,
    });

    // Ging er een taak of inspectie van de dag, dan staat die weer bij Nog in te plannen.
    const jaar = bestaand.plan.analysisYear;
    const planning = bestaand.taakId || bestaand.inspectieId ? await haalPlanningScherm(jaar) : await haalPlanning(jaar);
    return NextResponse.json({ success: true, planning });
  } catch (error) {
    return foutAntwoord(error, 'Fout bij weghalen van de stop');
  }
});
