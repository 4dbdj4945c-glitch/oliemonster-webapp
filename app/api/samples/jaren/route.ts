import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiRoute } from '@/lib/apiRoute';
import { monsterFilter } from '@/lib/afscherming';

// GET - De analysejaren met monsters, met per jaar het aantal en hoeveel er
// genomen zijn (geannuleerde tellen niet als genomen). Voor de jaarkeuze op de
// oliemonsterpagina en de tegels op het dashboard. Een kijker met een eigen
// kijkjaar krijgt alleen dat jaar.
export const GET = apiRoute(
  { rol: 'alleen_lezen', module: 'oliemonsters', fout: 'Fout bij ophalen van de jaren' },
  async (_request, _context, sessie) => {
    // Kijkjaar en klant (lib/afscherming.ts): een kijker telt alleen wat hij mag zien.
    const where = await monsterFilter(sessie);
    const [totaal, genomen] = await Promise.all([
      prisma.oilSample.groupBy({ by: ['analysisYear'], where, _count: { _all: true } }),
      prisma.oilSample.groupBy({
        by: ['analysisYear'],
        where: { ...where, isTaken: true, isDisabled: false },
        _count: { _all: true },
      }),
    ]);
    const genomenPerJaar = new Map(genomen.map((g) => [g.analysisYear, g._count._all]));
    const jaren = totaal
      .map((t) => ({ jaar: t.analysisYear, totaal: t._count._all, genomen: genomenPerJaar.get(t.analysisYear) ?? 0 }))
      .sort((a, b) => b.jaar - a.jaar);
    return NextResponse.json({ jaren });
  }
);
