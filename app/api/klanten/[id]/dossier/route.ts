import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { apiRoute, ApiFout, jaarSchema, leesId, leesQuery } from '@/lib/apiRoute';
import { haalDossier } from '@/lib/klantDossier';

// GET - Het klantdossier (alleen admin): objecten met installaties en per
// monster de momenten (genomen, niet bereikbaar, geannuleerd, open), eventueel
// van één jaar (?jaar=2026; zonder jaar alle jaren; ?jaar=nieuwste het jongste
// jaar met monsters, voor de eerste keer openen). Zie lib/klantDossier.ts.

const Query = z.object({ jaar: z.string().optional() });

export const GET = apiRoute(
  { rol: 'admin', module: 'klanten', fout: 'Fout bij ophalen van het dossier' },
  async (request, context) => {
    const id = await leesId(context, 'Onbekende klant');
    const { jaar } = leesQuery(request, Query);
    const gevraagd = jaar === 'nieuwste' ? 'nieuwste' : jaar ? jaarSchema.parse(jaar) : null;
    // Het dossier begint alvast; het telt pas als de klant echt bestaat.
    const dossier = haalDossier(id, gevraagd);
    dossier.catch(() => {});
    const klant = await prisma.klant.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!klant) throw new ApiFout(404, 'Klant niet gevonden');
    return NextResponse.json(await dossier);
  }
);
