import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { foutAntwoord } from '@/lib/planningApi';
import { berekenPlanning } from '@/lib/samplePlans';

/**
 * POST - Volgorde en route uitrekenen over de hele periode (alleen admin).
 *
 * Met `herverdeel: true` verdeelt hij de objecten ook opnieuw over de dagen, tot
 * een dag vol is. Dagen die jij met de hand hebt gezet blijven staan; daar wordt
 * alleen de route opnieuw opgehaald. Valt de routedienst uit, dan blijft de
 * planning werken met rechte lijnen (zoals bij de controlerondes).
 */
// De route van elke dag wordt apart bij OSRM opgehaald; met twintig dagen duurt
// dat langer dan de standaardlimiet van tien seconden op Vercel.
export const maxDuration = 60;

export const POST = withAuth({ rol: 'admin', module: 'planning' }, async (request: NextRequest, _context, session) => {
  try {
    const body = await request.json().catch(() => ({}));
    const jaar = parseInt(String(body.analysisYear ?? ''));
    if (Number.isNaN(jaar)) {
      return NextResponse.json({ error: 'Kies een analysejaar' }, { status: 400 });
    }
    const herverdeel = body.herverdeel === true;

    const resultaat = await berekenPlanning(jaar, herverdeel);

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CALCULATE_PLAN_ROUTE,
      details: { analysisYear: jaar, herverdeel, ...resultaat },
      request,
    });

    return NextResponse.json(resultaat);
  } catch (error) {
    return foutAntwoord(error, 'Fout bij uitrekenen van de route');
  }
});
