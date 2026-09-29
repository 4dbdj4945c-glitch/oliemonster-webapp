import { NextRequest, NextResponse } from 'next/server';
import { defaultSession } from '@/lib/session';
import { haalSessie, kijkjaar } from '@/lib/toegang';

export async function GET(request: NextRequest) {
  try {
    const session = await haalSessie();

    if (!session.isLoggedIn) {
      return NextResponse.json(defaultSession);
    }

    // Het kijkjaar komt uit de database en niet uit de cookie, zodat een
    // wijziging in het gebruikersbeheer direct geldt. null = alle jaren.
    const viewYear = await kijkjaar(session);

    return NextResponse.json({
      userId: session.userId,
      username: session.username,
      role: session.role,
      viewYear,
      isLoggedIn: session.isLoggedIn,
      requiresPasswordChange: session.requiresPasswordChange || false,
    });
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json(defaultSession);
  }
}
