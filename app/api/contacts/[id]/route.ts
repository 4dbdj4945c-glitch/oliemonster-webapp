import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { createAuditLog, AuditActions } from '@/lib/auditLog';

// GET - Haal een specifiek contact op met notities
export async function GET(
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

    const { id } = await params;
    const contactId = parseInt(id);

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        contactNotes: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!contact) {
      return NextResponse.json(
        { error: 'Contact niet gevonden' },
        { status: 404 }
      );
    }

    return NextResponse.json(contact);
  } catch (error) {
    console.error('Error fetching contact:', error);
    return NextResponse.json(
      { error: 'Fout bij ophalen van contact' },
      { status: 500 }
    );
  }
}

// PUT - Update een contact (alleen admin)
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
        { error: 'Alleen admins kunnen contacten bewerken' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const contactId = parseInt(id);
    const body = await request.json();
    const { company, name, email, phone, address, notes, isActive } = body;

    const contact = await prisma.contact.update({
      where: { id: contactId },
      data: {
        company,
        name,
        email,
        phone,
        address,
        notes,
        isActive,
      },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPDATE_CONTACT,
      details: { contactId, company },
      request,
    });

    return NextResponse.json(contact);
  } catch (error) {
    console.error('Error updating contact:', error);
    return NextResponse.json(
      { error: 'Fout bij bewerken van contact' },
      { status: 500 }
    );
  }
}

// DELETE - Verwijder een contact (alleen admin, soft delete)
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
        { error: 'Alleen admins kunnen contacten verwijderen' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const contactId = parseInt(id);

    // Soft delete
    const contact = await prisma.contact.update({
      where: { id: contactId },
      data: { isActive: false },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_CONTACT,
      details: { contactId, company: contact.company },
      request,
    });

    return NextResponse.json({ message: 'Contact verwijderd' });
  } catch (error) {
    console.error('Error deleting contact:', error);
    return NextResponse.json(
      { error: 'Fout bij verwijderen van contact' },
      { status: 500 }
    );
  }
}
