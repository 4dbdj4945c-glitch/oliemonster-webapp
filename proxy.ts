import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { unsealData } from 'iron-session';
import { herkomstFout } from './lib/herkomst';
import { sessionOptions, sessieSleutel, SessionData } from './lib/session';

/**
 * Routes die een sessie mag gebruiken die nog een wachtwoord moet instellen.
 * Alle andere API-routes weigeren zo'n sessie, ook als ze zelf (nog) niet via
 * lib/toegang.ts controleren.
 */
const ROUTES_ZONDER_WACHTWOORD = new Set([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/session',
  '/api/auth/set-password',
  '/api/auth/uitnodiging',
]);

function eigenOriginVan(request: NextRequest): string {
  const host = request.headers.get('host') || request.nextUrl.host;
  const proto =
    request.headers.get('x-forwarded-proto')?.split(',')[0].trim() ||
    request.nextUrl.protocol.replace(':', '');
  return `${proto}://${host}`;
}

/** true als de cookie een sessie is die eerst een wachtwoord moet instellen. */
async function moetEerstWachtwoord(request: NextRequest): Promise<boolean> {
  const cookie = request.cookies.get(sessionOptions.cookieName)?.value;
  if (!cookie) return false;
  let sleutel: string;
  try {
    sleutel = sessieSleutel();
  } catch {
    // Geen sleutel in productie: de route zelf faalt dan al met een duidelijke fout.
    return false;
  }
  try {
    const data = await unsealData<SessionData>(cookie, { password: sleutel });
    return Boolean(data?.isLoggedIn && data.requiresPasswordChange);
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const pad = request.nextUrl.pathname;

  if (pad.startsWith('/api/')) {
    // CSRF: niet-GET-verzoeken moeten van de portal zelf komen en JSON zijn.
    const fout = herkomstFout({
      method: request.method,
      pad,
      eigenOrigin: eigenOriginVan(request),
      headers: request.headers,
    });
    if (fout) {
      return NextResponse.json({ error: fout.error }, { status: fout.status });
    }

    // Zolang het wachtwoord nog ingesteld moet worden: alleen dat.
    if (!ROUTES_ZONDER_WACHTWOORD.has(pad) && (await moetEerstWachtwoord(request))) {
      return NextResponse.json(
        { error: 'Stel eerst je wachtwoord in.', requiresPasswordChange: true },
        { status: 403 }
      );
    }
  }

  const response = NextResponse.next();

  // Haal het origin op van het verzoek
  const origin = request.headers.get('origin');

  // Sta iframe embedding toe van je eigen domein
  const allowedOrigins = [
    'https://www.itsdoneservices.nl',
    'https://itsdoneservices.nl', // Zonder www
    'https://mourik.itsdoneservices.nl', // Custom subdomain
    'http://localhost:3000', // Voor lokale ontwikkeling
  ];

  // CORS headers instellen voor toegestane origins
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');
  }

  // Verwijder X-Frame-Options om iframe embedding toe te staan
  response.headers.delete('X-Frame-Options');

  // Content-Security-Policy aanpassen voor iframe support
  // frame-ancestors bepaalt waar de webapp in een iframe mag worden geladen
  response.headers.set(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://www.itsdoneservices.nl https://itsdoneservices.nl https://mourik.itsdoneservices.nl http://localhost:3000"
  );

  // CORS headers voor API requests
  if (request.method === 'OPTIONS') {
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  }

  return response;
}

// Middleware configuratie - pas toe op alle routes
export const config = {
  matcher: [
    /*
     * Match alle request paths behalve:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-touch-icon.png).*)',
  ],
};
