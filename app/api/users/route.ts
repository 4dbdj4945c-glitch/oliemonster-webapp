import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { ALLOWED_ROLES, leesKijkerInstelling, leesViewYear } from '@/lib/roles';
import { controleerKlant } from '@/lib/klanten';
import { ApiFout } from '@/lib/apiRoute';
import { tabelOntbreekt, foutAntwoordWensen2 } from '@/lib/kolommen';
import { maakUitnodiging, linkVoor, originVan, KOLOM_ONTBREEKT_FASE0 } from '@/lib/uitnodiging';

// GET - Lijst van alle gebruikers (alleen admin)
export const GET = withAuth({ rol: 'admin', module: 'beheer' }, async () => {
  try {
    const basis = {
      id: true,
      username: true,
      role: true,
      requiresPasswordChange: true,
      createdAt: true,
    } as const;
    const volgorde = { createdAt: 'desc' as const };

    // Staat een kolom er nog niet (database nog niet bij), dan zonder die kolom:
    // eerst zonder klant en weergave (migratie klantportaal), dan zonder jaar.
    try {
      const users = await prisma.user.findMany({
        select: { ...basis, viewYear: true, klantId: true, portaalWeergave: true, klant: { select: { id: true, naam: true } } },
        orderBy: volgorde,
      });
      return NextResponse.json(users);
    } catch (error) {
      if (!tabelOntbreekt(error)) throw error;
    }
    try {
      const users = await prisma.user.findMany({ select: { ...basis, viewYear: true }, orderBy: volgorde });
      return NextResponse.json(users.map((u) => ({ ...u, klantId: null, portaalWeergave: 'klassiek', klant: null })));
    } catch (error) {
      if (!tabelOntbreekt(error)) throw error;
      const oud = await prisma.user.findMany({ select: basis, orderBy: volgorde });
      return NextResponse.json(oud.map((u) => ({ ...u, viewYear: null, klantId: null, portaalWeergave: 'klassiek', klant: null })));
    }
  } catch (error) {
    return foutAntwoordWensen2(error, 'Fout bij ophalen gebruikers');
  }
});

// POST - Nieuwe gebruiker aanmaken (alleen admin)
export const POST = withAuth({ rol: 'admin', module: 'beheer' }, async (request: NextRequest, _context, session) => {
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
    // Klant en weergave (alleen bij alleen lezen). Een nieuwe kijker met een
    // klant krijgt standaard het klantportaal.
    const kijker = leesKijkerInstelling(body, role);
    if ('fout' in kijker) {
      return NextResponse.json({ error: kijker.fout }, { status: 400 });
    }
    try {
      await controleerKlant(kijker.klantId);
    } catch (error) {
      if (error instanceof ApiFout) return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }

    // Check of gebruikersnaam al bestaat
    const existingUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (existingUser) {
      return NextResponse.json({ error: 'Gebruikersnaam bestaat al' }, { status: 400 });
    }

    // Maak gebruiker aan zonder wachtwoord; die stelt het zelf in via de
    // eenmalige link hieronder. Inloggen zonder wachtwoord kan niet meer.
    const newUser = await prisma.user.create({
      data: {
        username,
        password: null,
        role,
        viewYear: jaar.viewYear,
        klantId: kijker.klantId,
        portaalWeergave: kijker.portaalWeergave,
        requiresPasswordChange: true,
      },
      select: { id: true, username: true, role: true, viewYear: true, klantId: true, portaalWeergave: true, createdAt: true },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CREATE_USER,
      details: { id: newUser.id, gebruiker: username, rol: role, kijkjaar: jaar.viewYear, klantId: kijker.klantId, weergave: kijker.portaalWeergave },
      request,
    });

    // De link om het wachtwoord in te stellen. Lukt dat niet (tabel ontbreekt
    // nog), dan bestaat de gebruiker wel, maar kan hij nog niet inloggen. De
    // beheerder maakt de link later met Nieuwe link.
    try {
      const { token, verlooptOp } = await maakUitnodiging(newUser.id, session.username);
      return NextResponse.json(
        { ...newUser, uitnodiging: { link: linkVoor(originVan(request), token), verlooptOp } },
        { status: 201 }
      );
    } catch (error) {
      if (!tabelOntbreekt(error)) throw error;
      return NextResponse.json({ ...newUser, uitnodiging: null, uitnodigingFout: KOLOM_ONTBREEKT_FASE0 }, { status: 201 });
    }
  } catch (error) {
    return foutAntwoordWensen2(error, 'Fout bij aanmaken gebruiker');
  }
});
