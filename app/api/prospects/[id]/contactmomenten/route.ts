import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout, foutAntwoord } from '@/lib/prospectApi';
import { isProspectKanaal, isProspectStatus } from '@/lib/prospects';

// GET - Alle contactmomenten van een prospect, nieuwste eerst
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await haalSessie();
    const fout = toegangsFout(session, false);
    if (fout) return fout;

    const { id } = await params;
    const contactmomenten = await prisma.prospectContactmoment.findMany({
      where: { prospectId: parseInt(id) },
      orderBy: [{ datum: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json(contactmomenten);
  } catch (error) {
    return foutAntwoord(error, 'Fout bij ophalen van contactmomenten');
  }
}

// POST - Contactmoment vastleggen (alleen admin).
// Je mag in dezelfde stap de status en de volgende actie meegeven, zodat je op de
// telefoon met één formulier klaar bent.
export async function POST(
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

    const body = await request.json().catch(() => ({}));
    const { datum, kanaal, samenvatting, uitkomst, status, volgendeActie, volgendeActieOp } = body as {
      datum?: string;
      kanaal?: string;
      samenvatting?: string;
      uitkomst?: string | null;
      status?: string;
      volgendeActie?: string | null;
      volgendeActieOp?: string | null;
    };

    if (!samenvatting?.trim()) {
      return NextResponse.json({ error: 'Schrijf kort op wat je gedaan hebt' }, { status: 400 });
    }
    if (kanaal && !isProspectKanaal(kanaal)) {
      return NextResponse.json({ error: 'Onbekend kanaal' }, { status: 400 });
    }

    const datumWaarde = datum ? new Date(datum) : new Date();
    if (Number.isNaN(datumWaarde.getTime())) {
      return NextResponse.json({ error: 'Ongeldige datum' }, { status: 400 });
    }

    const contactmoment = await prisma.prospectContactmoment.create({
      data: {
        prospectId,
        datum: datumWaarde,
        kanaal: (kanaal ?? 'MAIL') as Prisma.ProspectContactmomentCreateInput['kanaal'],
        samenvatting: samenvatting.trim(),
        uitkomst: uitkomst?.trim() || null,
        aangemaaktDoor: session.username || null,
      },
    });

    // Prospect bijwerken: laatste contact, eventueel nieuwe status en volgende actie.
    const bij: Prisma.ProspectUpdateInput = {};
    if (!prospect.laatsteContactOp || datumWaarde > prospect.laatsteContactOp) {
      bij.laatsteContactOp = datumWaarde;
    }
    if (status && isProspectStatus(status) && status !== prospect.status) {
      bij.status = status;
      if (status === 'KLANT') bij.klantSindsOp = prospect.klantSindsOp ?? new Date();
      else if (prospect.status === 'KLANT') bij.klantSindsOp = null;
    }
    if (volgendeActie !== undefined) bij.volgendeActie = volgendeActie?.trim() || null;
    if (volgendeActieOp !== undefined) {
      const d = volgendeActieOp ? new Date(volgendeActieOp) : null;
      bij.volgendeActieOp = d && !Number.isNaN(d.getTime()) ? d : null;
    }

    if (Object.keys(bij).length > 0) {
      await prisma.prospect.update({ where: { id: prospectId }, data: bij });
    }

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CREATE_PROSPECT_CONTACT,
      details: {
        prospectId,
        contactmomentId: contactmoment.id,
        bedrijfsnaam: prospect.bedrijfsnaam,
        kanaal: contactmoment.kanaal,
        status: bij.status ?? prospect.status,
      },
      request,
    });

    return NextResponse.json(contactmoment, { status: 201 });
  } catch (error) {
    return foutAntwoord(error, 'Fout bij vastleggen van contactmoment');
  }
}
