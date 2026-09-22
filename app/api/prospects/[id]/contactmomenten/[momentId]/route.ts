import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout, foutAntwoord } from '@/lib/prospectApi';
import { isProspectKanaal } from '@/lib/prospects';

/** Zet laatsteContactOp van de prospect gelijk aan het nieuwste contactmoment. */
async function ververLaatsteContact(prospectId: number) {
  const nieuwste = await prisma.prospectContactmoment.findFirst({
    where: { prospectId },
    orderBy: [{ datum: 'desc' }, { createdAt: 'desc' }],
  });
  await prisma.prospect.update({
    where: { id: prospectId },
    data: { laatsteContactOp: nieuwste ? nieuwste.datum : null },
  });
}

// PUT - Contactmoment bijwerken (alleen admin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; momentId: string }> }
) {
  try {
    const session = await haalSessie();
    const fout = toegangsFout(session, true);
    if (fout) return fout;

    const { id, momentId } = await params;
    const prospectId = parseInt(id);
    const contactmomentId = parseInt(momentId);

    const bestaand = await prisma.prospectContactmoment.findUnique({ where: { id: contactmomentId } });
    if (!bestaand || bestaand.prospectId !== prospectId) {
      return NextResponse.json({ error: 'Contactmoment niet gevonden' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { datum, kanaal, samenvatting, uitkomst } = body as {
      datum?: string;
      kanaal?: string;
      samenvatting?: string;
      uitkomst?: string | null;
    };

    if (!samenvatting?.trim()) {
      return NextResponse.json({ error: 'Schrijf kort op wat je gedaan hebt' }, { status: 400 });
    }
    if (kanaal && !isProspectKanaal(kanaal)) {
      return NextResponse.json({ error: 'Onbekend kanaal' }, { status: 400 });
    }

    const datumWaarde = datum ? new Date(datum) : bestaand.datum;
    if (Number.isNaN(datumWaarde.getTime())) {
      return NextResponse.json({ error: 'Ongeldige datum' }, { status: 400 });
    }

    const contactmoment = await prisma.prospectContactmoment.update({
      where: { id: contactmomentId },
      data: {
        datum: datumWaarde,
        kanaal: (isProspectKanaal(kanaal) ? kanaal : bestaand.kanaal) as Prisma.ProspectContactmomentUpdateInput['kanaal'],
        samenvatting: samenvatting.trim(),
        uitkomst: uitkomst?.trim() || null,
      },
    });

    await ververLaatsteContact(prospectId);

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPDATE_PROSPECT_CONTACT,
      details: { prospectId, contactmomentId },
      request,
    });

    return NextResponse.json(contactmoment);
  } catch (error) {
    return foutAntwoord(error, 'Fout bij bijwerken van contactmoment');
  }
}

// DELETE - Contactmoment verwijderen (alleen admin)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; momentId: string }> }
) {
  try {
    const session = await haalSessie();
    const fout = toegangsFout(session, true);
    if (fout) return fout;

    const { id, momentId } = await params;
    const prospectId = parseInt(id);
    const contactmomentId = parseInt(momentId);

    const bestaand = await prisma.prospectContactmoment.findUnique({ where: { id: contactmomentId } });
    if (!bestaand || bestaand.prospectId !== prospectId) {
      return NextResponse.json({ error: 'Contactmoment niet gevonden' }, { status: 404 });
    }

    await prisma.prospectContactmoment.delete({ where: { id: contactmomentId } });
    await ververLaatsteContact(prospectId);

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_PROSPECT_CONTACT,
      details: { prospectId, contactmomentId },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return foutAntwoord(error, 'Fout bij verwijderen van contactmoment');
  }
}
