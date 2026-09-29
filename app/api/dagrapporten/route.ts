import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesJson, leesQuery } from '@/lib/apiRoute';
import { dagAlsDatum } from '@/lib/inspecties/server';
import {
  NieuwDagrapportSchema,
  controleerObject,
  dagrapportAlsJson,
  dagrapportInLijst,
  haalDagrapport,
  haalDagrapporten,
} from '@/lib/dagrapporten';

/*
  GET  /api/dagrapporten?klantId=&planId= - dagrapporten (beheerder en gebruiker)
  POST /api/dagrapporten                  - nieuw dagrapport bij een bezoek (admin): een
       planningsdag (planId) of een losse klant. Geeft het dagrapport terug.
*/

const Query = z.object({
  klantId: z.coerce.number().int().positive().optional(),
  planId: z.coerce.number().int().positive().optional(),
});

export const GET = apiRoute({ rol: 'user', module: 'dagrapporten', fout: 'Fout bij ophalen van de dagrapporten' }, async (request, _context, sessie) => {
  const q = leesQuery(request, Query);
  const rijen = await haalDagrapporten(sessie, { ...(q.klantId ? { klantId: q.klantId } : {}), ...(q.planId ? { planId: q.planId } : {}) });
  return NextResponse.json(rijen.map(dagrapportInLijst));
});

export const POST = apiRoute({ rol: 'admin', module: 'dagrapporten', fout: 'Fout bij aanmaken van het dagrapport' }, async (request, _context, sessie) => {
  const invoer = await leesJson(request, NieuwDagrapportSchema);
  const klant = await prisma.klant.findFirst({ where: { id: invoer.klantId, deletedAt: null }, select: { id: true } });
  if (!klant) throw new ApiFout(400, 'Onbekende klant', { velden: { klantId: 'Onbekende klant' } });
  await controleerObject(invoer.objectId, invoer.klantId);
  if (invoer.planId) {
    const plan = await prisma.samplePlan.findUnique({ where: { id: invoer.planId }, select: { id: true } });
    if (!plan) throw new ApiFout(400, 'Onbekende planningsdag');
  }
  const rij = await prisma.dagrapport.create({
    data: {
      klantId: invoer.klantId,
      planId: invoer.planId ?? null,
      objectId: invoer.objectId ?? null,
      datum: dagAlsDatum(invoer.datum),
      uitvoerder: invoer.uitvoerder,
      werkzaamheden: invoer.werkzaamheden ?? null,
      bevindingen: invoer.bevindingen ?? null,
      minuten: invoer.uren ?? null,
    },
    select: { id: true },
  });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.CREATE_DAGRAPPORT,
    details: { id: rij.id, klantId: invoer.klantId, planId: invoer.planId ?? null, datum: invoer.datum },
    request,
  });
  return NextResponse.json(dagrapportAlsJson(await haalDagrapport(rij.id, sessie)), { status: 201 });
});
