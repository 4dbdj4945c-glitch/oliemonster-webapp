import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId, leesJson } from '@/lib/apiRoute';
import { dagAlsDatum } from '@/lib/inspecties/server';
import { TaakWijzigingSchema, controleerPlek, haalContract } from '@/lib/contractenServer';

/*
  PUT    /api/contract-taken/[id] - taak wijzigen (admin). Geeft het contract terug.
  DELETE /api/contract-taken/[id] - taak weghalen (admin, zacht; terug met herstellen)
*/

async function haalTaak(id: number) {
  const t = await prisma.contractTaak.findFirst({
    where: { id, deletedAt: null, contract: { deletedAt: null } },
    select: { id: true, contractId: true, objectId: true, contract: { select: { klantId: true } } },
  });
  if (!t) throw new ApiFout(404, 'Taak niet gevonden');
  return t;
}

export const PUT = apiRoute({ rol: 'admin', module: 'contracten', fout: 'Fout bij opslaan van de taak' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende taak');
  const taak = await haalTaak(id);
  const invoer = await leesJson(request, TaakWijzigingSchema);
  const objectId = invoer.objectId ?? taak.objectId;
  await controleerPlek(taak.contract.klantId, objectId, invoer.installatieId);
  const data: Record<string, unknown> = {};
  if (invoer.soort !== undefined) data.soort = invoer.soort;
  if (invoer.omschrijving !== undefined) data.omschrijving = invoer.omschrijving;
  if (invoer.objectId !== undefined) data.objectId = invoer.objectId;
  if (invoer.installatieId !== undefined) data.installatieId = invoer.installatieId;
  // Ander object zonder nieuwe installatie: de oude installatie hoort er dan niet meer bij.
  if (invoer.objectId !== undefined && invoer.objectId !== taak.objectId && invoer.installatieId === undefined) data.installatieId = null;
  if (invoer.intervalMaanden !== undefined) data.intervalMaanden = invoer.intervalMaanden;
  if (invoer.volgendeOp !== undefined) data.volgendeOp = dagAlsDatum(invoer.volgendeOp);
  if (invoer.geschatteMinuten !== undefined) data.geschatteMinuten = invoer.geschatteMinuten;
  if (invoer.notities !== undefined) data.notities = invoer.notities;
  await prisma.contractTaak.update({ where: { id }, data, select: { id: true } });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.UPDATE_CONTRACT_TAAK,
    details: { id, velden: Object.keys(data) },
    request,
  });
  return NextResponse.json(await haalContract(taak.contractId));
});

export const DELETE = apiRoute({ rol: 'admin', module: 'contracten', fout: 'Fout bij weghalen van de taak' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende taak');
  const taak = await haalTaak(id);
  await prisma.contractTaak.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: sessie.username } });
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.DELETE_CONTRACT_TAAK, details: { id, zacht: true }, request });
  return NextResponse.json(await haalContract(taak.contractId));
});
