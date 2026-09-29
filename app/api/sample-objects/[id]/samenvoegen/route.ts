import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { TABEL_ONTBREEKT_PLANNING } from '@/lib/planningApi';
import { apiRoute, ApiFout, leesId, leesJson } from '@/lib/apiRoute';

/**
 * POST - Object samenvoegen: alle monsters en geplande stops van dit object
 * gaan naar het doelobject, daarna verdwijnt dit object. Zo ruim je de verkeerde
 * objecten op die uit de oude locatie-import zijn ontstaan, zonder dat je
 * monsters of planning kwijtraakt.
 *
 * Staan beide objecten op dezelfde dag in de planning, dan worden die twee stops
 * een stop en gaan de monsterkeuzes samen. Installaties gaan ook mee naar het
 * doelobject (met de monsters die eraan hangen).
 */
const SamenvoegSchema = z.object({
  doelId: z.coerce.number({ error: 'Onbekend object' }).int({ error: 'Onbekend object' }).positive({ error: 'Onbekend object' }),
});

export const POST = apiRoute(
  { rol: 'admin', module: 'objecten', fout: 'Fout bij samenvoegen van de objecten', ontbreekt: TABEL_ONTBREEKT_PLANNING },
  async (request, context, session) => {
    const vanId = await leesId(context, 'Onbekend object');
    const { doelId: naarId } = await leesJson(request, SamenvoegSchema);
    if (vanId === naarId) throw new ApiFout(400, 'Kies twee verschillende objecten');

    const van = await prisma.sampleObject.findUnique({ where: { id: vanId }, select: { id: true, name: true } });
    const naar = await prisma.sampleObject.findUnique({ where: { id: naarId }, select: { id: true, name: true } });
    if (!van || !naar) throw new ApiFout(404, 'Object niet gevonden');

    // Installaties mee, anders blokkeert de database het verwijderen van het object.
    const installaties = await prisma.installatie.updateMany({
      where: { objectId: vanId },
      data: { objectId: naarId },
    });

    // Inspecties mee (die blokkeren anders ook het verwijderen). De klant van de
    // inspectie blijft staan: die hoort bij het werk dat toen gedaan is.
    const inspecties = await prisma.inspectie.updateMany({
      where: { objectId: vanId },
      data: { objectId: naarId },
    });

    // Monsters mee
    const monsters = await prisma.oilSample.updateMany({
      where: { objectId: vanId },
      data: { objectId: naarId },
    });

    // Stops mee. Op een dag waar het doelobject al staat, gaan de stops samen.
    const stops = await prisma.samplePlanStop.findMany({
      where: { objectId: vanId },
      select: { id: true, planId: true, sampleIds: true, plannedMinutes: true },
    });
    let stopsVerhuisd = 0;
    let stopsSamengevoegd = 0;
    for (const stop of stops) {
      const doelStop = await prisma.samplePlanStop.findFirst({
        where: { planId: stop.planId, objectId: naarId },
        select: { id: true, sampleIds: true },
      });
      if (!doelStop) {
        await prisma.samplePlanStop.update({ where: { id: stop.id }, data: { objectId: naarId } });
        stopsVerhuisd += 1;
        continue;
      }
      // Leeg of null betekent "alle openstaande monsters", dat overheerst.
      const a = leesIds(doelStop.sampleIds);
      const b = leesIds(stop.sampleIds);
      const samen = a === null || b === null ? null : [...new Set([...a, ...b])];
      await prisma.samplePlanStop.update({
        where: { id: doelStop.id },
        data: { sampleIds: samen === null ? null : JSON.stringify(samen) },
      });
      await prisma.samplePlanStop.delete({ where: { id: stop.id } });
      stopsSamengevoegd += 1;
    }

    await prisma.sampleObject.delete({ where: { id: vanId } });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.MERGE_SAMPLE_OBJECTS,
      details: {
        van: van.name,
        naar: naar.name,
        monsters: monsters.count,
        installaties: installaties.count,
        inspecties: inspecties.count,
        stopsVerhuisd,
        stopsSamengevoegd,
      },
      request,
    });

    return NextResponse.json({
      success: true,
      monsters: monsters.count,
      stopsVerhuisd,
      stopsSamengevoegd,
    });
  }
);

/** JSON-lijst met monster-ids; null of leeg betekent "alles wat openstaat". */
function leesIds(waarde: string | null): number[] | null {
  if (!waarde) return null;
  try {
    const lijst = JSON.parse(waarde);
    if (!Array.isArray(lijst) || lijst.length === 0) return null;
    return lijst.map((n: unknown) => parseInt(String(n))).filter((n: number) => !Number.isNaN(n));
  } catch {
    return null;
  }
}
