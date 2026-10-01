import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId } from '@/lib/apiRoute';
import { alleenConcept, dagrapportAlsJson, haalDagrapport, wijzigConcept } from '@/lib/dagrapporten';

/*
  POST   /api/dagrapporten/[id]/afronden - werkbon afronden zonder handtekening (admin).
         Hij ligt daarna vast en staat in het klantdossier en het klantportaal.
  DELETE /api/dagrapporten/[id]/afronden - een afgeronde werkbon heropenen, weer een concept.
*/

export const POST = apiRoute({ rol: 'admin', module: 'dagrapporten', fout: 'Fout bij afronden van de werkbon' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende werkbon');
  const huidig = await haalDagrapport(id, sessie);
  alleenConcept(huidig);
  if (!huidig.werkzaamheden?.trim()) {
    throw new ApiFout(400, 'Vul eerst in wat je gedaan hebt', { velden: { werkzaamheden: 'Vul in wat je gedaan hebt' } });
  }
  await wijzigConcept(id, { status: 'afgerond', afgerondOp: new Date() });
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.DAGRAPPORT_AFGEROND, details: { id }, request });
  return NextResponse.json(dagrapportAlsJson(await haalDagrapport(id, sessie)));
});

export const DELETE = apiRoute({ rol: 'admin', module: 'dagrapporten', fout: 'Fout bij heropenen van de werkbon' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende werkbon');
  const huidig = await haalDagrapport(id, sessie);
  if (huidig.status !== 'afgerond') return NextResponse.json(dagrapportAlsJson(huidig));
  await prisma.dagrapport.updateMany({ where: { id, status: 'afgerond' }, data: { status: 'concept', afgerondOp: null } });
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.DAGRAPPORT_HEROPEND, details: { id, afgerondOp: huidig.afgerondOp }, request });
  return NextResponse.json(dagrapportAlsJson(await haalDagrapport(id, sessie)));
});
