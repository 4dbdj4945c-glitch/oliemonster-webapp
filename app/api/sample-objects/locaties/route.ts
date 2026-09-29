import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout, foutAntwoord } from '@/lib/planningApi';
import { raadKunstwerk } from '@/lib/sampleObjects';
import { actiefFilter } from '@/lib/verwijderdeMonsters';

/*
  De locatieteksten van een analysejaar, om ze aan een kunstwerk te knopen.
  `location` op een monster is het onderdeel op het kunstwerk (bijvoorbeeld
  "Belfeld Westsluis"); het object is het kunstwerk zelf (Sluis Belfeld). Per
  locatietekst zie je hoeveel monsters er zijn, waar ze nu aan hangen en welk
  kunstwerk wij voorstellen. Bij twijfel komt er geen voorstel terug.
*/

interface Groep {
  locatie: string;
  monsterIds: number[];
  tekst: string[];
  objecten: Map<number | null, number>;
}

async function haalGroepen(jaar: number) {
  const monsters = await prisma.oilSample.findMany({
    where: { analysisYear: jaar, ...(await actiefFilter()) },
    select: { id: true, location: true, description: true, objectId: true },
    orderBy: { oNumber: 'asc' },
  });

  const groepen = new Map<string, Groep>();
  for (const m of monsters) {
    const locatie = (m.location || '').trim();
    const sleutel = locatie.toLowerCase();
    const groep = groepen.get(sleutel) ?? {
      locatie,
      monsterIds: [],
      tekst: [],
      objecten: new Map<number | null, number>(),
    };
    groep.monsterIds.push(m.id);
    if (m.description) groep.tekst.push(m.description);
    groep.objecten.set(m.objectId, (groep.objecten.get(m.objectId) ?? 0) + 1);
    groepen.set(sleutel, groep);
  }
  return groepen;
}

// GET - Alle locatieteksten van een jaar, met voorstel.
export async function GET(request: NextRequest) {
  const session = await haalSessie();
  const fout = toegangsFout(session, false);
  if (fout) return fout;

  try {
    const { searchParams } = new URL(request.url);
    const jaar = parseInt(searchParams.get('year') ?? '');
    if (Number.isNaN(jaar)) {
      return NextResponse.json({ error: 'Kies een analysejaar' }, { status: 400 });
    }

    const objecten = await prisma.sampleObject.findMany({
      select: { id: true, name: true, objectType: true, region: true },
      orderBy: [{ name: 'asc' }],
    });
    const opId = new Map(objecten.map((o) => [o.id, o]));

    const groepen = await haalGroepen(jaar);

    const regels = [...groepen.values()].map((g) => {
      const voorstel = g.locatie
        ? raadKunstwerk([g.locatie, ...g.tekst].join(' '), objecten)
        : { objectId: null, reden: 'Dit monster heeft geen locatietekst, kies zelf.' };

      const huidig = [...g.objecten.entries()]
        .filter(([id]) => id !== null)
        .map(([id, aantal]) => ({
          id: id as number,
          naam: opId.get(id as number)?.name ?? 'Onbekend object',
          aantal,
        }))
        .sort((a, b) => b.aantal - a.aantal);

      return {
        locatie: g.locatie,
        aantalMonsters: g.monsterIds.length,
        huidigeObjecten: huidig,
        aantalZonderObject: g.objecten.get(null) ?? 0,
        voorstelObjectId: voorstel.objectId,
        voorstelReden: voorstel.reden,
      };
    });

    regels.sort((a, b) => a.locatie.localeCompare(b.locatie, 'nl'));

    return NextResponse.json({
      analysisYear: jaar,
      objecten,
      regels,
      aantalLosseLocaties: regels.filter((r) => r.huidigeObjecten.length === 0).length,
    });
  } catch (error) {
    return foutAntwoord(error, 'Fout bij ophalen van de locaties');
  }
}

// POST - Alle monsters van een jaar met deze locatietekst aan een kunstwerk
// hangen. `objectId: null` maakt ze juist los. Alleen admin.
export async function POST(request: NextRequest) {
  const session = await haalSessie();
  const fout = toegangsFout(session, true);
  if (fout) return fout;

  try {
    const body = await request.json().catch(() => ({}));
    const jaar = parseInt(String(body.analysisYear ?? ''));
    if (Number.isNaN(jaar)) {
      return NextResponse.json({ error: 'Kies een analysejaar' }, { status: 400 });
    }
    if (typeof body.location !== 'string') {
      return NextResponse.json({ error: 'Onbekende locatie' }, { status: 400 });
    }
    const locatie = body.location.trim();

    let objectId: number | null = null;
    if (body.objectId !== null && body.objectId !== undefined && body.objectId !== '') {
      objectId = parseInt(String(body.objectId));
      if (Number.isNaN(objectId)) {
        return NextResponse.json({ error: 'Onbekend kunstwerk' }, { status: 400 });
      }
      const object = await prisma.sampleObject.findUnique({
        where: { id: objectId },
        select: { id: true, name: true },
      });
      if (!object) {
        return NextResponse.json({ error: 'Kunstwerk niet gevonden' }, { status: 404 });
      }
    }

    // De groep opnieuw bepalen op de server, hoofdletterongevoelig, zodat we
    // precies dezelfde monsters raken als in het overzicht.
    const groepen = await haalGroepen(jaar);
    const groep = groepen.get(locatie.toLowerCase());
    if (!groep) {
      return NextResponse.json(
        { error: `Geen monsters van ${jaar} met de locatie "${locatie}"` },
        { status: 404 }
      );
    }

    const resultaat = await prisma.oilSample.updateMany({
      where: { id: { in: groep.monsterIds } },
      data: { objectId },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.LINK_LOCATION_OBJECT,
      details: { analysisYear: jaar, locatie, objectId, bijgewerkt: resultaat.count },
      request,
    });

    return NextResponse.json({ success: true, bijgewerkt: resultaat.count });
  } catch (error) {
    return foutAntwoord(error, 'Fout bij koppelen van de locatie');
  }
}
