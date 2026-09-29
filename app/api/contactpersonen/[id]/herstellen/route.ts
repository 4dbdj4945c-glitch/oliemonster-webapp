import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';

// POST - Een weggehaalde contactpersoon terugzetten (knop Ongedaan maken).
export const POST = apiRoute(
  { rol: 'admin', module: 'klanten', fout: 'Fout bij terugzetten van de contactpersoon' },
  async (request, context, sessie) => {
    const id = await leesId(context, 'Onbekende contactpersoon');
    const persoon = await prisma.contactpersoon.findUnique({ where: { id } });
    if (!persoon) throw new ApiFout(404, 'Contactpersoon niet gevonden');
    if (persoon.deletedAt) {
      await prisma.contactpersoon.update({ where: { id }, data: { deletedAt: null, deletedBy: null } });
      await createAuditLog({
        userId: sessie.userId,
        username: sessie.username,
        action: AuditActions.RESTORE_CONTACTPERSOON,
        details: { id, naam: persoon.naam },
        request,
      });
    }
    return NextResponse.json({ success: true, id });
  }
);
