import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';
import { controleerKlantnaam } from '@/lib/klanten';

// POST - Een verwijderde klant terugzetten (knop Ongedaan maken).
export const POST = apiRoute(
  { rol: 'admin', module: 'klanten', fout: 'Fout bij terugzetten van de klant' },
  async (request, context, sessie) => {
    const id = await leesId(context, 'Onbekende klant');
    const klant = await prisma.klant.findUnique({ where: { id } });
    if (!klant) throw new ApiFout(404, 'Klant niet gevonden');
    if (!klant.deletedAt) return NextResponse.json({ success: true, id, alTerug: true });
    await controleerKlantnaam(klant.naam, id);

    await prisma.klant.update({ where: { id }, data: { deletedAt: null, deletedBy: null } });
    await createAuditLog({
      userId: sessie.userId,
      username: sessie.username,
      action: AuditActions.RESTORE_KLANT,
      details: { id, naam: klant.naam, verwijderdOp: klant.deletedAt, verwijderdDoor: klant.deletedBy },
      request,
    });
    return NextResponse.json({ success: true, id });
  }
);
