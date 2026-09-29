import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute } from '@/lib/apiRoute';
import { feedLinks, nieuweSleutel } from '@/lib/agenda';

/*
  De agendafeed van de ingelogde medewerker (beheerder of gebruiker; een kijker
  heeft geen feed).
  GET    /api/agenda - staat er een link, en zo ja welke (https en webcal)
  POST   /api/agenda - nieuwe link maken; een oude link werkt daarna niet meer
  DELETE /api/agenda - de link intrekken
*/

function origin(request: Request): string {
  return new URL(request.url).origin;
}

export const GET = apiRoute({ rol: 'user', module: 'agenda', fout: 'Fout bij ophalen van de agendalink' }, async (request, _context, sessie) => {
  const feed = await prisma.agendaFeed.findUnique({ where: { userId: sessie.userId } });
  if (!feed) return NextResponse.json({ actief: false });
  return NextResponse.json({
    actief: true,
    ...feedLinks(origin(request), feed.sleutel),
    aangemaakt: feed.createdAt,
    laatstGebruikt: feed.laatstGebruiktOp,
  });
});

export const POST = apiRoute({ rol: 'user', module: 'agenda', fout: 'Fout bij maken van de agendalink' }, async (request, _context, sessie) => {
  const sleutel = nieuweSleutel();
  const feed = await prisma.agendaFeed.upsert({
    where: { userId: sessie.userId },
    create: { userId: sessie.userId, sleutel },
    update: { sleutel, createdAt: new Date(), laatstGebruiktOp: null },
  });
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.AGENDA_FEED_AANGEMAAKT, details: { feedId: feed.id }, request });
  return NextResponse.json({ actief: true, ...feedLinks(origin(request), feed.sleutel), aangemaakt: feed.createdAt, laatstGebruikt: null }, { status: 201 });
});

export const DELETE = apiRoute({ rol: 'user', module: 'agenda', fout: 'Fout bij intrekken van de agendalink' }, async (request, _context, sessie) => {
  const weg = await prisma.agendaFeed.deleteMany({ where: { userId: sessie.userId } });
  if (weg.count > 0) {
    await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.AGENDA_FEED_INGETROKKEN, details: {}, request });
  }
  return NextResponse.json({ actief: false });
});
