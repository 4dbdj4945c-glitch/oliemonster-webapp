import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId, leesJson } from '@/lib/apiRoute';
import { dagAlsDatum } from '@/lib/inspecties/server';
import { Prisma } from '@prisma/client';
import { DagrapportWijzigingSchema, alleenConcept, wijzigConcept, controleerObject, dagrapportAlsJson, dagrapportNummer, haalDagrapport, tijdData } from '@/lib/dagrapporten';

/*
  GET    /api/dagrapporten/[id] - het dagrapport met foto's en handtekening (beheerder en gebruiker)
  PUT    /api/dagrapporten/[id] - alle velden van de werkbon (admin, alleen een concept)
  DELETE /api/dagrapporten/[id] - naar de prullenbak (admin, body { bevestig: "DR-12" })
*/

export const GET = apiRoute({ rol: 'user', module: 'dagrapporten', fout: 'Fout bij ophalen van het dagrapport' }, async (_request, context, sessie) => {
  const id = await leesId(context, 'Onbekend dagrapport');
  return NextResponse.json(dagrapportAlsJson(await haalDagrapport(id, sessie)));
});

export const PUT = apiRoute({ rol: 'admin', module: 'dagrapporten', fout: 'Fout bij opslaan van het dagrapport' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekend dagrapport');
  const huidig = await haalDagrapport(id, sessie);
  alleenConcept(huidig);
  const invoer = await leesJson(request, DagrapportWijzigingSchema);
  await controleerObject(invoer.objectId, huidig.klantId);
  const data: Record<string, unknown> = {};
  if (invoer.objectId !== undefined) data.objectId = invoer.objectId;
  if (invoer.datum !== undefined) data.datum = dagAlsDatum(invoer.datum);
  if (invoer.uitvoerder !== undefined) data.uitvoerder = invoer.uitvoerder;
  if (invoer.werkzaamheden !== undefined) data.werkzaamheden = invoer.werkzaamheden;
  if (invoer.bevindingen !== undefined) data.bevindingen = invoer.bevindingen;
  Object.assign(data, tijdData(invoer, huidig));
  for (const k of ['soortWerk', 'referentie', 'contactpersoon', 'reisMinuten', 'kilometers', 'vervolgNodig', 'vervolgActie', 'handtekeningVragen'] as const) {
    if (invoer[k] !== undefined) data[k] = invoer[k];
  }
  if (invoer.materialen !== undefined) data.materialen = invoer.materialen ?? Prisma.DbNull;
  await wijzigConcept(id, data);
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.UPDATE_DAGRAPPORT, details: { id, velden: Object.keys(data) }, request });
  return NextResponse.json(dagrapportAlsJson(await haalDagrapport(id, sessie)));
});

const VerwijderSchema = z.object({ bevestig: z.string().optional() });

export const DELETE = apiRoute({ rol: 'admin', module: 'dagrapporten', fout: 'Fout bij verwijderen van het dagrapport' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekend dagrapport');
  await haalDagrapport(id, sessie);
  const { bevestig } = await leesJson(request, VerwijderSchema);
  const nummer = dagrapportNummer(id);
  if ((bevestig ?? '').trim().toUpperCase() !== nummer) throw new ApiFout(400, `Typ ${nummer} over om het verwijderen te bevestigen.`);
  await prisma.dagrapport.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: sessie.username } });
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.DELETE_DAGRAPPORT, details: { id, nummer, zacht: true }, request });
  return NextResponse.json({ success: true, id, nummer });
});
