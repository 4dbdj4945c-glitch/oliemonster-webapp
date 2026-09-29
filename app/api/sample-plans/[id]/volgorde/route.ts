import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { foutAntwoord } from '@/lib/planningApi';
import { berekenRouteVoorDag } from '@/lib/samplePlans';

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

    const stops = await prisma.samplePlanStop.findMany({
      where: { planId },
      select: { id: true },
    });
    const bekend = new Set(stops.map((s) => s.id));
    if (stopIds.length !== stops.length || stopIds.some((sid) => !bekend.has(sid))) {
      return NextResponse.json({ error: 'De volgorde klopt niet met de stops van deze dag' }, { status: 400 });
    }

    for (let i = 0; i < stopIds.length; i++) {
      await prisma.samplePlanStop.update({
        where: { id: stopIds[i] },
        data: { orderIndex: i },
        select: { id: true },
      });
    }
    await prisma.samplePlan.update({
      where: { id: planId },
      data: { manualOrder: true },
      select: { id: true },
    });

    // Route bij de nieuwe volgorde ophalen, zonder de volgorde te wijzigen.
    const route = await berekenRouteVoorDag(planId, true);

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPDATE_SAMPLE_PLAN,
      details: { id: planId, handmatigeVolgorde: stopIds },
      request,
    });

    return NextResponse.json({ success: true, ...route });
  } catch (error) {
    return foutAntwoord(error, 'Fout bij opslaan van de volgorde');
  }
});
