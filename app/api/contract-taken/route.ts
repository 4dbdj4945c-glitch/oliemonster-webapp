import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiRoute, leesQuery } from '@/lib/apiRoute';
import { haalTaken } from '@/lib/contractenServer';
import { vraagtAandacht } from '@/lib/contracten';

/*
  GET /api/contract-taken - alle actieve taken met status (beheerder en gebruiker),
  voor Vandaag en de planning. ?aandacht=1: alleen verlopen en binnenkort (30 dagen).
  ?klantId=: alleen van die klant.
*/

const Query = z.object({
  aandacht: z.enum(['0', '1']).optional(),
  klantId: z.coerce.number().int().positive().optional(),
});

export const GET = apiRoute({ rol: 'user', module: 'contracten', fout: 'Fout bij ophalen van de taken' }, async (request) => {
  const q = leesQuery(request, Query);
  const taken = await haalTaken(q.klantId ? { contract: { klantId: q.klantId, deletedAt: null } } : {});
  return NextResponse.json(q.aandacht === '1' ? taken.filter((t) => vraagtAandacht(t.status)) : taken);
});
