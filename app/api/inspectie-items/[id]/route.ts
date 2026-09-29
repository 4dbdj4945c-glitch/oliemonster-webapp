import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId, leesJson } from '@/lib/apiRoute';
import { sjabloonVan, type SjabloonSleutel } from '@/lib/inspecties/sjablonen';
import { ItemWijzigingSchema, alsDag, controleerInstallatie, controleerItem, dagAlsDatum, haalInspectie, inspectieAlsJson } from '@/lib/inspecties/server';
import { nlDag } from '@/lib/klantOpdracht';

/*
  PUT    /api/inspectie-items/[id] - een bevinding bijwerken (admin). Alleen wat
         meekomt verandert. Gerepareerd zonder datum krijgt vandaag.
  DELETE /api/inspectie-items/[id] - bevinding weghalen (admin, zacht; de pagina
         toont Ongedaan maken, zie .../herstellen).
  Beide geven de hele inspectie terug, met de nieuwe totalen.
*/

async function actiefItem(id: number) {
  const item = await prisma.inspectieItem.findFirst({
    where: { id, deletedAt: null, inspectie: { deletedAt: null } },
    select: { id: true, inspectieId: true, titel: true, fotoUrl: true, gerepareerdOp: true, oordeel: true, waarden: true },
  });
  if (!item) throw new ApiFout(404, 'Bevinding niet gevonden');
  return item;
}

export const PUT = apiRoute({ rol: 'admin', module: 'inspecties', fout: 'Fout bij opslaan van de bevinding' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende bevinding');
  const item = await actiefItem(id);
  const inspectie = await haalInspectie(item.inspectieId, sessie);
  const sjabloon = inspectie.sjabloon as SjabloonSleutel;
  const s = sjabloonVan(sjabloon);
  const invoer = await leesJson(request, ItemWijzigingSchema);
  const { waarden } = controleerItem(sjabloon, invoer, item);
  await controleerInstallatie(invoer.installatieId, inspectie.klantId);

  const data: Record<string, unknown> = {};
  for (const veld of ['titel', 'locatie', 'oordeel', 'notitie', 'installatieId', 'volgorde'] as const) {
    if (invoer[veld] !== undefined) data[veld] = invoer[veld];
  }
  if (waarden !== undefined) data.waarden = waarden;
  if (invoer.volgendeOp !== undefined) data.volgendeOp = alsDag(invoer.volgendeOp);
  if (s.reparatie) {
    if (invoer.gerepareerd !== undefined) {
      data.gerepareerd = invoer.gerepareerd;
      data.gerepareerdOp = invoer.gerepareerd ? alsDag(invoer.gerepareerdOp) ?? item.gerepareerdOp ?? dagAlsDatum(nlDag(new Date())) : null;
    } else if (invoer.gerepareerdOp !== undefined) {
      data.gerepareerdOp = alsDag(invoer.gerepareerdOp);
    }
  }
  await prisma.inspectieItem.update({ where: { id }, data, select: { id: true } });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.UPDATE_INSPECTIE_ITEM,
    details: { inspectieId: item.inspectieId, itemId: id, velden: Object.keys(data) },
    request,
  });
  return NextResponse.json(inspectieAlsJson(await haalInspectie(item.inspectieId, sessie)));
});

export const DELETE = apiRoute({ rol: 'admin', module: 'inspecties', fout: 'Fout bij weghalen van de bevinding' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende bevinding');
  const item = await actiefItem(id);
  await prisma.inspectieItem.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: sessie.username } });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.DELETE_INSPECTIE_ITEM,
    details: { inspectieId: item.inspectieId, itemId: id, titel: item.titel, zacht: true },
    request,
  });
  return NextResponse.json(inspectieAlsJson(await haalInspectie(item.inspectieId, sessie)));
});
