import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';

// PUT - Gebruiker bijwerken (alleen admin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn || session.role !== 'admin') {
      return NextResponse.json(
        { error: 'Geen toegang' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json(
        { error: 'Ongeldige gebruikers ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { username, role, newPassword } = body;

    // Check of gebruiker bestaat
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: 'Gebruiker niet gevonden' },
        { status: 404 }
      );
    }

    // Check of username al bestaat bij andere gebruiker
    if (username && username !== existingUser.username) {
      const duplicateUser = await prisma.user.findUnique({
        where: { username },
      });

      if (duplicateUser) {
        return NextResponse.json(
          { error: 'Gebruikersnaam bestaat al' },
          { status: 400 }
        );
      }
    }

    // Valideer rol als deze wordt gewijzigd
    if (role && role !== 'admin' && role !== 'user') {
      return NextResponse.json(
        { error: 'Ongeldige rol' },
        { status: 400 }
      );
    }

    // Prepare update data
    const updateData: any = {};
    if (username) updateData.username = username;
    if (role) updateData.role = role;
    if (newPassword) {
      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    // Update gebruiker
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Fout bij bijwerken gebruiker' },
      { status: 500 }
    );
  }
}

// DELETE - Gebruiker verwijderen (alleen admin)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn || session.role !== 'admin') {
      return NextResponse.json(
        { error: 'Geen toegang' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json(
        { error: 'Ongeldige gebruikers ID' },
        { status: 400 }
      );
    }

    // Voorkom dat admin zichzelf verwijdert
    if (session.userId === userId) {
      return NextResponse.json(
        { error: 'Je kunt jezelf niet verwijderen' },
        { status: 400 }
      );
    }

    // Check of gebruiker bestaat
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: 'Gebruiker niet gevonden' },
        { status: 404 }
      );
    }

    // Verwijder gebruiker
    await prisma.user.delete({
      where: { id: userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Fout bij verwijderen gebruiker' },
      { status: 500 }
    );
  }
}
