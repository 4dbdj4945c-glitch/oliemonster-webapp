import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout } from '@/lib/toegang';
import { ALLOWED_ROLES, leesViewYear } from '@/lib/roles';
import { foutAntwoordWensen2 } from '@/lib/kolommen';

// PUT - Gebruiker bijwerken (alleen admin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Ongeldige gebruikers ID' }, { status: 400 });
    }

    const body = await request.json();
    const { username, role, newPassword } = body;

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true },
    });
    if (!existingUser) {
      return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 });
    }

    // Check of username al bestaat bij andere gebruiker
    if (username && username !== existingUser.username) {
      const duplicateUser = await prisma.user.findUnique({ where: { username } });
      if (duplicateUser) {
        return NextResponse.json({ error: 'Gebruikersnaam bestaat al' }, { status: 400 });
      }
    }

    // Valideer rol als deze wordt gewijzigd
    if (role && !ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Ongeldige rol' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (username) updateData.username = username;
    if (role) updateData.role = role;
    if (newPassword) {
      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    // Het kijkjaar hoort bij de rol: bij een andere rol dan alleen lezen wordt
    // het leeggemaakt, zodat er geen jaar blijft hangen dat niemand ziet.
    if ('viewYear' in body || role) {
      const jaar = leesViewYear(body.viewYear, role || existingUser.role);
      if ('fout' in jaar) {
        return NextResponse.json({ error: jaar.fout }, { status: 400 });
      }
      updateData.viewYear = jaar.viewYear;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, username: true, role: true, viewYear: true, createdAt: true },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPDATE_USER,
      details: {
        id: userId,
        gebruiker: updatedUser.username,
        rol: updatedUser.role,
        kijkjaar: updatedUser.viewYear,
        wachtwoordGezet: Boolean(newPassword),
      },
      request,
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    return foutAntwoordWensen2(error, 'Fout bij bijwerken gebruiker');
  }
}

// DELETE - Gebruiker verwijderen (alleen admin)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Ongeldige gebruikers ID' }, { status: 400 });
    }

    // Voorkom dat admin zichzelf verwijdert
    if (session.userId === userId) {
      return NextResponse.json({ error: 'Je kunt jezelf niet verwijderen' }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true },
    });
    if (!existingUser) {
      return NextResponse.json({ error: 'Gebruiker niet gevonden' }, { status: 404 });
    }

    await prisma.user.delete({ where: { id: userId } });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_USER,
      details: { id: userId, gebruiker: existingUser.username, rol: existingUser.role },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return foutAntwoordWensen2(error, 'Fout bij verwijderen gebruiker');
  }
}
