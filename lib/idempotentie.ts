// Eén keer verwerken, ook als hetzelfde verzoek twee keer binnenkomt. Voor de
// offline wachtrij (lib/wachtrij.ts): een invoer (Monster nemen, een lek of
// arbeidsmiddel) krijgt in de browser een eigen sleutel en gaat met de header
// Idempotentie-Sleutel mee. Valt de verbinding weg net nadat de server het
// verzoek verwerkte, dan verstuurt de wachtrij het later opnieuw met dezelfde
// sleutel en krijgt hij hetzelfde antwoord terug, zonder dat er iets dubbel
// gebeurt (geen tweede poging, geen tweede lek).
//
// Hoe: eerst een regel in Verzending met de sleutel als primaire sleutel. Lukt
// dat niet omdat hij al bestaat, dan is het een herhaling: het bewaarde
// antwoord terug (header Idempotentie-Herhaling: 1), of een 409 als het eerste
// verzoek nog bezig is. Mislukt het werk zelf (geen 2xx of een fout), dan gaat
// de regel weer weg, zodat een nieuwe poging gewoon kan. Zonder header werkt de
// route zoals altijd. Regels ouder dan dertig dagen worden opgeruimd.

import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { ApiFout } from './apiRoute';

export const IDEMPOTENTIE_HEADER = 'Idempotentie-Sleutel';
export const HERHALING_HEADER = 'Idempotentie-Herhaling';
const BEWAAR_DAGEN = 30;
/** Staat een eerste verzoek langer dan dit op bezig, dan is het gestrand en mag een nieuwe poging. */
const GESTRAND_MS = 5 * 60 * 1000;

function isUniek(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

export async function eenmalig(
  request: Request,
  wie: { userId: number },
  route: string,
  werk: () => Promise<Response>
): Promise<Response> {
  const sleutel = request.headers.get(IDEMPOTENTIE_HEADER);
  if (sleutel === null) return werk();
  if (!/^[A-Za-z0-9-]{8,100}$/.test(sleutel)) throw new ApiFout(400, 'Ongeldige idempotentiesleutel');

  const drempel = new Date(Date.now() - BEWAAR_DAGEN * 86400000);
  await prisma.verzending.deleteMany({ where: { createdAt: { lt: drempel } } });

  try {
    await prisma.verzending.create({ data: { sleutel, userId: wie.userId, route } });
  } catch (e) {
    if (!isUniek(e)) throw e;
    const bestaand = await prisma.verzending.findUnique({ where: { sleutel } });
    if (!bestaand) return eenmalig(request, wie, route, werk); // net opgeruimd: opnieuw
    if (bestaand.userId !== wie.userId || bestaand.route !== route) {
      throw new ApiFout(409, 'Deze invoer is al eens met een andere gebruiker of route verstuurd.');
    }
    if (bestaand.klaarOp) {
      return NextResponse.json(bestaand.antwoord, { status: bestaand.status ?? 200, headers: { [HERHALING_HEADER]: '1' } });
    }
    if (Date.now() - bestaand.createdAt.getTime() < GESTRAND_MS) {
      throw new ApiFout(409, 'Deze invoer wordt al verwerkt. Probeer het zo nog eens.', { bezig: true });
    }
    // Gestrand (de server stopte halverwege): opnieuw proberen. Maar alleen één
    // herhaling mag hem overnemen: de update lukt alleen als de regel nog precies
    // zo staat. Komen er twee tegelijk, dan krijgt de tweede een 409.
    const { count } = await prisma.verzending.updateMany({
      where: { sleutel, klaarOp: null, createdAt: bestaand.createdAt },
      data: { createdAt: new Date() },
    });
    if (count !== 1) throw new ApiFout(409, 'Deze invoer wordt al verwerkt. Probeer het zo nog eens.', { bezig: true });
  }

  let antwoord: Response;
  try {
    antwoord = await werk();
  } catch (e) {
    await prisma.verzending.deleteMany({ where: { sleutel, klaarOp: null } });
    throw e;
  }
  if (!antwoord.ok) {
    await prisma.verzending.deleteMany({ where: { sleutel, klaarOp: null } });
    return antwoord;
  }
  const inhoud = await antwoord.clone().json().catch(() => null);
  await prisma.verzending.update({
    where: { sleutel },
    data: { status: antwoord.status, antwoord: inhoud === null ? Prisma.JsonNull : (inhoud as Prisma.InputJsonValue), klaarOp: new Date() },
  });
  return antwoord;
}
