import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { apiRoute, jaarSchema, leesQuery } from '@/lib/apiRoute';
import { verwijderKolomBestaat } from '@/lib/verwijderdeMonsters';

/**
 * GET - De prullenbak: verwijderde monsters van één analysejaar (alleen admin).
 * De rol alleen lezen en gewone gebruikers krijgen hier niets.
 * Staat de kolom deletedAt er nog niet, dan is de prullenbak gewoon leeg.
 */
export const GET = apiRoute({ rol: 'admin', module: 'oliemonsters', fout: 'Fout bij ophalen van de prullenbak' }, async (request) => {
  const { year: jaar } = leesQuery(request, z.object({ year: jaarSchema }));
  if (!(await verwijderKolomBestaat())) {
    return NextResponse.json({ monsters: [], kolomOntbreekt: true });
  }

  const monsters = await prisma.oilSample.findMany({
    where: { analysisYear: jaar, deletedAt: { not: null } },
    orderBy: { deletedAt: 'desc' },
    select: {
      id: true,
      oNumber: true,
      location: true,
      description: true,
      isTaken: true,
      sampleDate: true,
      deletedAt: true,
      deletedBy: true,
      _count: { select: { attempts: true } },
    },
  });

  return NextResponse.json({
    monsters: monsters.map(({ _count, ...m }) => ({ ...m, attemptsCount: _count.attempts })),
    kolomOntbreekt: false,
  });
});
