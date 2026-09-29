import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId, leesJson } from '@/lib/apiRoute';
import { dagAlsDatum } from '@/lib/inspecties/server';
import { nlDag } from '@/lib/klantOpdracht';
import { ContractWijzigingSchema, haalContract, haalTakenVanPlanning } from '@/lib/contractenServer';

/*
  GET    /api/contracten/[id] - het contract met taken (beheerder en gebruiker)
  PUT    /api/contracten/[id] - naam, looptijd, notities (admin)
  DELETE /api/contracten/[id] - naar de prullenbak met taken en al (admin, body { bevestigNaam })
*/

export const GET = apiRoute({ rol: 'user', module: 'contracten', fout: 'Fout bij ophalen van het contract' }, async (_request, context) => {
  const id = await leesId(context, 'Onbekend contract');
  return NextResponse.json(await haalContract(id));
});

export const PUT = apiRoute({ rol: 'admin', module: 'contracten', fout: 'Fout bij opslaan van het contract' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekend contract');
  const huidig = await haalContract(id);
  const invoer = await leesJson(request, ContractWijzigingSchema);
  const start = invoer.startOp !== undefined ? invoer.startOp : huidig.startOp;
  const eind = invoer.eindOp !== undefined ? invoer.eindOp : huidig.eindOp;
  if (start && eind && eind < start) {
    throw new ApiFout(400, 'De einddatum ligt voor de begindatum', { velden: { eindOp: 'De einddatum ligt voor de begindatum' } });
  }
  const data: Record<string, unknown> = {};
  if (invoer.naam !== undefined) data.naam = invoer.naam;
  if (invoer.startOp !== undefined) data.startOp = invoer.startOp ? dagAlsDatum(invoer.startOp) : null;
  if (invoer.eindOp !== undefined) data.eindOp = invoer.eindOp ? dagAlsDatum(invoer.eindOp) : null;
  if (invoer.notities !== undefined) data.notities = invoer.notities;
  await prisma.contract.update({ where: { id }, data, select: { id: true } });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.UPDATE_CONTRACT,
    details: { id, velden: Object.keys(data) },
    request,
  });
  return NextResponse.json(await haalContract(id));
});

const VerwijderSchema = z.object({ bevestigNaam: z.string().optional() });

export const DELETE = apiRoute({ rol: 'admin', module: 'contracten', fout: 'Fout bij verwijderen van het contract' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekend contract');
  const huidig = await haalContract(id);
  const { bevestigNaam } = await leesJson(request, VerwijderSchema);
  if ((bevestigNaam ?? '').trim().toLowerCase() !== huidig.naam.trim().toLowerCase()) {
    throw new ApiFout(400, `Typ de naam van het contract (${huidig.naam}) over om het verwijderen te bevestigen.`);
  }
  await prisma.contract.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: sessie.username } });
  const vanPlanning = await haalTakenVanPlanning(huidig.taken.map((t) => t.id));
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.DELETE_CONTRACT,
    details: { id, naam: huidig.naam, taken: huidig.taken.length, stopsWeg: vanPlanning, zacht: true, op: nlDag(new Date()) },
    request,
  });
  return NextResponse.json({ success: true, id });
});
