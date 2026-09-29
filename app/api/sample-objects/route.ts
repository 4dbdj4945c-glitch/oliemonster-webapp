import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { TABEL_ONTBREEKT_PLANNING } from '@/lib/planningApi';
import { actiefFilter } from '@/lib/verwijderdeMonsters';
import { apiRoute, ApiFout, jaarSchema, leesJson, leesQuery } from '@/lib/apiRoute';
import { alleenMeegestuurd, NieuwObjectSchema } from '@/lib/objectInvoer';
import { controleerKlant } from '@/lib/klanten';

/**
 * Objecten van de planningsmodule: de plekken waar de monsters vandaan komen.
 * Lezen mag iedereen die is ingelogd (behalve de beperkte kijker), wijzigen
 * alleen een admin.
 */

const OPTIES = { module: 'objecten', ontbreekt: TABEL_ONTBREEKT_PLANNING } as const;

// GET - Alle objecten, met het aantal monsters per object en de klant.
// Met ?year=2026 tellen we alleen de monsters van dat analysejaar.
export const GET = apiRoute({ rol: 'user', ...OPTIES, fout: 'Fout bij ophalen van objecten' }, async (request) => {
  const { year: gekozenJaar } = leesQuery(request, z.object({ year: jaarSchema.optional() }));

  const objecten = await prisma.sampleObject.findMany({
    orderBy: [{ name: 'asc' }],
    include: { klant: { select: { id: true, naam: true } } },
  });

  // We halen de monsters van alle jaren op: het jaarfilter bepaalt de tellingen
  // in de lijst, en `aantalAlleJaren` laat zien hoeveel monsters er meeverhuizen
  // als je dit object samenvoegt. Dat gaat namelijk over alle jaren.
  const monsters = await prisma.oilSample.findMany({
    where: { objectId: { not: null }, ...(await actiefFilter()) },
    select: { objectId: true, isTaken: true, isDisabled: true, analysisYear: true },
  });

  const tellingen = new Map<number, { totaal: number; genomen: number; geannuleerd: number; alleJaren: number }>();
  for (const m of monsters) {
    if (m.objectId === null) continue;
    const t = tellingen.get(m.objectId) ?? { totaal: 0, genomen: 0, geannuleerd: 0, alleJaren: 0 };
    t.alleJaren += 1;
    if (gekozenJaar === undefined || m.analysisYear === gekozenJaar) {
      t.totaal += 1;
      if (m.isDisabled) t.geannuleerd += 1;
      else if (m.isTaken) t.genomen += 1;
    }
    tellingen.set(m.objectId, t);
  }

  return NextResponse.json(
    objecten.map((o) => {
      const t = tellingen.get(o.id) ?? { totaal: 0, genomen: 0, geannuleerd: 0, alleJaren: 0 };
      return {
        ...o,
        aantalMonsters: t.totaal,
        aantalGenomen: t.genomen,
        aantalGeannuleerd: t.geannuleerd,
        aantalAlleJaren: t.alleJaren,
      };
    })
  );
});

// POST - Nieuw object (alleen admin)
export const POST = apiRoute({ rol: 'admin', ...OPTIES, fout: 'Fout bij aanmaken van object' }, async (request, _context, session) => {
  const invoer = await leesJson(request, NieuwObjectSchema);
  await controleerKlant(invoer.klantId);

  const bestaat = await prisma.sampleObject.findUnique({ where: { name: invoer.name }, select: { id: true } });
  if (bestaat) throw new ApiFout(400, 'Er is al een object met deze naam');

  const object = await prisma.sampleObject.create({ data: { ...alleenMeegestuurd(invoer), name: invoer.name } });

  await createAuditLog({
    userId: session.userId,
    username: session.username || 'unknown',
    action: AuditActions.CREATE_SAMPLE_OBJECT,
    details: { id: object.id, naam: object.name, klantId: object.klantId },
    request,
  });

  return NextResponse.json(object, { status: 201 });
});
