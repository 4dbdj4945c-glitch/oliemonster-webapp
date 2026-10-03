import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId, leesJson } from '@/lib/apiRoute';
import { inspectieNummer, leesInstellingen, sjabloonVan } from '@/lib/inspecties/sjablonen';
import {
  InspectieWijzigingSchema,
  afrondFout,
  alsDag,
  controleerInstallatie,
  dagAlsDatum,
  haalInspectie,
  inspectieAlsJson,
  metWaardeFout,
} from '@/lib/inspecties/server';
import { naInspectieStatus } from '@/lib/contractenServer';

/*
  GET    /api/inspecties/[id] - de inspectie met bevindingen en totalen (beheerder en gebruiker)
  PUT    /api/inspecties/[id] - gegevens, instellingen, status (admin). Status afgerond
         zet afgerondOp en afgerondDoor; terug naar concept wist die weer.
  DELETE /api/inspecties/[id] - naar de prullenbak (admin, body { bevestig: "INS-2026-012" })
*/

export const GET = apiRoute({ rol: 'user', module: 'inspecties', fout: 'Fout bij ophalen van de inspectie' }, async (_request, context, sessie) => {
  const id = await leesId(context, 'Onbekende inspectie');
  return NextResponse.json(inspectieAlsJson(await haalInspectie(id, sessie)));
});

export const PUT = apiRoute({ rol: 'admin', module: 'inspecties', fout: 'Fout bij opslaan van de inspectie' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende inspectie');
  const huidig = await haalInspectie(id, sessie);
  const invoer = await leesJson(request, InspectieWijzigingSchema);
  await controleerInstallatie(invoer.installatieId, huidig.klantId);

  const s = sjabloonVan(huidig.sjabloon);
  const data: Record<string, unknown> = {};
  if (invoer.installatieId !== undefined) data.installatieId = invoer.installatieId;
  if (invoer.datum !== undefined) data.datum = dagAlsDatum(invoer.datum);
  if (invoer.uitvoerder !== undefined) data.uitvoerder = invoer.uitvoerder;
  if (invoer.samenvatting !== undefined) data.samenvatting = invoer.samenvatting;
  if (invoer.volgendeOp !== undefined) data.volgendeOp = alsDag(invoer.volgendeOp);
  if (invoer.instellingen !== undefined) {
    // Samenvoegen met wat er staat: een scherm mag één instelling tegelijk sturen.
    const oud = (huidig.instellingen && typeof huidig.instellingen === 'object' ? huidig.instellingen : {}) as Record<string, unknown>;
    data.instellingen = metWaardeFout(() => leesInstellingen(s, { ...oud, ...invoer.instellingen }));
  }
  if (invoer.status === 'afgerond' && huidig.status !== 'afgerond') {
    const melding = afrondFout(huidig);
    if (melding) throw new ApiFout(400, melding);
  }
  if (invoer.status !== undefined && invoer.status !== huidig.status) {
    data.status = invoer.status;
    data.afgerondOp = invoer.status === 'afgerond' ? new Date() : null;
    data.afgerondDoor = invoer.status === 'afgerond' ? sessie.username : null;
  }
  const na = await prisma.inspectie.update({
    where: { id },
    data,
    select: { id: true, sjabloon: true, objectId: true, installatieId: true, datum: true, status: true },
  });
  // Contracttaken van dit sjabloon op dit object gaan door (afgerond) of terug
  // (weer concept). Ook bij een nieuwe datum van een afgeronde inspectie: eerst
  // terug, dan opnieuw vanaf de nieuwe datum.
  let taken: number[] = [];
  if (data.status !== undefined) {
    taken = await naInspectieStatus(na, na.status === 'afgerond', sessie.username);
  } else if (na.status === 'afgerond' && (data.datum !== undefined || data.installatieId !== undefined)) {
    await naInspectieStatus({ ...na, installatieId: huidig.installatieId, datum: huidig.datum }, false, sessie.username);
    taken = await naInspectieStatus(na, true, sessie.username);
  }
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.UPDATE_INSPECTIE,
    details: { id, velden: Object.keys(data), status: data.status, ...(taken.length ? { contractTaken: taken } : {}) },
    request,
  });
  return NextResponse.json(inspectieAlsJson(await haalInspectie(id, sessie)));
});

const VerwijderSchema = z.object({ bevestig: z.string().optional() });

export const DELETE = apiRoute({ rol: 'admin', module: 'inspecties', fout: 'Fout bij verwijderen van de inspectie' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende inspectie');
  const rij = await haalInspectie(id, sessie);
  const { bevestig } = await leesJson(request, VerwijderSchema);
  const nummer = inspectieNummer(rij);
  if ((bevestig ?? '').trim().toUpperCase() !== nummer) {
    throw new ApiFout(400, `Typ ${nummer} over om het verwijderen te bevestigen.`);
  }
  const weg = await prisma.inspectie.update({
    where: { id },
    data: { deletedAt: new Date(), deletedBy: sessie.username },
    select: { id: true, sjabloon: true, objectId: true, installatieId: true, datum: true, status: true },
  });
  // Een afgeronde inspectie die weggaat, telt ook niet meer als uitvoering van een contracttaak.
  if (weg.status === 'afgerond') await naInspectieStatus(weg, false, sessie.username);
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.DELETE_INSPECTIE,
    details: { id, nummer, zacht: true },
    request,
  });
  return NextResponse.json({ success: true, id, nummer });
});
