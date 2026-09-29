// Herkennen dat een tabel of kolom nog niet in de database staat, en daar een
// nette 503 van maken in plaats van een 500 met een Prisma-fout. Zo blijft de
// portal bruikbaar tussen het uitrollen van de code en het draaien van
// `prisma db push`. Dit patroon kwam uit lib/prospectApi.ts en staat nu apart,
// omdat inmiddels elke module het gebruikt.

import { NextResponse } from 'next/server';

/** Herkent de Prisma-fout die je krijgt als de tabel of kolom nog niet bestaat. */
export function tabelOntbreekt(error: unknown): boolean {
  const e = error as { code?: string; message?: string };
  if (e?.code === 'P2021' || e?.code === 'P2022') return true;
  return (
    typeof e?.message === 'string' &&
    /does not exist in the current database|relation ".*" does not exist|column .* does not exist/i.test(e.message)
  );
}

/** Standaard foutantwoord: 503 met uitleg als de tabel of kolom ontbreekt, anders 500. */
export function maakFoutAntwoord(error: unknown, melding: string, ontbreekt: string): NextResponse {
  if (tabelOntbreekt(error)) {
    return NextResponse.json({ error: ontbreekt, tabelOntbreekt: true }, { status: 503 });
  }
  console.error(melding, error);
  return NextResponse.json({ error: melding }, { status: 500 });
}

/** De melding zolang de kolommen van wensenronde 2 nog niet in de database staan. */
export const KOLOM_ONTBREEKT_WENSEN2 =
  'De nieuwe kolommen voor de tweede foto, de status Niet bereikbaar en het kijkjaar staan nog niet in de database. Draai ./db-push-wensen2.sh in de projectmap en ververs deze pagina.';

/** Standaard foutantwoord voor de routes van wensenronde 2. */
export function foutAntwoordWensen2(error: unknown, melding: string): NextResponse {
  return maakFoutAntwoord(error, melding, KOLOM_ONTBREEKT_WENSEN2);
}
