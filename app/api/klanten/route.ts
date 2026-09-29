import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, leesJson } from '@/lib/apiRoute';
import { controleerKlantnaam, NieuweKlantSchema } from '@/lib/klanten';

// Klanten (alleen admin). Verwijderde klanten (deletedAt) staan niet in de lijst.

// GET - Alle klanten met het aantal contactpersonen, objecten en installaties.
export const GET = apiRoute(
  { rol: 'admin', module: 'klanten', fout: 'Fout bij ophalen van klanten' },
  async () => {
    const klanten = await prisma.klant.findMany({
      where: { deletedAt: null },
      orderBy: { naam: 'asc' },
      include: {
        _count: { select: { contactpersonen: { where: { deletedAt: null } }, objecten: true } },
        objecten: { select: { _count: { select: { installaties: { where: { deletedAt: null } } } } } },
      },
    });
    return NextResponse.json(
      klanten.map(({ _count, objecten, ...k }) => ({
        ...k,
        aantalContactpersonen: _count.contactpersonen,
        aantalObjecten: _count.objecten,
        aantalInstallaties: objecten.reduce((som, o) => som + o._count.installaties, 0),
      }))
    );
  }
);

// POST - Nieuwe klant
export const POST = apiRoute(
  { rol: 'admin', module: 'klanten', fout: 'Fout bij aanmaken van de klant' },
  async (request, _context, sessie) => {
    const invoer = await leesJson(request, NieuweKlantSchema);
    await controleerKlantnaam(invoer.naam);
    const klant = await prisma.klant.create({ data: invoer });

    await createAuditLog({
      userId: sessie.userId,
      username: sessie.username,
      action: AuditActions.CREATE_KLANT,
      details: { id: klant.id, naam: klant.naam },
      request,
    });
    return NextResponse.json(klant, { status: 201 });
  }
);
