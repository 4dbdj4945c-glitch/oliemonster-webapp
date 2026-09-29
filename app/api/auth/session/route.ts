import { NextResponse } from 'next/server';
import { defaultSession } from '@/lib/session';
import { haalSessie, haalGebruiker } from '@/lib/toegang';

export async function GET() {
  try {
    const session = await haalSessie();

    // Rol, kijkjaar en requiresPasswordChange komen uit de database en niet uit
    // de cookie, zodat een wijziging in het gebruikersbeheer direct geldt. Is de
    // gebruiker verwijderd, dan geldt de sessie als uitgelogd.
    const gebruiker = await haalGebruiker(session);
    if (!gebruiker) {
      return NextResponse.json(defaultSession);
    }

    return NextResponse.json({
      userId: gebruiker.userId,
      username: gebruiker.username,
      role: gebruiker.role,
      viewYear: gebruiker.viewYear,
      isLoggedIn: true,
      requiresPasswordChange: gebruiker.requiresPasswordChange,
    });
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json(defaultSession);
  }
}
