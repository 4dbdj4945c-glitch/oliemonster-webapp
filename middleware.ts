import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Haal het origin op van het verzoek
  const origin = request.headers.get('origin');

  // Sta iframe embedding toe van je eigen domein
  const allowedOrigins = [
    'https://www.itsdoneservices.nl',
    'https://itsdoneservices.nl', // Zonder www
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
    "frame-ancestors 'self' https://www.itsdoneservices.nl https://itsdoneservices.nl http://localhost:3000"
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
