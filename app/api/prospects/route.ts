import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { haalSessie, toegangsFout, foutAntwoord, bouwProspectData } from '@/lib/prospectApi';

// GET - Alle prospects. Standaard zonder archief; met ?archief=1 komt het archief mee.
// Optioneel ?search= op bedrijfsnaam, plaats, contactpersoon, segment en aanknopingspunt.
export async function GET(request: NextRequest) {
  try {
    const session = await haalSessie();
    const fout = toegangsFout(session, false);
    if (fout) return fout;

    const { searchParams } = new URL(request.url);
    const metArchief = searchParams.get('archief') === '1';
    const search = searchParams.get('search')?.trim();

    const where: Prisma.ProspectWhereInput = {};
    if (!metArchief) where.archief = false;
    if (search) {
      where.OR = [
        { bedrijfsnaam: { contains: search, mode: 'insensitive' } },
        { plaats: { contains: search, mode: 'insensitive' } },
        { contactpersoon: { contains: search, mode: 'insensitive' } },
        { segment: { contains: search, mode: 'insensitive' } },
        { aanknopingspunt: { contains: search, mode: 'insensitive' } },
      ];
    }

    const prospects = await prisma.prospect.findMany({
      where,
      orderBy: [{ score: 'desc' }, { bedrijfsnaam: 'asc' }],
      include: { _count: { select: { contactmomenten: true } } },
    });

    const antwoord = prospects.map(({ _count, ...rest }) => ({
      ...rest,
      contactmomentenCount: _count.contactmomenten,
    }));

    return NextResponse.json(antwoord);
  } catch (error) {
    return foutAntwoord(error, 'Fout bij ophalen van prospects');
  }
}

// POST - Nieuwe prospect (alleen admin)
export async function POST(request: NextRequest) {
  try {
    const session = await haalSessie();
    const fout = toegangsFout(session, true);
    if (fout) return fout;

    const body = await request.json().catch(() => ({}));
    const resultaat = bouwProspectData(body as Record<string, unknown>, true);
    if ('fout' in resultaat) {
      return NextResponse.json({ error: resultaat.fout }, { status: 400 });
    }

    if (resultaat.data.status === 'KLANT') resultaat.data.klantSindsOp = new Date();

    const prospect = await prisma.prospect.create({
      data: resultaat.data as unknown as Prisma.ProspectCreateInput,
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CREATE_PROSPECT,
      details: { id: prospect.id, bedrijfsnaam: prospect.bedrijfsnaam, plaats: prospect.plaats },
      request,
    });

    return NextResponse.json({ ...prospect, contactmomentenCount: 0 }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return NextResponse.json(
        { error: 'Dit bedrijf staat al in de lijst met deze plaats' },
        { status: 409 }
      );
    }
    return foutAntwoord(error, 'Fout bij aanmaken van prospect');
  }
}
