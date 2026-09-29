import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';
import { dagrapportAlsJson, haalDagrapport } from '@/lib/dagrapporten';

// POST /api/dagrapporten/[id]/herstellen - een verwijderd dagrapport terugzetten (admin)
export const POST = apiRoute({ rol: 'admin', module: 'dagrapporten', fout: 'Fout bij terugzetten van het dagrapport' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekend dagrapport');
  const rij = await prisma.dagrapport.findFirst({ where: { id, deletedAt: { not: null } }, select: { id: true } });
  if (!rij) throw new ApiFout(404, 'Dit dagrapport staat niet in de prullenbak');
  await prisma.dagrapport.update({ where: { id }, data: { deletedAt: null, deletedBy: null } });
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.RESTORE_DAGRAPPORT, details: { id }, request });
  return NextResponse.json(dagrapportAlsJson(await haalDagrapport(id, sessie)));
});
