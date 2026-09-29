import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';
import { haalContract } from '@/lib/contractenServer';

// POST /api/contracten/[id]/herstellen - een verwijderd contract terugzetten (admin)
export const POST = apiRoute({ rol: 'admin', module: 'contracten', fout: 'Fout bij terugzetten van het contract' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekend contract');
  const c = await prisma.contract.findUnique({ where: { id }, select: { deletedAt: true } });
  if (!c) throw new ApiFout(404, 'Contract niet gevonden');
  await prisma.contract.update({ where: { id }, data: { deletedAt: null, deletedBy: null } });
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.RESTORE_CONTRACT, details: { id }, request });
  return NextResponse.json(await haalContract(id));
});
