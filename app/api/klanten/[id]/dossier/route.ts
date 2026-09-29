import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { apiRoute, ApiFout, jaarSchema, leesId, leesQuery } from '@/lib/apiRoute';
import { haalDossier } from '@/lib/klantDossier';

// GET - Het klantdossier (alleen admin): objecten met installaties en per
// monster de momenten (genomen, niet bereikbaar, geannuleerd, open), eventueel
// van één jaar (?jaar=2026; zonder jaar alle jaren). Zie lib/klantDossier.ts.

const Query = z.object({ jaar: z.string().optional() });

export const GET = apiRoute(
  { rol: 'admin', module: 'klanten', fout: 'Fout bij ophalen van het dossier' },
  async (request, context) => {
    const id = await leesId(context, 'Onbekende klant');
    const { jaar } = leesQuery(request, Query);
    const klant = await prisma.klant.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!klant) throw new ApiFout(404, 'Klant niet gevonden');
    return NextResponse.json(await haalDossier(id, jaar ? jaarSchema.parse(jaar) : null));
  }
);
