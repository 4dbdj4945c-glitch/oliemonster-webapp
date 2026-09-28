import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout, foutAntwoord } from '@/lib/planningApi';

// PUT - Datum of notitie van een dag wijzigen (alleen admin)
export async function PUT(
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

    const bestaand = await prisma.samplePlan.findUnique({
      where: { id: planId },
      select: { id: true, analysisYear: true },
    });
    if (!bestaand) {
      return NextResponse.json({ error: 'Dag niet gevonden' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const data: Record<string, unknown> = {};

    if (typeof body.date === 'string' && body.date) {
      const datum = new Date(`${body.date}T00:00:00`);
      if (Number.isNaN(datum.getTime())) {
        return NextResponse.json({ error: 'Die datum begrijp ik niet' }, { status: 400 });
      }
      const dubbel = await prisma.samplePlan.findFirst({
        where: { date: datum, analysisYear: bestaand.analysisYear, id: { not: planId } },
        select: { id: true },
      });
      if (dubbel) {
        return NextResponse.json({ error: 'Er staat al een dag op deze datum' }, { status: 400 });
      }
      data.date = datum;
    }
    if ('notes' in body) {
      const tekst = typeof body.notes === 'string' ? body.notes.trim() : '';
      data.notes = tekst === '' ? null : tekst;
    }

    const plan = await prisma.samplePlan.update({ where: { id: planId }, data: data as never });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPDATE_SAMPLE_PLAN,
      details: { id: planId, velden: Object.keys(data) },
      request,
    });

    return NextResponse.json(plan);
  } catch (error) {
    return foutAntwoord(error, 'Fout bij bijwerken van de dag');
  }
}

// DELETE - Dag verwijderen (alleen admin). De stops gaan mee, de monsters blijven.
export async function DELETE(
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
      select: { id: true, date: true },
    });
    if (!plan) {
      return NextResponse.json({ error: 'Dag niet gevonden' }, { status: 404 });
    }

    await prisma.samplePlan.delete({ where: { id: planId } });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_SAMPLE_PLAN,
      details: { id: planId, datum: plan.date },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return foutAntwoord(error, 'Fout bij verwijderen van de dag');
  }
}
