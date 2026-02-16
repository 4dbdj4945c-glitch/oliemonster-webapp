import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { createAuditLog, AuditActions } from '@/lib/auditLog';

// GET - Lijst van alle contacten
export async function GET(request: NextRequest) {
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
    const search = searchParams.get('search');

    const where: any = { isActive: true };

    if (search) {
      where.OR = [
        { company: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const contacts = await prisma.contact.findMany({
      where,
      include: {
        _count: {
          select: { contactNotes: true },
        },
      },
      orderBy: { company: 'asc' },
    });

    return NextResponse.json(contacts);
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return NextResponse.json(
      { error: 'Fout bij ophalen van contacten' },
      { status: 500 }
    );
  }
}

// POST - Nieuw contact toevoegen (alleen admin)
export async function POST(request: NextRequest) {
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
        { error: 'Alleen admins kunnen contacten toevoegen' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { company, name, email, phone, address, notes } = body;

    if (!company) {
      return NextResponse.json(
        { error: 'Bedrijfsnaam is verplicht' },
        { status: 400 }
      );
    }

    const contact = await prisma.contact.create({
      data: {
        company,
        name: name || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        notes: notes || null,
      },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CREATE_CONTACT,
      details: { company, name },
      request,
    });

    return NextResponse.json(contact, { status: 201 });
  } catch (error) {
    console.error('Error creating contact:', error);
    return NextResponse.json(
      { error: 'Fout bij aanmaken van contact' },
      { status: 500 }
    );
  }
}
