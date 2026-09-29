// Zacht verwijderen van oliemonsters. Een verwijderd monster krijgt een
// deletedAt en deletedBy en blijft met pogingen, datums en foto's in de database
// staan. Het verdwijnt uit alles wat de portal laat zien of telt: de lijst, de
// tellingen, de planning, de objecten, de PDF, het dashboard, het overnemen naar
// een nieuw jaar en de O-nummercontrole. Een admin zet het terug via de
// prullenbak (GET /api/samples/verwijderd, POST /api/samples/[id]/herstellen).
//
// Zolang ./db-push-veilig-verwijderen.sh nog niet gedraaid is, bestaat de kolom
// deletedAt niet. Een where met deletedAt loopt dan stuk. Daarom vraagt elke
// query het filter hier op: met de kolom is dat { deletedAt: null }, zonder
// kolom een leeg filter (er kan dan ook nog niets verwijderd zijn).

import { prisma } from './prisma';
import { tabelOntbreekt } from './kolommen';

export const KOLOM_ONTBREEKT_VERWIJDEREN =
  'Verwijderen kan pas als de prullenbak in de database staat. Draai ./db-push-veilig-verwijderen.sh in de projectmap en probeer het opnieuw. Er is niets verwijderd.';

// Eén keer per serverinstantie vaststellen. "Bestaat" onthouden we voorgoed;
// "bestaat niet" maar een minuut, zodat de portal het na de db push vanzelf
// oppikt zonder nieuwe deploy.
let kolomBestaat: boolean | null = null;
let gecontroleerdOp = 0;

export async function verwijderKolomBestaat(): Promise<boolean> {
  if (kolomBestaat === true) return true;
  if (kolomBestaat === false && Date.now() - gecontroleerdOp < 60_000) return false;
  try {
    await prisma.oilSample.findFirst({ where: { deletedAt: null }, select: { id: true } });
    kolomBestaat = true;
  } catch (error) {
    if (!tabelOntbreekt(error)) throw error;
    kolomBestaat = false;
    gecontroleerdOp = Date.now();
  }
  return kolomBestaat;
}

/**
 * Het filter dat verwijderde monsters uitsluit. Zet het in elke where op
 * OilSample die over zichtbare monsters gaat: `where: { ...jaar, ...(await actiefFilter()) }`.
 */
export async function actiefFilter(): Promise<{ deletedAt?: null }> {
  return (await verwijderKolomBestaat()) ? { deletedAt: null } : {};
}
