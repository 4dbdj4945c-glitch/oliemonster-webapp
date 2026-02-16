import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { createAuditLog, AuditActions } from '@/lib/auditLog';

// GET - Haal alle notities van een contact op
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

    const notes = await prisma.contactNote.findMany({
      where: { contactId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(notes);
  } catch (error) {
    console.error('Error fetching notes:', error);
    return NextResponse.json(
      { error: 'Fout bij ophalen van notities' },
      { status: 500 }
    );
  }
}

// POST - Voeg een notitie toe aan een contact
export async function POST(
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
    const body = await request.json();
    const { content } = body;

    if (!content || content.trim() === '') {
      return NextResponse.json(
        { error: 'Notitie inhoud is verplicht' },
        { status: 400 }
      );
    }

    // Check of contact bestaat
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
    });

    if (!contact) {
      return NextResponse.json(
        { error: 'Contact niet gevonden' },
        { status: 404 }
      );
    }

    const note = await prisma.contactNote.create({
      data: {
        contactId,
        content,
        userId: session.userId,
        username: session.username,
      },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CREATE_CONTACT_NOTE,
      details: { contactId, company: contact.company },
      request,
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error('Error creating note:', error);
    return NextResponse.json(
      { error: 'Fout bij aanmaken van notitie' },
      { status: 500 }
    );
  }
}

// DELETE - Verwijder een notitie (admin of eigenaar)
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

    const { searchParams } = new URL(request.url);
    const noteId = searchParams.get('noteId');

    if (!noteId) {
      return NextResponse.json(
        { error: 'Notitie ID is verplicht' },
        { status: 400 }
      );
    }

    const note = await prisma.contactNote.findUnique({
      where: { id: parseInt(noteId) },
      include: { contact: true },
    });

    if (!note) {
      return NextResponse.json(
        { error: 'Notitie niet gevonden' },
        { status: 404 }
      );
    }

    // Alleen admin of eigenaar mag verwijderen
    if (session.role !== 'admin' && note.userId !== session.userId) {
      return NextResponse.json(
        { error: 'Geen toestemming om deze notitie te verwijderen' },
        { status: 403 }
      );
    }

    await prisma.contactNote.delete({
      where: { id: parseInt(noteId) },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_CONTACT_NOTE,
      details: { noteId, contactId: note.contactId, company: note.contact.company },
      request,
    });

    return NextResponse.json({ message: 'Notitie verwijderd' });
  } catch (error) {
    console.error('Error deleting note:', error);
    return NextResponse.json(
      { error: 'Fout bij verwijderen van notitie' },
      { status: 500 }
    );
  }
}
