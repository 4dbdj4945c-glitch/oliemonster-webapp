// Zacht verwijderen van oliemonsters. Een verwijderd monster krijgt een
// deletedAt en deletedBy en blijft met pogingen, datums en foto's in de database
// staan. Het verdwijnt uit alles wat de portal laat zien of telt: de lijst, de
// tellingen, de planning, de objecten, de PDF, het dashboard, het overnemen naar
// een nieuw jaar en de O-nummercontrole. Een admin zet het terug via de
// prullenbak (GET /api/samples/verwijderd, POST /api/samples/[id]/herstellen).
//
// De kolom deletedAt staat sinds 0_basis in elke database (de migraties zijn
// verplicht, zie README), dus er hoeft niets meer gecontroleerd te worden: het
// filter is altijd { deletedAt: null }. Vroeger kostte de controle een extra
// query per serverinstantie. De functies blijven async, zodat de aanroepen
// gelijk blijven.

export const KOLOM_ONTBREEKT_VERWIJDEREN =
  'Verwijderen kan pas als de prullenbak in de database staat. Draai ./db-bijwerken.sh in de projectmap en probeer het opnieuw. Er is niets verwijderd.';

export async function verwijderKolomBestaat(): Promise<boolean> {
  return true;
}

/**
 * Het filter dat verwijderde monsters uitsluit. Zet het in elke where op
 * OilSample die over zichtbare monsters gaat: `where: { ...jaar, ...(await actiefFilter()) }`.
 */
export async function actiefFilter(): Promise<{ deletedAt?: null }> {
  return { deletedAt: null };
}
