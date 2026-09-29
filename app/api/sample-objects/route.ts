import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout, foutAntwoord } from '@/lib/planningApi';
import { leesObject } from '@/lib/sampleObjects';
import { actiefFilter } from '@/lib/verwijderdeMonsters';

/**
 * Objecten van de planningsmodule: de plekken waar de monsters vandaan komen.
 * Lezen mag iedereen die is ingelogd (behalve de beperkte kijker), wijzigen
 * alleen een admin.
 */

// GET - Alle objecten, met het aantal monsters per object.
// Met ?year=2026 tellen we alleen de monsters van dat analysejaar.
export async function GET(request: NextRequest) {
  const session = await haalSessie();
  const fout = toegangsFout(session, false);
  if (fout) return fout;

  try {
    const { searchParams } = new URL(request.url);
    const jaarParam = searchParams.get('year');
    const jaar = jaarParam ? parseInt(jaarParam) : null;

    const objecten = await prisma.sampleObject.findMany({
      orderBy: [{ name: 'asc' }],
    });

    // We halen de monsters van alle jaren op: het jaarfilter bepaalt de tellingen
    // in de lijst, en `aantalAlleJaren` laat zien hoeveel monsters er meeverhuizen
    // als je dit object samenvoegt. Dat gaat namelijk over alle jaren.
    const monsters = await prisma.oilSample.findMany({
      where: { objectId: { not: null }, ...(await actiefFilter()) },
      select: { objectId: true, isTaken: true, isDisabled: true, analysisYear: true },
    });
    const gekozenJaar = jaar && !Number.isNaN(jaar) ? jaar : null;

    const tellingen = new Map<
      number,
      { totaal: number; genomen: number; geannuleerd: number; alleJaren: number }
    >();
    for (const m of monsters) {
      if (m.objectId === null) continue;
      const t =
        tellingen.get(m.objectId) ?? { totaal: 0, genomen: 0, geannuleerd: 0, alleJaren: 0 };
      t.alleJaren += 1;
      if (gekozenJaar === null || m.analysisYear === gekozenJaar) {
        t.totaal += 1;
        if (m.isDisabled) t.geannuleerd += 1;
        else if (m.isTaken) t.genomen += 1;
      }
      tellingen.set(m.objectId, t);
    }

    return NextResponse.json(
      objecten.map((o) => {
        const t =
          tellingen.get(o.id) ?? { totaal: 0, genomen: 0, geannuleerd: 0, alleJaren: 0 };
        return {
          ...o,
          aantalMonsters: t.totaal,
          aantalGenomen: t.genomen,
          aantalGeannuleerd: t.geannuleerd,
          aantalAlleJaren: t.alleJaren,
        };
      })
    );
  } catch (error) {
    return foutAntwoord(error, 'Fout bij ophalen van objecten');
  }
}

// POST - Nieuw object (alleen admin)
export async function POST(request: NextRequest) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const body = await request.json().catch(() => ({}));
    const gegevens = leesObject(body, true);
    if ('fout' in gegevens) {
      return NextResponse.json({ error: gegevens.fout }, { status: 400 });
    }

    const bestaat = await prisma.sampleObject.findUnique({
      where: { name: gegevens.data.name as string },
      select: { id: true },
    });
    if (bestaat) {
      return NextResponse.json({ error: 'Er is al een object met deze naam' }, { status: 400 });
    }

    const object = await prisma.sampleObject.create({ data: gegevens.data as never });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CREATE_SAMPLE_OBJECT,
      details: { id: object.id, naam: object.name },
      request,
    });

    return NextResponse.json(object, { status: 201 });
  } catch (error) {
    return foutAntwoord(error, 'Fout bij aanmaken van object');
  }
}
