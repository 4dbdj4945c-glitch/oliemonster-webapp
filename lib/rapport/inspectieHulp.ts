// Gedeeld door het inspectierapport (lib/rapport/inspectieRapportPdf.ts) en het
// verzamelrapport (lib/rapport/verzamelrapportPdf.ts): kleuren per oordeel,
// datums en het tekenen van een foto in een vak. Alleen op de server.

import type { jsPDF } from 'jspdf';
import { nlDag } from '../klantOpdracht';
import { checklistVolledig, sjabloonVan } from '../inspecties/sjablonen';
import { GRIJS_200, GRIJS_50, GRIJS_500, laadFotoKlein, perStuk, tekenBeeld, type Beeld, type RGB } from './rapportPdf';

export const AMBER_TEKST: RGB = [180, 83, 9];
export const AMBER_VLAK: RGB = [255, 247, 237];
export const AMBER_RAND: RGB = [253, 186, 116];
export const GROEN_TEKST: RGB = [21, 128, 61];
export const ROOD_TEKST: RGB = [185, 28, 28];
export const BLAUW: RGB = [29, 78, 216];

/** Tekstkleur per oordeel in de tabel (haalt 4,5:1 op wit). */
export const OORDEEL_TEKST: Record<string, RGB> = {
  'in-orde': GROEN_TEKST,
  'actie-nodig': AMBER_TEKST,
  'buiten-gebruik': ROOD_TEKST,
  'niet-gecontroleerd': GRIJS_500,
  hoog: AMBER_TEKST,
  middel: BLAUW,
  laag: GRIJS_500,
  gemarkeerd: GROEN_TEKST,
  'niet-bereikbaar': AMBER_TEKST,
  'niet-aangetroffen': GRIJS_500,
};

const NL = { timeZone: 'Europe/Amsterdam' } as const;

/** "3 oktober 2026" */
export function dagTekst(dag: string | null): string {
  if (!dag) return '-';
  return new Date(`${dag}T12:00:00Z`).toLocaleDateString('nl-NL', { ...NL, day: 'numeric', month: 'long', year: 'numeric' });
}

/** "3-10-2026" */
export function dagKort(d: Date | string | null): string {
  if (!d) return '-';
  const dag = typeof d === 'string' ? d : nlDag(d);
  return new Date(`${dag}T12:00:00Z`).toLocaleDateString('nl-NL', { ...NL, day: 'numeric', month: 'numeric', year: 'numeric' });
}

/** Voor welke arbeidsmiddelen geldt de verklaring (art. 7.4a)? Alleen met een uitslag en een volledige checklist. */
export function verklaringGeldtVoor<T extends { oordeel: string | null; waarden: unknown }>(rij: { sjabloon: string; items: T[] }): T[] {
  const s = sjabloonVan(rij.sjabloon);
  return rij.items.filter((i) => !!i.oordeel && i.oordeel !== 'niet-gecontroleerd' && checklistVolledig(s, i.waarden));
}

/** Een grijs vak met de foto erin, passend en gecentreerd. Zonder beeld: een melding in het vak. */
export function tekenFotoVak(doc: jsPDF, beeld: Beeld | null, x: number, y: number, b: number, h: number) {
  doc.setFillColor(...GRIJS_50);
  doc.setDrawColor(...GRIJS_200);
  doc.roundedRect(x, y, b, h, 1.2, 1.2, 'FD');
  if (beeld) {
    tekenBeeld(doc, beeld, x + 0.6, y + 0.6, b - 1.2, h - 1.2);
  } else {
    doc.setFont('Inter', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIJS_500);
    doc.text('Foto niet beschikbaar', x + b / 2, y + h / 2, { align: 'center' });
  }
}

/**
 * Tekst passend in een breedte, hoogstens `regels` regels. Past het niet, dan
 * eindigt de laatste regel op "...". Lettertype en grootte moeten al gezet zijn.
 */
export function ingekort(doc: jsPDF, tekst: string, breedte: number, regels = 1): string[] {
  const alle = doc.splitTextToSize(tekst, breedte) as string[];
  if (alle.length <= regels) return alle;
  const uit = alle.slice(0, regels);
  let laatste = uit[regels - 1];
  while (laatste.length > 1 && doc.getTextWidth(`${laatste}...`) > breedte) laatste = laatste.slice(0, -1);
  uit[regels - 1] = `${laatste.trimEnd().replace(/[,.;:]$/, '')}...`;
  return uit;
}

/** Alle foto's van een lijst bevindingen verkleind laden, acht tegelijk (zoals het oliemonsterrapport). Sleutel: id van de foto. */
export async function laadInspectieFotos(
  items: { fotos: { id: number; url: string }[] }[],
  origin?: string
): Promise<Map<number, Beeld | null>> {
  const fotos = items.flatMap((i) => i.fotos);
  const beelden = await perStuk(fotos, 8, async (f) => [f.id, await laadFotoKlein(f.url, origin)] as const);
  return new Map(beelden);
}
