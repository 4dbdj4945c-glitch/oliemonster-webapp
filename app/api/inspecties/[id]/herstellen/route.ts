import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';

// POST - Een verwijderde inspectie terugzetten uit de prullenbak (admin).
export const POST = apiRoute({ rol: 'admin', module: 'inspecties', fout: 'Fout bij terugzetten van de inspectie' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende inspectie');
  const rij = await prisma.inspectie.findFirst({ where: { id, deletedAt: { not: null } }, select: { id: true } });
  if (!rij) throw new ApiFout(404, 'Deze inspectie staat niet in de prullenbak');
  await prisma.inspectie.update({ where: { id }, data: { deletedAt: null, deletedBy: null } });
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.RESTORE_INSPECTIE, details: { id }, request });
  return NextResponse.json({ success: true, id });
});
