import { alsGebruiker, GEBRUIKER_SELECT } from '@/lib/toegang';
import { startpagina } from '@/lib/paginaToegang';
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

    if (!username) {
      return NextResponse.json(
        { error: 'Gebruikersnaam is verplicht' },
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
    // Expliciete select: nieuwe kolommen of relaties op User mogen het inloggen
    // nooit raken zolang een db push nog niet gedraaid is.
    const user = typeof username === 'string'
      ? await prisma.user.findUnique({
          where: { username },
          // Ook wat de startpagina nodig heeft (rol, kijkjaar, klant, weergave): één query.
          select: { ...GEBRUIKER_SELECT, password: true },
        })
      : null;

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

    // Nog geen wachtwoord (nieuwe gebruiker of na een reset): hier komt niemand
    // meer binnen. Vroeger kreeg zo'n account zonder controle een volledige
    // sessie, zodat iedereen die de gebruikersnaam kende kon inloggen. Nu stelt
    // de gebruiker het wachtwoord in via de eenmalige link van de beheerder.
    if (!user.password) {
      await createAuditLog({
        userId: user.id,
        username,
        action: AuditActions.LOGIN_FAILED,
        details: { reason: 'No password set, invitation link required' },
        request,
        success: false,
      });

      return NextResponse.json(
        {
          error:
            'Voor dit account is nog geen wachtwoord ingesteld. Gebruik de link die je van de beheerder hebt gekregen, of vraag om een nieuwe.',
        },
        { status: 401 }
      );
    }

    // Controleer het wachtwoord. Dit geldt ook voor wie een nieuw wachtwoord
    // moet kiezen: zonder het huidige wachtwoord geen sessie.
    const isValidPassword = typeof password === 'string' && password.length > 0
      ? await bcrypt.compare(password, user.password)
      : false;

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
    // Moet deze gebruiker een nieuw wachtwoord kiezen (de beheerder zette er een
    // voor hem), dan krijgt hij een beperkte sessie: lib/toegang.ts en proxy.ts
    // laten dan alleen het wachtwoord instellen toe.
    session.requiresPasswordChange = user.requiresPasswordChange;
    
    await session.save();

    // Reset rate limit bij succesvolle login
    resetRateLimit(ipAddress);

    // Log succesvolle login
    await createAuditLog({
      userId: user.id,
      username: user.username,
      action: AuditActions.LOGIN,
      details: user.requiresPasswordChange
        ? { role: user.role, requiresPasswordChange: true }
        : { role: user.role },
      request,
    });

    // De startpagina meteen meegeven, zodat het scherm er in één keer heen gaat
    // (volledige paginalading, zie app/login/page.tsx).
    const start = user.requiresPasswordChange ? '/set-password' : startpagina(alsGebruiker(user));

    return NextResponse.json({
      success: true,
      startpagina: start,
      requiresPasswordChange: user.requiresPasswordChange,
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
