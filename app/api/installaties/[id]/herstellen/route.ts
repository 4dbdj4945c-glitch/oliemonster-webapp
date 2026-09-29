import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';

// POST - Een verwijderde installatie terugzetten (knop Ongedaan maken).
export const POST = apiRoute(
  { rol: 'admin', module: 'klanten', fout: 'Fout bij terugzetten van de installatie' },
  async (request, context, sessie) => {
    const id = await leesId(context, 'Onbekende installatie');
    const installatie = await prisma.installatie.findUnique({ where: { id } });
    if (!installatie) throw new ApiFout(404, 'Installatie niet gevonden');
    if (installatie.deletedAt) {
      await prisma.installatie.update({ where: { id }, data: { deletedAt: null, deletedBy: null } });
      await createAuditLog({
        userId: sessie.userId,
        username: sessie.username,
        action: AuditActions.RESTORE_INSTALLATIE,
        details: { id, code: installatie.code, naam: installatie.naam },
        request,
      });
    }
    return NextResponse.json({ success: true, id });
  }
);
