import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';
import { verwijderKolomBestaat } from '@/lib/verwijderdeMonsters';

/**
 * GET - De prullenbak: verwijderde monsters van één analysejaar (alleen admin).
 * De rol alleen lezen en gewone gebruikers krijgen hier niets.
 * Staat de kolom deletedAt er nog niet, dan is de prullenbak gewoon leeg.
 */
export const GET = withAuth({ rol: 'admin', module: 'oliemonsters' }, async (request: NextRequest) => {
  try {
    const jaar = parseInt(new URL(request.url).searchParams.get('year') ?? '');
    if (Number.isNaN(jaar)) {
      return NextResponse.json({ error: 'Kies een analysejaar' }, { status: 400 });
    }
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
  } catch (error) {
    console.error('Error fetching deleted samples:', error);
    return NextResponse.json({ error: 'Fout bij ophalen van de prullenbak' }, { status: 500 });
  }
});
