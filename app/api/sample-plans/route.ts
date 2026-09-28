import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout, foutAntwoord } from '@/lib/planningApi';
import { haalPlanning } from '@/lib/samplePlans';

/**
 * De dagen van de planning. Lezen mag iedereen die is ingelogd behalve de
 * beperkte kijker (die wordt in toegangsFout geweigerd, ook serverside);
 * plannen mag alleen een admin.
 */

// GET - Alle dagen van een analysejaar, met stops, monsters en tijden, plus de
// objecten met wat er nog ingepland moet worden.
export async function GET(request: NextRequest) {
  const session = await haalSessie();
  const fout = toegangsFout(session, false);
  if (fout) return fout;

  try {
    const { searchParams } = new URL(request.url);
    const jaar = parseInt(searchParams.get('year') || '');
    if (Number.isNaN(jaar)) {
      return NextResponse.json({ error: 'Kies een analysejaar' }, { status: 400 });
    }
    return NextResponse.json(await haalPlanning(jaar));
  } catch (error) {
    return foutAntwoord(error, 'Fout bij ophalen van de planning');
  }
}

// POST - Nieuwe dag (alleen admin)
export async function POST(request: NextRequest) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const body = await request.json().catch(() => ({}));
    const jaar = parseInt(String(body.analysisYear ?? ''));
    const datumTekst = typeof body.date === 'string' ? body.date : '';
    if (Number.isNaN(jaar) || !datumTekst) {
      return NextResponse.json({ error: 'Kies een datum en een analysejaar' }, { status: 400 });
    }
    const datum = new Date(`${datumTekst}T00:00:00`);
    if (Number.isNaN(datum.getTime())) {
      return NextResponse.json({ error: 'Die datum begrijp ik niet' }, { status: 400 });
    }

    const bestaat = await prisma.samplePlan.findFirst({
      where: { date: datum, analysisYear: jaar },
      select: { id: true },
    });
    if (bestaat) {
      return NextResponse.json({ error: 'Deze dag staat al in de planning' }, { status: 400 });
    }

    const plan = await prisma.samplePlan.create({
      data: {
        date: datum,
        analysisYear: jaar,
        notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
      },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CREATE_SAMPLE_PLAN,
      details: { id: plan.id, datum: datumTekst, analysisYear: jaar },
      request,
    });

    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    return foutAntwoord(error, 'Fout bij aanmaken van de dag');
  }
}
