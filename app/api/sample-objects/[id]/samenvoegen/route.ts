import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout, foutAntwoord } from '@/lib/planningApi';

/**
 * POST - Object samenvoegen: alle monsters en geplande stops van dit object
 * gaan naar het doelobject, daarna verdwijnt dit object. Zo ruim je de verkeerde
 * objecten op die uit de oude locatie-import zijn ontstaan, zonder dat je
 * monsters of planning kwijtraakt.
 *
 * Staan beide objecten op dezelfde dag in de planning, dan worden die twee stops
 * een stop en gaan de monsterkeuzes samen.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const { id } = await params;
    const vanId = parseInt(id);
    const body = await request.json().catch(() => ({}));
    const naarId = parseInt(String(body.doelId ?? ''));
    if (Number.isNaN(vanId) || Number.isNaN(naarId)) {
      return NextResponse.json({ error: 'Onbekend object' }, { status: 400 });
    }
    if (vanId === naarId) {
      return NextResponse.json({ error: 'Kies twee verschillende objecten' }, { status: 400 });
    }

    const van = await prisma.sampleObject.findUnique({ where: { id: vanId }, select: { id: true, name: true } });
    const naar = await prisma.sampleObject.findUnique({ where: { id: naarId }, select: { id: true, name: true } });
    if (!van || !naar) {
      return NextResponse.json({ error: 'Object niet gevonden' }, { status: 404 });
    }

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
  } catch (error) {
    return foutAntwoord(error, 'Fout bij samenvoegen van de objecten');
  }
}

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
