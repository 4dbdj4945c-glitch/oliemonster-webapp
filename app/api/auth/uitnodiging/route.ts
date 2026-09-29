import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, SessionData } from '@/lib/session';
import { createAuditLog } from '@/lib/auditLog';
import { tabelOntbreekt } from '@/lib/kolommen';
import { geldigeUitnodiging, gebruikUitnodiging, LINK_ONGELDIG } from '@/lib/uitnodiging';

// De eenmalige link uit Instellingen: /set-password?token=...
// GET controleert het token en geeft de gebruikersnaam terug voor de begroeting.
// POST stelt met het token het wachtwoord in en logt de gebruiker in.
// Werkt zonder sessie; het token is het bewijs.

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    const uitnodiging = await geldigeUitnodiging(token);
    if (!uitnodiging) {
      return NextResponse.json({ error: LINK_ONGELDIG }, { status: 410 });
    }
    return NextResponse.json({ username: uitnodiging.user.username });
  } catch (error) {
    // Tabel bestaat nog niet: dan is er ook geen geldige link.
    if (tabelOntbreekt(error)) {
      return NextResponse.json({ error: LINK_ONGELDIG }, { status: 410 });
    }
    console.error('Uitnodiging controleren mislukt:', error);
    return NextResponse.json({ error: 'Er is een fout opgetreden' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { token, newPassword } = await request.json();

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Wachtwoord moet minimaal 6 karakters lang zijn' },
        { status: 400 }
      );
    }

    const uitnodiging = await geldigeUitnodiging(token);
    if (!uitnodiging) {
      return NextResponse.json({ error: LINK_ONGELDIG }, { status: 410 });
    }

    // Eerst de link als gebruikt markeren; lukt dat niet, dan was iemand ons voor.
    if (!(await gebruikUitnodiging(uitnodiging.id))) {
      return NextResponse.json({ error: LINK_ONGELDIG }, { status: 410 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const gebruiker = await prisma.user.update({
      where: { id: uitnodiging.user.id },
      data: { password: hashedPassword, requiresPasswordChange: false },
      select: { id: true, username: true, role: true },
    });

    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    session.userId = gebruiker.id;
    session.username = gebruiker.username;
    session.role = gebruiker.role;
    session.isLoggedIn = true;
    session.requiresPasswordChange = false;
    await session.save();

    await createAuditLog({
      userId: gebruiker.id,
      username: gebruiker.username,
      action: 'SET_PASSWORD',
      details: { userId: gebruiker.id, via: 'uitnodigingslink' },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (tabelOntbreekt(error)) {
      return NextResponse.json({ error: LINK_ONGELDIG }, { status: 410 });
    }
    console.error('Wachtwoord instellen via link mislukt:', error);
    return NextResponse.json({ error: 'Er is een fout opgetreden' }, { status: 500 });
  }
}
