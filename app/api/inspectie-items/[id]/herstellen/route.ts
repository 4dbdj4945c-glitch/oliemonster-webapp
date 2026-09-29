import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';
import { haalInspectie, inspectieAlsJson } from '@/lib/inspecties/server';

// POST - Een weggehaalde bevinding terugzetten (Ongedaan maken, admin).
export const POST = apiRoute({ rol: 'admin', module: 'inspecties', fout: 'Fout bij terugzetten van de bevinding' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende bevinding');
  const item = await prisma.inspectieItem.findFirst({ where: { id, deletedAt: { not: null } }, select: { id: true, inspectieId: true } });
  if (!item) throw new ApiFout(404, 'Deze bevinding is niet weggehaald');
  await prisma.inspectieItem.update({ where: { id }, data: { deletedAt: null, deletedBy: null } });
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.RESTORE_INSPECTIE_ITEM, details: { itemId: id }, request });
  return NextResponse.json(inspectieAlsJson(await haalInspectie(item.inspectieId, sessie)));
});
