// Een nieuw documentnummer uitdelen (lib/nummering.ts). Het volgende
// volgnummer is het hoogste van dat jaar plus 1, ook als die rij weggehaald is,
// zodat een nummer nooit twee keer voorkomt. Twee keer tegelijk aanmaken geeft
// op de unieke index een botsing (P2002); dan opnieuw met het volgende nummer.
// Alleen op de server.

import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

type Soort = 'inspectie' | 'dagrapport';

async function hoogste(soort: Soort, jaar: number): Promise<number> {
  const where = { nummerJaar: jaar };
  const r = soort === 'inspectie'
    ? await prisma.inspectie.aggregate({ where, _max: { volgnummer: true } })
    : await prisma.dagrapport.aggregate({ where, _max: { volgnummer: true } });
  return r._max.volgnummer ?? 0;
}

function isNummerBotsing(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return false;
  const doel = (e.meta as { target?: unknown } | undefined)?.target;
  const velden = Array.isArray(doel) ? doel.map(String) : typeof doel === 'string' ? [doel] : [];
  return velden.length === 0 || velden.some((v) => v.includes('volgnummer'));
}

/**
 * Maakt een rij aan met het volgende nummer van het jaar van `datum`. `maak`
 * krijgt { nummerJaar, volgnummer } en doet de create zelf.
 */
export async function metVolgnummer<T>(soort: Soort, datum: Date, maak: (nummer: { nummerJaar: number; volgnummer: number }) => Promise<T>): Promise<T> {
  const nummerJaar = datum.getUTCFullYear();
  for (let poging = 0; ; poging++) {
    const volgnummer = (await hoogste(soort, nummerJaar)) + 1;
    try {
      return await maak({ nummerJaar, volgnummer });
    } catch (e) {
      if (poging >= 4 || !isNummerBotsing(e)) throw e;
    }
  }
}
