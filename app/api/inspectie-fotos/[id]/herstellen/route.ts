import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';
import { alleenBijConcept, haalInspectie, inspectieAlsJson } from '@/lib/inspecties/server';

// POST - Een weggehaalde foto van een bevinding terugzetten (Ongedaan maken, admin, alleen bij een concept).
export const POST = apiRoute({ rol: 'admin', module: 'inspecties', fout: 'Fout bij terugzetten van de foto' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende foto');
  const foto = await prisma.inspectieFoto.findFirst({
    where: { id, deletedAt: { not: null }, item: { deletedAt: null, inspectie: { deletedAt: null } } },
    select: { id: true, itemId: true, item: { select: { inspectieId: true } } },
  });
  if (!foto) throw new ApiFout(404, 'Deze foto is niet weggehaald');
  await alleenBijConcept(foto.item.inspectieId);
  await prisma.inspectieFoto.update({ where: { id }, data: { deletedAt: null, deletedBy: null }, select: { id: true } });
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.RESTORE_INSPECTIE_FOTO, details: { fotoId: id, itemId: foto.itemId }, request });
  return NextResponse.json(inspectieAlsJson(await haalInspectie(foto.item.inspectieId, sessie)));
});
