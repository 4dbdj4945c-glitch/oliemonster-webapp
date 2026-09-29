import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId, leesJson } from '@/lib/apiRoute';
import { NieuweContactpersoonSchema } from '@/lib/klanten';

// POST - Nieuwe contactpersoon bij een klant
export const POST = apiRoute(
  { rol: 'admin', module: 'klanten', fout: 'Fout bij toevoegen van de contactpersoon' },
  async (request, context, sessie) => {
    const klantId = await leesId(context, 'Onbekende klant');
    const klant = await prisma.klant.findFirst({ where: { id: klantId, deletedAt: null }, select: { naam: true } });
    if (!klant) throw new ApiFout(404, 'Klant niet gevonden');
    const invoer = await leesJson(request, NieuweContactpersoonSchema);

    const persoon = await prisma.contactpersoon.create({ data: { ...invoer, klantId } });
    await createAuditLog({
      userId: sessie.userId,
      username: sessie.username,
      action: AuditActions.CREATE_CONTACTPERSOON,
      details: { id: persoon.id, naam: persoon.naam, klant: klant.naam },
      request,
    });
    return NextResponse.json(persoon, { status: 201 });
  }
);
