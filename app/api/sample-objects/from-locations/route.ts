import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout, foutAntwoord } from '@/lib/planningApi';
import { raadObjectType } from '@/lib/sampleObjects';

/**
 * POST - Maak objecten uit de locatieteksten van een analysejaar en koppel de
 * monsters eraan. Dit is een eenmalige actie om de planningsmodule te vullen met
 * wat er al is; daarna beheer je de objecten in het beheerscherm.
 *
 * Zonder `uitvoeren: true` krijg je alleen een voorbeeld: wat zou er gebeuren.
 * Monsters die al aan een object hangen blijven met rust.
 */
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
    const uitvoeren = body.uitvoeren === true;

    const monsters = await prisma.oilSample.findMany({
      where: { analysisYear: jaar, objectId: null },
      select: { id: true, location: true },
    });

    // Groepeer op de locatietekst, hoofdletterongevoelig maar met de eerste
    // schrijfwijze als naam.
    const groepen = new Map<string, { naam: string; monsterIds: number[] }>();
    for (const m of monsters) {
      const naam = (m.location || '').trim();
      if (!naam) continue;
      const sleutel = naam.toLowerCase();
      const groep = groepen.get(sleutel) ?? { naam, monsterIds: [] };
      groep.monsterIds.push(m.id);
      groepen.set(sleutel, groep);
    }

    const bestaande = await prisma.sampleObject.findMany({ select: { id: true, name: true } });
    const opNaam = new Map(bestaande.map((o) => [o.name.toLowerCase(), o]));

    const voorbeeld = [...groepen.values()]
      .map((g) => ({
        naam: g.naam,
        objectType: raadObjectType(g.naam),
        aantalMonsters: g.monsterIds.length,
        bestaatAl: opNaam.has(g.naam.toLowerCase()),
      }))
      .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));

    const zonderLocatie = monsters.filter((m) => !(m.location || '').trim()).length;

    if (!uitvoeren) {
      return NextResponse.json({
        uitgevoerd: false,
        analysisYear: jaar,
        nieuweObjecten: voorbeeld.filter((v) => !v.bestaatAl).length,
        bestaandeObjecten: voorbeeld.filter((v) => v.bestaatAl).length,
        teKoppelenMonsters: voorbeeld.reduce((n, v) => n + v.aantalMonsters, 0),
        monstersZonderLocatie: zonderLocatie,
        voorbeeld,
      });
    }

    let aangemaakt = 0;
    let gekoppeld = 0;
    for (const groep of groepen.values()) {
      const sleutel = groep.naam.toLowerCase();
      let object = opNaam.get(sleutel);
      if (!object) {
        const nieuw = await prisma.sampleObject.create({
          data: { name: groep.naam, objectType: raadObjectType(groep.naam) },
          select: { id: true, name: true },
        });
        opNaam.set(sleutel, nieuw);
        object = nieuw;
        aangemaakt += 1;
      }
      const resultaat = await prisma.oilSample.updateMany({
        where: { id: { in: groep.monsterIds } },
        data: { objectId: object.id },
      });
      gekoppeld += resultaat.count;
    }

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.IMPORT_SAMPLE_OBJECTS,
      details: { analysisYear: jaar, aangemaakt, gekoppeld },
      request,
    });

    return NextResponse.json({
      uitgevoerd: true,
      analysisYear: jaar,
      aangemaakt,
      gekoppeld,
      monstersZonderLocatie: zonderLocatie,
    });
  } catch (error) {
    return foutAntwoord(error, 'Fout bij aanmaken van objecten uit de locaties');
  }
}
