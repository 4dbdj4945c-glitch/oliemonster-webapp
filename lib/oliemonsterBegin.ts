// Wat de oliemonsterpagina bij het openen meteen meekrijgt, op de server, in
// hetzelfde verzoek als de pagina zelf: de lijst, de kolommen, de objecten en
// de jaren. Zo hoeft het scherm na het laden niet nog vier verzoeken te doen
// voordat het iets toont. Alleen op de server (app/dashboard/oliemonsters/[jaar]).
//
// Precies dezelfde gegevens als de API-routes (GET /api/samples, /api/settings,
// /api/sample-objects?kort=1, /api/samples/jaren); de afscherming per klant en
// jaar geldt hier net zo (lib/afscherming.ts via haalMonsterLijst).

import { prisma } from './prisma';
import { haalMonsterJaren, haalMonsterLijst } from './monsterLijst';
import { isAlleenLezen } from './roles';
import type { Gebruiker } from './toegang';

export async function haalOliemonsterBegin(gebruiker: Gebruiker, jaar: number) {
  const kijker = isAlleenLezen(gebruiker.role);
  // Een kijker met een vast jaar krijgt geen jaarkeuze, en de objecten nooit.
  const magJaarKiezen = !(kijker && gebruiker.viewYear !== null);
  const [samples, kolommen, objecten, jaren] = await Promise.all([
    haalMonsterLijst(gebruiker, jaar, ''),
    prisma.settings.findUnique({ where: { key: 'columns' } }),
    kijker ? null : prisma.sampleObject.findMany({ orderBy: [{ name: 'asc' }], select: { id: true, name: true, objectType: true } }),
    magJaarKiezen ? haalMonsterJaren(gebruiker) : null,
  ]);
  let kolomLijst: string[] | null = null;
  try {
    const waarde = kolommen ? JSON.parse(kolommen.value) : null;
    if (Array.isArray(waarde)) kolomLijst = waarde;
  } catch {
    kolomLijst = null;
  }
  // Als JSON, precies zoals de API het geeft (datums als tekst).
  return JSON.parse(JSON.stringify({ samples, kolommen: kolomLijst, objecten, jaren })) as {
    samples: unknown[];
    kolommen: string[] | null;
    objecten: { id: number; name: string; objectType: string | null }[] | null;
    jaren: { jaar: number; totaal: number; genomen: number }[] | null;
  };
}

export type OliemonsterBegin = Awaited<ReturnType<typeof haalOliemonsterBegin>>;
