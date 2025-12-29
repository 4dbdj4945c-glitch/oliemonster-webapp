import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { createAuditLog, AuditActions } from '@/lib/auditLog';

// PUT - Update sample (alleen admin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json(
        { error: 'Niet geautoriseerd' },
        { status: 401 }
      );
    }

    if (session.role !== 'admin') {
      return NextResponse.json(
        { error: 'Alleen admins kunnen monsters bewerken' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { oNumber, sampleDate, location, description, oilType, remarks, isTaken } = body;

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

    // Check of een ander sample al dit o-nummer heeft
    const existing = await prisma.oilSample.findFirst({
      where: {
        oNumber,
        id: { not: parseInt(id) },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'O-nummer bestaat al' },
        { status: 400 }
      );
    }

    const sample = await prisma.oilSample.update({
      where: { id: parseInt(id) },
      data: {
        oNumber,
        sampleDate: sampleDate ? new Date(sampleDate) : null,
        location,
        description,
        oilType: oilType || null,
        remarks: remarks || null,
        isTaken,
      },
    });

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
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json(
        { error: 'Niet geautoriseerd' },
        { status: 401 }
      );
    }

    if (session.role !== 'admin') {
      return NextResponse.json(
        { error: 'Alleen admins kunnen monsters verwijderen' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Haal sample op voor logging
    const sample = await prisma.oilSample.findUnique({
      where: { id: parseInt(id) },
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
