import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';

// POST - Een verwijderd document terugzetten (Ongedaan maken, alleen admin).
export const POST = apiRoute({ rol: 'admin', module: 'eigen-dossier', fout: 'Fout bij terugzetten van het document' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekend document');
  const d = await prisma.eigenDocument.findFirst({ where: { id, deletedAt: { not: null } }, select: { id: true } });
  if (!d) throw new ApiFout(404, 'Dit document staat niet in de prullenbak');
  await prisma.eigenDocument.update({ where: { id }, data: { deletedAt: null, deletedBy: null } });
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.RESTORE_EIGEN_DOCUMENT, details: { id }, request });
  return NextResponse.json({ success: true, id });
});
