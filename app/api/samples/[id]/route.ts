import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { SAMPLE_BASIS_SELECT } from '@/lib/planningApi';
import { haalSessie, toegangsFout } from '@/lib/toegang';
import { tabelOntbreekt } from '@/lib/kolommen';

// PUT - Update sample (alleen admin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const { id } = await params;
    const body = await request.json();
    const { oNumber, sampleDate, location, description, oilType, remarks, isTaken, objectId } = body;

    // Datum is alleen verplicht als monster genomen is
    if (!oNumber || !location || !description || isTaken === undefined) {
      return NextResponse.json(
        { error: 'O-nummer, locatie en omschrijving zijn verplicht' },
        { status: 400 }
      );
    }

    if (isTaken && !sampleDate) {
      return NextResponse.json(
        { error: 'Datum is verplicht voor genomen monsters' },
        { status: 400 }
      );
    }

    // Object: leeg betekent geen object; onzin geeft een nette melding, geen 500.
    let gelezenObjectId: number | null = null;
    if (objectId !== undefined && objectId !== null && objectId !== '') {
      gelezenObjectId = parseInt(String(objectId));
      if (Number.isNaN(gelezenObjectId)) {
        return NextResponse.json({ error: 'Onbekend object' }, { status: 400 });
      }
    }

    // Check of een ander sample in hetzelfde analyse-jaar al dit o-nummer heeft
    const huidig = await prisma.oilSample.findUnique({ where: { id: parseInt(id) }, select: { analysisYear: true } });
    if (!huidig) {
      return NextResponse.json({ error: 'Monster niet gevonden' }, { status: 404 });
    }
    const existing = await prisma.oilSample.findFirst({
      where: {
        oNumber,
        analysisYear: huidig.analysisYear,
        id: { not: parseInt(id) },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'O-nummer bestaat al' },
        { status: 400 }
      );
    }

    const gegevens = {
      oNumber,
      sampleDate: sampleDate ? new Date(sampleDate) : null,
      location,
      description,
      oilType: oilType || null,
      remarks: remarks || null,
      isTaken,
      // Alleen meesturen als de pagina een object koos, zie de POST-route.
      ...(objectId === undefined ? {} : { objectId: gelezenObjectId }),
    };

    // Zet je hier op genomen, dan is het monster niet meer onbereikbaar. Zelfde
    // regel als in de statusroute, zodat een monster nooit twee statussen heeft.
    let sample;
    try {
      sample = await prisma.oilSample.update({
        where: { id: parseInt(id) },
        data: {
          ...gegevens,
          ...(isTaken
            ? {
                isUnreachable: false,
                unreachableReason: null,
                unreachableNote: null,
                unreachablePhotoUrl: null,
                unreachableAt: null,
                unreachableBy: null,
              }
            : {}),
        },
        select: SAMPLE_BASIS_SELECT,
      });
    } catch (error) {
      if (!tabelOntbreekt(error)) throw error;
      sample = await prisma.oilSample.update({
        where: { id: parseInt(id) },
        data: gegevens,
        select: SAMPLE_BASIS_SELECT,
      });
    }

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPDATE_SAMPLE,
      details: { id: parseInt(id), oNumber, location, isTaken },
      request,
    });

    return NextResponse.json(sample);
  } catch (error) {
    console.error('Error updating sample:', error);
    return NextResponse.json(
      { error: 'Fout bij bijwerken van monster' },
      { status: 500 }
    );
  }
}

// DELETE - Verwijder sample (alleen admin)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const { id } = await params;

    // Haal sample op voor logging
    const sample = await prisma.oilSample.findUnique({
      where: { id: parseInt(id) },
      select: { oNumber: true, location: true },
    });

    await prisma.oilSample.delete({
      where: { id: parseInt(id) },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_SAMPLE,
      details: { id: parseInt(id), oNumber: sample?.oNumber, location: sample?.location },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting sample:', error);
    return NextResponse.json(
      { error: 'Fout bij verwijderen van monster' },
      { status: 500 }
    );
  }
}
