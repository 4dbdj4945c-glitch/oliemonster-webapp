import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesJson, leesQuery } from '@/lib/apiRoute';
import { dagAlsDatum } from '@/lib/inspecties/server';
import { ContractSchema, haalContract, haalContracten } from '@/lib/contractenServer';

/*
  GET  /api/contracten?klantId= - contracten met hun taken, status en planning (beheerder en gebruiker)
  POST /api/contracten          - nieuw contract voor een klant (admin)
*/

const Query = z.object({ klantId: z.coerce.number().int().positive().optional() });

export const GET = apiRoute({ rol: 'user', module: 'contracten', fout: 'Fout bij ophalen van de contracten' }, async (request) => {
  const { klantId } = leesQuery(request, Query);
  return NextResponse.json(await haalContracten(klantId ? { klantId } : {}));
});

export const POST = apiRoute({ rol: 'admin', module: 'contracten', fout: 'Fout bij aanmaken van het contract' }, async (request, _context, sessie) => {
  const invoer = await leesJson(request, ContractSchema);
  const klant = await prisma.klant.findFirst({ where: { id: invoer.klantId, deletedAt: null }, select: { id: true } });
  if (!klant) throw new ApiFout(400, 'Onbekende klant', { velden: { klantId: 'Onbekende klant' } });
  if (invoer.startOp && invoer.eindOp && invoer.eindOp < invoer.startOp) {
    throw new ApiFout(400, 'De einddatum ligt voor de begindatum', { velden: { eindOp: 'De einddatum ligt voor de begindatum' } });
  }
  const contract = await prisma.contract.create({
    data: {
      klantId: invoer.klantId,
      naam: invoer.naam,
      startOp: invoer.startOp ? dagAlsDatum(invoer.startOp) : null,
      eindOp: invoer.eindOp ? dagAlsDatum(invoer.eindOp) : null,
      notities: invoer.notities ?? null,
    },
    select: { id: true },
  });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.CREATE_CONTRACT,
    details: { id: contract.id, klantId: invoer.klantId, naam: invoer.naam },
    request,
  });
  return NextResponse.json(await haalContract(contract.id), { status: 201 });
});
