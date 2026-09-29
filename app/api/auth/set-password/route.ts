import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { createAuditLog, AuditActions } from '@/lib/auditLog';

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

    // Een account zonder wachtwoord stelt het in via de eenmalige link
    // (/api/auth/uitnodiging), niet via een sessie. Zo kan een sessie die nog uit
    // de tijd van inloggen zonder wachtwoord stamt, het account niet overnemen.
    const gebruiker = session.userId
      ? await prisma.user.findUnique({
          where: { id: session.userId },
          select: { id: true, password: true },
        })
      : null;
    if (!gebruiker) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }
    if (!gebruiker.password) {
      return NextResponse.json(
        { error: 'Gebruik de link die je van de beheerder hebt gekregen om je wachtwoord in te stellen.' },
        { status: 403 }
      );
    }

    const { newPassword } = await request.json();

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Wachtwoord moet minimaal 6 karakters lang zijn' },
        { status: 400 }
      );
    }

    // Hash het nieuwe wachtwoord
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update gebruiker
    await prisma.user.update({
      where: { id: session.userId },
      data: {
        password: hashedPassword,
        requiresPasswordChange: false,
      },
    });

    // Update session
    session.requiresPasswordChange = false;
    await session.save();

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: 'SET_PASSWORD',
      details: { userId: session.userId },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error setting password:', error);
    return NextResponse.json(
      { error: 'Er is een fout opgetreden' },
      { status: 500 }
    );
  }
}
