import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId, leesJson } from '@/lib/apiRoute';
import { HandtekeningSchema, alleenConcept, dagrapportAlsJson, haalDagrapport, wijzigConcept } from '@/lib/dagrapporten';

/*
  POST   /api/dagrapporten/[id]/handtekening - de klant tekent (admin-sessie op het scherm
         van Roel): { naam, handtekening: data-URL van een PNG }. Het rapport ligt daarna vast.
  DELETE /api/dagrapporten/[id]/handtekening - handtekening wissen, weer een concept.
*/

export const POST = apiRoute({ rol: 'admin', module: 'dagrapporten', fout: 'Fout bij opslaan van de handtekening' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende werkbon');
  const huidig = await haalDagrapport(id, sessie);
  alleenConcept(huidig);
  const invoer = await leesJson(request, HandtekeningSchema);
  // Een PNG begint altijd met deze acht bytes; anders is het geen tekening van het scherm.
  const kop = Buffer.from(invoer.handtekening.slice('data:image/png;base64,'.length, 'data:image/png;base64,'.length + 12), 'base64');
  if (kop.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new ApiFout(400, 'Laat de klant eerst tekenen');
  await wijzigConcept(id, { status: 'getekend', handtekening: invoer.handtekening, getekendDoor: invoer.naam, getekendOp: new Date() });
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.DAGRAPPORT_GETEKEND, details: { id, getekendDoor: invoer.naam }, request });
  return NextResponse.json(dagrapportAlsJson(await haalDagrapport(id, sessie)));
});

export const DELETE = apiRoute({ rol: 'admin', module: 'dagrapporten', fout: 'Fout bij wissen van de handtekening' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende werkbon');
  const huidig = await haalDagrapport(id, sessie);
  if (huidig.status !== 'getekend') return NextResponse.json(dagrapportAlsJson(huidig));
  await prisma.dagrapport.update({
    where: { id },
    data: { status: 'concept', handtekening: null, getekendDoor: null, getekendOp: null },
    select: { id: true },
  });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.DAGRAPPORT_HANDTEKENING_GEWIST,
    details: { id, wasGetekendDoor: huidig.getekendDoor, getekendOp: huidig.getekendOp },
    request,
  });
  return NextResponse.json(dagrapportAlsJson(await haalDagrapport(id, sessie)));
});
