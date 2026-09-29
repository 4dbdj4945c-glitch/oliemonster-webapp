import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, leesId, leesJson } from '@/lib/apiRoute';
import { dagAlsDatum } from '@/lib/inspecties/server';
import { TaakSchema, controleerPlek, haalContract } from '@/lib/contractenServer';

// POST /api/contracten/[id]/taken - een terugkerende taak toevoegen (admin). Geeft het hele contract terug.
export const POST = apiRoute({ rol: 'admin', module: 'contracten', fout: 'Fout bij toevoegen van de taak' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekend contract');
  const contract = await haalContract(id);
  const invoer = await leesJson(request, TaakSchema);
  await controleerPlek(contract.klantId, invoer.objectId, invoer.installatieId);
  const taak = await prisma.contractTaak.create({
    data: {
      contractId: id,
      soort: invoer.soort,
      omschrijving: invoer.omschrijving ?? null,
      objectId: invoer.objectId,
      installatieId: invoer.installatieId ?? null,
      intervalMaanden: invoer.intervalMaanden,
      volgendeOp: dagAlsDatum(invoer.volgendeOp),
      geschatteMinuten: invoer.geschatteMinuten ?? null,
      notities: invoer.notities ?? null,
    },
    select: { id: true },
  });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.CREATE_CONTRACT_TAAK,
    details: { contractId: id, taakId: taak.id, soort: invoer.soort, interval: invoer.intervalMaanden, volgendeOp: invoer.volgendeOp },
    request,
  });
  return NextResponse.json({ taakId: taak.id, contract: await haalContract(id) }, { status: 201 });
});
