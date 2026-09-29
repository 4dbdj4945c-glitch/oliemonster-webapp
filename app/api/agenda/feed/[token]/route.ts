import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { bouwIcs, sleutelUitToken } from '@/lib/agenda';
import { afsprakenVoorFeed } from '@/lib/agendaServer';
import { isAlleenLezen } from '@/lib/roles';

/*
  GET /api/agenda/feed/<token>.ics - de agendafeed zelf, voor Apple Agenda.

  Geen sessie: Agenda kent geen cookies. Het token is de toegang (lib/agenda.ts).
  Alles wat niet klopt (onbekend of ingetrokken token, verkeerde handtekening,
  gebruiker weg, rol alleen lezen, nog geen wachtwoord) geeft dezelfde 404, zodat
  er niets te raden valt.
*/

const NIET_GEVONDEN = () => new NextResponse('Niet gevonden', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const sleutel = sleutelUitToken(token ?? '');
    if (!sleutel) return NIET_GEVONDEN();
    const feed = await prisma.agendaFeed.findUnique({
      where: { sleutel },
      select: { id: true, user: { select: { role: true, requiresPasswordChange: true } } },
    });
    if (!feed || isAlleenLezen(feed.user.role) || feed.user.requiresPasswordChange) return NIET_GEVONDEN();

    const ics = bouwIcs("It's Done planning", await afsprakenVoorFeed(new URL(request.url).origin));
    await prisma.agendaFeed.update({ where: { id: feed.id }, data: { laatstGebruiktOp: new Date() }, select: { id: true } });
    return new NextResponse(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="its-done-planning.ics"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Agendafeed mislukt:', error);
    return new NextResponse('Er ging iets mis', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
