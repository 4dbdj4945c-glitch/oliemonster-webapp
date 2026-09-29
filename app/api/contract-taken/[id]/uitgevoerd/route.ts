import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesId, leesJson } from '@/lib/apiRoute';
import { UitvoeringSchema, haalContract, maakUitvoeringOngedaan, registreerUitvoering } from '@/lib/contractenServer';
import { vandaagNl } from '@/lib/contracten';

/*
  POST   /api/contract-taken/[id]/uitgevoerd - met de hand vastleggen dat de taak is gedaan
         (admin, body { datum }; zonder datum vandaag). Zet de volgende datum door en geeft
         het contract terug, plus de bron voor Ongedaan maken.
  DELETE /api/contract-taken/[id]/uitgevoerd - die uitvoering weer weghalen (admin, body { bron }).
         Alleen de laatste uitvoering kan terug.
*/

async function contractVan(id: number) {
  const t = await prisma.contractTaak.findFirst({ where: { id, deletedAt: null, contract: { deletedAt: null } }, select: { contractId: true } });
  if (!t) throw new ApiFout(404, 'Taak niet gevonden');
  return t.contractId;
}

export const POST = apiRoute({ rol: 'admin', module: 'contracten', fout: 'Fout bij vastleggen van de uitvoering' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende taak');
  const contractId = await contractVan(id);
  const { datum } = await leesJson(request, UitvoeringSchema);
  const dag = datum ?? vandaagNl();
  const bron = `hand-${Date.now()}`;
  const uitkomst = await registreerUitvoering(id, { datum: dag, bron, door: sessie.username });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.CONTRACT_TAAK_UITGEVOERD,
    details: { taakId: id, datum: dag, bron, volgendeOp: uitkomst.volgendeOp },
    request,
  });
  return NextResponse.json({ bron, volgendeOp: uitkomst.volgendeOp, contract: await haalContract(contractId) });
});

const OngedaanSchema = z.object({ bron: z.string({ error: 'Welke uitvoering?' }).min(1, { error: 'Welke uitvoering?' }).max(100) });

export const DELETE = apiRoute({ rol: 'admin', module: 'contracten', fout: 'Fout bij terugdraaien van de uitvoering' }, async (request, context, sessie) => {
  const id = await leesId(context, 'Onbekende taak');
  const contractId = await contractVan(id);
  const { bron } = await leesJson(request, OngedaanSchema);
  const gelukt = await maakUitvoeringOngedaan(id, bron);
  if (!gelukt) throw new ApiFout(409, 'Deze uitvoering is niet meer de laatste en kan niet meer terug.');
  await createAuditLog({ userId: sessie.userId, username: sessie.username, action: AuditActions.CONTRACT_TAAK_UITVOERING_ONGEDAAN, details: { taakId: id, bron }, request });
  return NextResponse.json(await haalContract(contractId));
});
