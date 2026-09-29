import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { apiRoute, ApiFout, leesJson, leesQuery } from '@/lib/apiRoute';
import { SJABLOON_SLEUTELS, leesInstellingen, plusMaanden, sjabloonVan } from '@/lib/inspecties/sjablonen';
import {
  INSPECTIE_SELECT,
  NieuweInspectieSchema,
  controleerInstallatie,
  dagAlsDatum,
  inspectieFilter,
  inspectieInLijst,
} from '@/lib/inspecties/server';

/*
  GET  /api/inspecties[?klantId=][&sjabloon=] - alle inspecties (beheerder en gebruiker)
  POST /api/inspecties - nieuwe inspectie (admin). De klant is die van het object.
*/

const Query = z.object({
  klantId: z.coerce.number().int().positive().optional(),
  sjabloon: z.enum(SJABLOON_SLEUTELS).optional(),
});

export const GET = apiRoute({ rol: 'user', module: 'inspecties', fout: 'Fout bij ophalen van de inspecties' }, async (request, _context, sessie) => {
  const q = leesQuery(request, Query);
  const rijen = await prisma.inspectie.findMany({
    where: { ...inspectieFilter(sessie), ...(q.klantId ? { klantId: q.klantId } : {}), ...(q.sjabloon ? { sjabloon: q.sjabloon } : {}) },
    orderBy: [{ datum: 'desc' }, { id: 'desc' }],
    select: INSPECTIE_SELECT,
  });
  return NextResponse.json(rijen.map(inspectieInLijst));
});

export const POST = apiRoute({ rol: 'admin', module: 'inspecties', fout: 'Fout bij aanmaken van de inspectie' }, async (request, _context, sessie) => {
  const invoer = await leesJson(request, NieuweInspectieSchema);
  const object = await prisma.sampleObject.findUnique({ where: { id: invoer.objectId }, select: { id: true, name: true, klantId: true } });
  if (!object) throw new ApiFout(400, 'Onbekend object');
  if (!object.klantId) throw new ApiFout(400, `${object.name} hoort nog bij geen klant. Koppel het object eerst aan een klant.`);
  await controleerInstallatie(invoer.installatieId, object.klantId);

  const s = sjabloonVan(invoer.sjabloon);
  const inspectie = await prisma.inspectie.create({
    data: {
      sjabloon: invoer.sjabloon,
      klantId: object.klantId,
      objectId: object.id,
      installatieId: invoer.installatieId ?? null,
      datum: dagAlsDatum(invoer.datum),
      uitvoerder: invoer.uitvoerder,
      samenvatting: invoer.samenvatting ?? null,
      instellingen: leesInstellingen(s, {}),
      volgendeOp: dagAlsDatum(plusMaanden(invoer.datum, s.volgendeNaMaanden)),
    },
    select: { id: true },
  });
  await createAuditLog({
    userId: sessie.userId,
    username: sessie.username,
    action: AuditActions.CREATE_INSPECTIE,
    details: { id: inspectie.id, sjabloon: invoer.sjabloon, klantId: object.klantId, objectId: object.id },
    request,
  });
  return NextResponse.json({ id: inspectie.id }, { status: 201 });
});
