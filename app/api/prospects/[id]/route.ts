import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout, foutAntwoord, bouwProspectData } from '@/lib/prospectApi';

// GET - Een prospect met zijn contactmomenten (nieuwste eerst)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await haalSessie();
    const fout = toegangsFout(session, false);
    if (fout) return fout;

    const { id } = await params;
    const prospect = await prisma.prospect.findUnique({
      where: { id: parseInt(id) },
      include: { contactmomenten: { orderBy: [{ datum: 'desc' }, { createdAt: 'desc' }] } },
    });

    if (!prospect) return NextResponse.json({ error: 'Prospect niet gevonden' }, { status: 404 });

    return NextResponse.json(prospect);
  } catch (error) {
    return foutAntwoord(error, 'Fout bij ophalen van prospect');
  }
}

// PUT - Prospect bijwerken (alleen admin). Alleen de meegestuurde velden worden gezet,
// zodat de pijplijn ook alleen een status kan doorgeven.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await haalSessie();
    const fout = toegangsFout(session, true);
    if (fout) return fout;

    const { id } = await params;
    const prospectId = parseInt(id);

    const huidig = await prisma.prospect.findUnique({ where: { id: prospectId } });
    if (!huidig) return NextResponse.json({ error: 'Prospect niet gevonden' }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const resultaat = bouwProspectData(body as Record<string, unknown>, false);
    if ('fout' in resultaat) {
      return NextResponse.json({ error: resultaat.fout }, { status: 400 });
    }

    const data = resultaat.data;

    // Datum "klant sinds" volgt de status, zodat "nieuwe klanten dit kwartaal" klopt.
    if (typeof data.status === 'string' && data.status !== huidig.status) {
      if (data.status === 'KLANT') data.klantSindsOp = huidig.klantSindsOp ?? new Date();
      else if (huidig.status === 'KLANT') data.klantSindsOp = null;
    }

    const prospect = await prisma.prospect.update({
      where: { id: prospectId },
      data: data as unknown as Prisma.ProspectUpdateInput,
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPDATE_PROSPECT,
      details: {
        id: prospect.id,
        bedrijfsnaam: prospect.bedrijfsnaam,
        velden: Object.keys(data),
        status: prospect.status,
      },
      request,
    });

    return NextResponse.json(prospect);
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'Dit bedrijf staat al in de lijst met deze plaats' },
        { status: 409 }
      );
    }
    return foutAntwoord(error, 'Fout bij bijwerken van prospect');
  }
}

// DELETE - Prospect verwijderen (alleen admin). Contactmomenten gaan mee (cascade).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await haalSessie();
    const fout = toegangsFout(session, true);
    if (fout) return fout;

    const { id } = await params;
    const prospectId = parseInt(id);

    const prospect = await prisma.prospect.findUnique({ where: { id: prospectId } });
    if (!prospect) return NextResponse.json({ error: 'Prospect niet gevonden' }, { status: 404 });

    await prisma.prospect.delete({ where: { id: prospectId } });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_PROSPECT,
      details: { id: prospectId, bedrijfsnaam: prospect.bedrijfsnaam, plaats: prospect.plaats },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return foutAntwoord(error, 'Fout bij verwijderen van prospect');
  }
}
