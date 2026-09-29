import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';
import { haalContract } from '@/lib/contractenServer';

// POST /api/contract-taken/[id]/herstellen - een weggehaalde taak terugzetten (admin)
export const POST = apiRoute({ rol: 'admin', module: 'contracten', fout: 'Fout bij terugzetten van de taak' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende taak');
  const t = await prisma.contractTaak.findUnique({ where: { id }, select: { contractId: true } });
  if (!t) throw new ApiFout(404, 'Taak niet gevonden');
  await prisma.contractTaak.update({ where: { id }, data: { deletedAt: null, deletedBy: null } });
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.RESTORE_CONTRACT_TAAK, details: { id }, request });
  return NextResponse.json(await haalContract(t.contractId));
});
