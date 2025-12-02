import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { createAuditLog } from '@/lib/auditLog';

// POST - Reset wachtwoord (admin zet gebruiker terug naar eerste login status)
export async function POST(
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

    // Haal gebruiker op
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Gebruiker niet gevonden' },
        { status: 404 }
      );
    }

    // Reset wachtwoord - gebruiker moet bij volgende login nieuw wachtwoord instellen
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: null,
        requiresPasswordChange: true,
      },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: 'RESET_USER_PASSWORD',
      details: { targetUserId: userId, targetUsername: user.username },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error resetting password:', error);
    return NextResponse.json(
      { error: 'Fout bij resetten wachtwoord' },
      { status: 500 }
    );
  }
}
