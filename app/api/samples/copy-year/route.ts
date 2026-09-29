import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { apiRoute, ApiFout, jaarSchema, leesJson } from '@/lib/apiRoute';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { tabelOntbreekt } from '@/lib/planningApi';
import { actiefFilter } from '@/lib/verwijderdeMonsters';

// POST - Neem de te nemen monsters van een vorig analyse-jaar over naar een nieuw jaar (alleen admin).
// Body: { fromYear: 2025, toYear: 2026 }. Werkt voor elk jaar (de pagina neemt het vorige jaar over).
// Alle monsters uit fromYear, ook de daar geannuleerde, worden als "gepland" (niet genomen,
// niet geannuleerd, zonder datum, foto of opmerking) aangemaakt in toYear. O-nummers die in toYear al bestaan worden overgeslagen.
const OvernemenSchema = z.object({
  fromYear: jaarSchema,
  toYear: jaarSchema,
});

export const POST = apiRoute(
  { rol: 'admin', module: 'oliemonsters', adminMelding: 'Alleen admins kunnen monsters overnemen', fout: 'Fout bij overnemen van monsters' },
  async (request, _context, session) => {
    const { fromYear, toYear } = await leesJson(request, OvernemenSchema);
    if (fromYear === toYear) throw new ApiFout(400, 'Ongeldig bron- of doeljaar');

    // Objecten zijn jaaroverstijgend: dezelfde sluis komt elk jaar terug. Neem de
    // koppeling dus mee, anders staat de planning van het nieuwe jaar leeg.
    // Zolang ./db-push-planning.sh nog niet gedraaid is bestaat de kolom niet;
    // dan halen we alleen de oude velden op.
    let bron: { oNumber: string; location: string; description: string; oilType: string | null; objectId?: number | null; klantId?: number | null }[];
    try {
      bron = await prisma.oilSample.findMany({
        where: { analysisYear: fromYear, ...(await actiefFilter()) },
        select: { oNumber: true, location: true, description: true, oilType: true, objectId: true, klantId: true },
        orderBy: { oNumber: 'asc' },
      });
    } catch (error) {
      if (!tabelOntbreekt(error)) throw error;
      bron = await prisma.oilSample.findMany({
        where: { analysisYear: fromYear, ...(await actiefFilter()) },
        select: { oNumber: true, location: true, description: true, oilType: true },
        orderBy: { oNumber: 'asc' },
      });
    }

    // Hier bewust ook de monsters in de prullenbak: hun O-nummer is in de
    // database nog bezet, dus overnemen zou op de unieke sleutel stuklopen.
    const bestaand = await prisma.oilSample.findMany({
      where: { analysisYear: toYear },
      select: { oNumber: true },
    });
    const alAanwezig = new Set(bestaand.map((s) => s.oNumber));

    const nieuw = bron.filter((s) => !alAanwezig.has(s.oNumber));

    if (nieuw.length > 0) {
      await prisma.oilSample.createMany({
        data: nieuw.map((s) => ({
          oNumber: s.oNumber,
          analysisYear: toYear,
          location: s.location,
          description: s.description,
          oilType: s.oilType,
          isTaken: false,
          isDisabled: false,
          ...(s.objectId === undefined ? {} : { objectId: s.objectId }),
          // De klant van een monster zonder object gaat mee (lib/afscherming.ts).
          ...(s.klantId ? { klantId: s.klantId } : {}),
        })),
      });
    }

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.COPY_SAMPLES,
      details: { fromYear, toYear, overgenomen: nieuw.length, overgeslagen: bron.length - nieuw.length },
      request,
    });

    return NextResponse.json({
      overgenomen: nieuw.length,
      overgeslagen: bron.length - nieuw.length,
      bron: bron.length,
    });
  }
);
