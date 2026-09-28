import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout, foutAntwoord } from '@/lib/planningApi';
import { leesObject } from '@/lib/sampleObjects';

// PUT - Object bijwerken (alleen admin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const { id } = await params;
    const objectId = parseInt(id);
    if (Number.isNaN(objectId)) {
      return NextResponse.json({ error: 'Onbekend object' }, { status: 400 });
    }

    const bestaand = await prisma.sampleObject.findUnique({ where: { id: objectId }, select: { id: true } });
    if (!bestaand) {
      return NextResponse.json({ error: 'Object niet gevonden' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const gegevens = leesObject(body, false);
    if ('fout' in gegevens) {
      return NextResponse.json({ error: gegevens.fout }, { status: 400 });
    }

    // Namen zijn uniek: controleer of een ander object die naam al heeft.
    if (typeof gegevens.data.name === 'string') {
      const dubbel = await prisma.sampleObject.findFirst({
        where: { name: gegevens.data.name, id: { not: objectId } },
        select: { id: true },
      });
      if (dubbel) {
        return NextResponse.json({ error: 'Er is al een object met deze naam' }, { status: 400 });
      }
    }

    const object = await prisma.sampleObject.update({
      where: { id: objectId },
      data: gegevens.data as never,
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPDATE_SAMPLE_OBJECT,
      details: { id: objectId, naam: object.name },
      request,
    });

    return NextResponse.json(object);
  } catch (error) {
    return foutAntwoord(error, 'Fout bij bijwerken van object');
  }
}

// DELETE - Object verwijderen (alleen admin). Dat mag alleen als er geen monsters
// meer aan hangen: anders raak je zonder het te zien de koppeling van die
// monsters kwijt. Hangen er nog monsters aan, voeg het object dan eerst samen
// met het goede kunstwerk.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const { id } = await params;
    const objectId = parseInt(id);
    if (Number.isNaN(objectId)) {
      return NextResponse.json({ error: 'Onbekend object' }, { status: 400 });
    }

    const object = await prisma.sampleObject.findUnique({
      where: { id: objectId },
      select: { id: true, name: true },
    });
    if (!object) {
      return NextResponse.json({ error: 'Object niet gevonden' }, { status: 404 });
    }

    const aantal = await prisma.oilSample.count({ where: { objectId } });
    if (aantal > 0) {
      return NextResponse.json(
        {
          error: `Aan "${object.name}" hangen nog ${aantal} ${
            aantal === 1 ? 'monster' : 'monsters'
          }. Voeg dit object eerst samen met het goede kunstwerk, of koppel de monsters om.`,
        },
        { status: 400 }
      );
    }
    await prisma.sampleObject.delete({ where: { id: objectId } });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_SAMPLE_OBJECT,
      details: { id: objectId, naam: object.name },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return foutAntwoord(error, 'Fout bij verwijderen van object');
  }
}
