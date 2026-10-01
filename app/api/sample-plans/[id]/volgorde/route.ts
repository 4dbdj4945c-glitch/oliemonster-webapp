import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { foutAntwoord } from '@/lib/planningApi';
import { berekenRouteVoorDag, haalPlanning, zetStopVolgorde } from '@/lib/samplePlans';

/**
 * POST - Volgorde van de objecten op een dag met de hand zetten (alleen admin).
 *
 * Zodra jij zelf schuift is dat leidend: de dag krijgt `manualOrder` en de
 * automatische berekening laat de volgorde daarna met rust. De route wordt wel
 * opnieuw opgehaald, zodat afstand en rijtijd bij de nieuwe volgorde horen.
 */
export const POST = withAuth({ rol: 'admin', module: 'planning' }, async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  session
) => {
  try {
    const { id } = await params;
    const planId = parseInt(id);
    if (Number.isNaN(planId)) {
      return NextResponse.json({ error: 'Onbekende dag' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const stopIds: number[] = Array.isArray(body.stopIds)
      ? body.stopIds.map((n: unknown) => parseInt(String(n))).filter((n: number) => !Number.isNaN(n))
      : [];
    if (stopIds.length === 0) {
      return NextResponse.json({ error: 'Geef de volgorde van de stops mee' }, { status: 400 });
    }

    const [plan, stops] = await Promise.all([
      prisma.samplePlan.findUnique({ where: { id: planId }, select: { analysisYear: true } }),
      prisma.samplePlanStop.findMany({
        where: { planId },
        select: { id: true, object: { select: { lat: true, lng: true } } },
      }),
    ]);
    if (!plan) {
      return NextResponse.json({ error: 'Dag niet gevonden' }, { status: 404 });
    }
    const bekend = new Set(stops.map((s) => s.id));
    if (stopIds.length !== stops.length || stopIds.some((sid) => !bekend.has(sid))) {
      return NextResponse.json({ error: 'De volgorde klopt niet met de stops van deze dag' }, { status: 400 });
    }

    // De nieuwe volgorde in één query, en de dag op handmatig.
    await Promise.all([
      zetStopVolgorde(stopIds.map((sid, i) => ({ id: sid, orderIndex: i }))),
      prisma.samplePlan.update({ where: { id: planId }, data: { manualOrder: true }, select: { id: true } }),
    ]);

    // Route bij de nieuwe volgorde ophalen, zonder de volgorde te wijzigen. De
    // stops hebben we al, in de nieuwe volgorde.
    const perId = new Map(stops.map((s) => [s.id, s]));
    const route = await berekenRouteVoorDag(planId, true, stopIds.map((sid) => perId.get(sid)!));

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPDATE_SAMPLE_PLAN,
      details: { id: planId, handmatigeVolgorde: stopIds },
      request,
    });

    return NextResponse.json({ success: true, ...route, planning: await haalPlanning(plan.analysisYear) });
  } catch (error) {
    return foutAntwoord(error, 'Fout bij opslaan van de volgorde');
  }
});
