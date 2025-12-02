import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';

// GET - Lijst van alle gebruikers (alleen admin)
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn || session.role !== 'admin') {
      return NextResponse.json(
        { error: 'Geen toegang' },
        { status: 403 }
      );
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        requiresPasswordChange: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Fout bij ophalen gebruikers' },
      { status: 500 }
    );
  }
}

// POST - Nieuwe gebruiker aanmaken (alleen admin)
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn || session.role !== 'admin') {
      return NextResponse.json(
        { error: 'Geen toegang' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { username, role } = body;

    if (!username || !role) {
      return NextResponse.json(
        { error: 'Gebruikersnaam en rol zijn verplicht' },
        { status: 400 }
      );
    }

    if (role !== 'admin' && role !== 'user') {
      return NextResponse.json(
        { error: 'Ongeldige rol' },
        { status: 400 }
      );
    }

    // Check of gebruikersnaam al bestaat
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Gebruikersnaam bestaat al' },
        { status: 400 }
      );
    }

    // Maak gebruiker aan zonder wachtwoord
    // Gebruiker moet bij eerste login zelf wachtwoord instellen
    const newUser = await prisma.user.create({
      data: {
        username,
        password: null,  // Geen wachtwoord - moet worden ingesteld bij eerste login
        role,
        requiresPasswordChange: true,
      },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Fout bij aanmaken gebruiker' },
      { status: 500 }
    );
  }
}
