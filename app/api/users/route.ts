import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout } from '@/lib/toegang';
import { ALLOWED_ROLES, leesViewYear } from '@/lib/roles';
import { tabelOntbreekt, foutAntwoordWensen2 } from '@/lib/kolommen';

// GET - Lijst van alle gebruikers (alleen admin)
export async function GET(request: NextRequest) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const basis = {
      id: true,
      username: true,
      role: true,
      requiresPasswordChange: true,
      createdAt: true,
    } as const;
    const volgorde = { createdAt: 'desc' as const };

    // Zolang ./db-push-wensen2.sh nog niet gedraaid is bestaat viewYear niet;
    // dan laten we het jaar leeg in plaats van de pagina te laten vallen.
    try {
      const users = await prisma.user.findMany({
        select: { ...basis, viewYear: true },
        orderBy: volgorde,
      });
      return NextResponse.json(users);
    } catch (error) {
      if (!tabelOntbreekt(error)) throw error;
      const oud = await prisma.user.findMany({ select: basis, orderBy: volgorde });
      return NextResponse.json(oud.map((u) => ({ ...u, viewYear: null })));
    }
  } catch (error) {
    return foutAntwoordWensen2(error, 'Fout bij ophalen gebruikers');
  }
}

// POST - Nieuwe gebruiker aanmaken (alleen admin)
export async function POST(request: NextRequest) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const body = await request.json();
    const { username, role } = body;

    if (!username || !role) {
      return NextResponse.json(
        { error: 'Gebruikersnaam en rol zijn verplicht' },
        { status: 400 }
      );
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Ongeldige rol' }, { status: 400 });
    }

    const jaar = leesViewYear(body.viewYear, role);
    if ('fout' in jaar) {
      return NextResponse.json({ error: jaar.fout }, { status: 400 });
    }

    // Check of gebruikersnaam al bestaat
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return NextResponse.json({ error: 'Gebruikersnaam bestaat al' }, { status: 400 });
    }

    // Maak gebruiker aan zonder wachtwoord; die stelt die zelf in bij de eerste login.
    const newUser = await prisma.user.create({
      data: {
        username,
        password: null,
        role,
        viewYear: jaar.viewYear,
        requiresPasswordChange: true,
      },
      select: { id: true, username: true, role: true, viewYear: true, createdAt: true },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CREATE_USER,
      details: { id: newUser.id, gebruiker: username, rol: role, kijkjaar: jaar.viewYear },
      request,
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    return foutAntwoordWensen2(error, 'Fout bij aanmaken gebruiker');
  }
}
