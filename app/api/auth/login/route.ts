import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { checkRateLimit, resetRateLimit } from '@/lib/rateLimit';
import { createAuditLog, AuditActions } from '@/lib/auditLog';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Gebruikersnaam en wachtwoord zijn verplicht' },
        { status: 400 }
      );
    }

    // Rate limiting check
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateLimitResult = checkRateLimit(ipAddress);
    
    if (!rateLimitResult.allowed) {
      await createAuditLog({
        username,
        action: AuditActions.LOGIN_FAILED,
        details: { reason: 'Rate limit exceeded', ip: ipAddress },
        request,
        success: false,
      });
      
      return NextResponse.json(
        { 
          error: `Te veel inlogpogingen. Probeer het opnieuw na ${rateLimitResult.resetTime?.toLocaleTimeString('nl-NL')}`,
          resetTime: rateLimitResult.resetTime 
        },
        { status: 429 }
      );
    }

    // Zoek gebruiker
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      await createAuditLog({
        username,
        action: AuditActions.LOGIN_FAILED,
        details: { reason: 'User not found' },
        request,
        success: false,
      });
      
      return NextResponse.json(
        { error: 'Ongeldige inloggegevens' },
        { status: 401 }
      );
    }

    // Controleer of gebruiker een wachtwoord moet instellen
    if (!user.password || user.requiresPasswordChange) {
      // Gebruiker heeft nog geen wachtwoord - check of username correct is
      // Voor eerste login zonder wachtwoord
      const cookieStore = await cookies();
      const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
      
      session.userId = user.id;
      session.username = user.username;
      session.role = user.role;
      session.isLoggedIn = true;
      session.requiresPasswordChange = true;
      
      await session.save();

      await createAuditLog({
        userId: user.id,
        username: user.username,
        action: AuditActions.LOGIN,
        details: { role: user.role, requiresPasswordChange: true },
        request,
      });

      return NextResponse.json({
        success: true,
        requiresPasswordChange: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      });
    }

    // Controleer wachtwoord voor bestaande gebruikers
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      await createAuditLog({
        userId: user.id,
        username,
        action: AuditActions.LOGIN_FAILED,
        details: { reason: 'Invalid password' },
        request,
        success: false,
      });
      
      return NextResponse.json(
        { error: 'Ongeldige inloggegevens' },
        { status: 401 }
      );
    }

    // Maak sessie
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
    
    session.userId = user.id;
    session.username = user.username;
    session.role = user.role;
    session.isLoggedIn = true;
    session.requiresPasswordChange = false;
    
    await session.save();

    // Reset rate limit bij succesvolle login
    resetRateLimit(ipAddress);

    // Log succesvolle login
    await createAuditLog({
      userId: user.id,
      username: user.username,
      action: AuditActions.LOGIN,
      details: { role: user.role },
      request,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Er is een fout opgetreden bij het inloggen' },
      { status: 500 }
    );
  }
}
