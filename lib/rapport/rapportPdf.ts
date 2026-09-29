// Het rapport van een oliemonsteropdracht als PDF, gemaakt op de SERVER
// (GET /api/rapport). Zo kan ook een kijker hem downloaden, zonder dat zijn
// browser de foto's zelf hoeft op te halen.
//
// Inhoud, in huisstijl v2.0 (navy #0C1B33, oranje #F97316, Inter):
// 1. Kop: logo van de klant, "uitgevoerd door" It's Done Services, navy band
//    met titel en de stand van vandaag.
// 2. Voortgang: x van y genomen, balk en legenda (neutrale kleuren, geen rood).
// 3. Tabel per object: o-nummer, omschrijving, status, datum en reden.
// 4. Fotobijlage: per genomen monster de foto van het onderdeel en van het
//    potje, verkleind (sharp, 520 px, JPEG).
// Onderaan elke pagina de contactgegevens en het paginanummer.
//
// jsPDF + jspdf-autotable (stonden er al voor de PDF in de browser), met de
// Inter-bestanden uit lib/rapport/fonts (SIL Open Font License).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import sharp from 'sharp';
import { haalFoto } from '../fotoLaden';
import type { Opdracht, OpdrachtMonster } from '../klantOpdracht';
import { KLANT_STATUS_KLEUR, KLANT_STATUS_LABELS, KLANT_STATUS_LEGENDA, KLANT_STATUSSEN, teNemen } from '../klantStatus';

type RGB = [number, number, number];
const NAVY: RGB = [12, 27, 51];
const ORANJE: RGB = [249, 115, 22];
const GRIJS_50: RGB = [248, 250, 252];
const GRIJS_200: RGB = [226, 232, 240];
const GRIJS_500: RGB = [100, 116, 139];
const GRIJS_700: RGB = [51, 65, 85];
const BAND_TEKST: RGB = [184, 196, 214];

/** Tekstkleur per status in de tabel: donkere varianten die 4,5:1 halen op wit. */
const STATUS_TEKST: Record<OpdrachtMonster['status'], RGB> = {
  genomen: [21, 128, 61],
  gepland: [29, 78, 216],
  'niet-bereikbaar': [180, 83, 9],
  geannuleerd: GRIJS_500,
  'in-te-plannen': GRIJS_500,
};

const MARGE = 16;
const FOTO_MAX_ZIJDE = 520;

export const CONTACT = {
  naam: "It's Done Services",
  telefoon: '085 060 4300',
  email: 'info@itsdoneservices.nl',
};

// ------------------------------------------------------------------
// Datums
// ------------------------------------------------------------------

const NL = { timeZone: 'Europe/Amsterdam' } as const;
function datumKort(d: Date | null): string {
  return d ? d.toLocaleDateString('nl-NL', { ...NL, day: 'numeric', month: 'numeric', year: 'numeric' }) : '-';
}
function datumLang(d: Date): string {
  return d.toLocaleDateString('nl-NL', { ...NL, day: 'numeric', month: 'long', year: 'numeric' });
}

// ------------------------------------------------------------------
// Bestanden: lettertypen, logo's, foto's
// ------------------------------------------------------------------

const FONT_MAP = path.join(process.cwd(), 'lib', 'rapport', 'fonts');
let fontCache: Record<string, string> | null = null;

async function laadFonts(): Promise<Record<string, string>> {
  if (fontCache) return fontCache;
  const namen = ['Inter-Regular.ttf', 'Inter-Bold.ttf', 'Inter-ExtraBold.ttf'];
  const inhoud = await Promise.all(namen.map((n) => readFile(path.join(FONT_MAP, n))));
  fontCache = Object.fromEntries(namen.map((n, i) => [n, inhoud[i].toString('base64')]));
  return fontCache;
}

function zetFonts(doc: jsPDF, fonts: Record<string, string>) {
  for (const [bestand, stijl] of [
    ['Inter-Regular.ttf', 'normal'],
    ['Inter-Bold.ttf', 'bold'],
    ['Inter-ExtraBold.ttf', 'extrabold'],
  ] as const) {
    doc.addFileToVFS(bestand, fonts[bestand]);
    doc.addFont(bestand, 'Inter', stijl);
  }
  doc.setFont('Inter', 'normal');
}

interface Beeld {
  data: Uint8Array;
  soort: 'PNG' | 'JPEG';
  ratio: number;
}

/** Een logo als PNG (met doorzichtigheid), maximaal 800 px breed. */
async function laadLogo(url: string | null | undefined, origin?: string): Promise<Beeld | null> {
  const bestand = await haalFoto(url, origin);
  if (!bestand) return null;
  try {
    const { data, info } = await sharp(bestand.bytes).resize({ width: 800, withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    return { data: new Uint8Array(data), soort: 'PNG', ratio: info.width / info.height };
  } catch {
    return null;
  }
}

/** Een foto verkleind tot een kleine JPEG, rechtop gedraaid volgens de EXIF. */
async function laadFotoKlein(url: string | null, origin?: string): Promise<Beeld | null> {
  if (!url) return null;
  const bestand = await haalFoto(url, origin);
  if (!bestand) return null;
  try {
    const { data, info } = await sharp(bestand.bytes)
      .rotate()
      .resize({ width: FOTO_MAX_ZIJDE, height: FOTO_MAX_ZIJDE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 68 })
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8Array(data), soort: 'JPEG', ratio: info.width / info.height };
  } catch {
    return null;
  }
}

/** Een paar tegelijk, zodat de server niet honderd verzoeken tegelijk doet. */
async function perStuk<T, U>(lijst: T[], tegelijk: number, werk: (x: T) => Promise<U>): Promise<U[]> {
  const uit: U[] = new Array(lijst.length);
  let volgende = 0;
  const werker = async () => {
    while (volgende < lijst.length) {
      const i = volgende++;
      uit[i] = await werk(lijst[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(tegelijk, lijst.length) }, werker));
  return uit;
}

/** Een beeld passend in een vak, gecentreerd. */
function tekenBeeld(doc: jsPDF, beeld: Beeld, x: number, y: number, b: number, h: number) {
  let w = b;
  let hh = b / beeld.ratio;
  if (hh > h) {
    hh = h;
    w = h * beeld.ratio;
  }
  doc.addImage(beeld.data, beeld.soort, x + (b - w) / 2, y + (h - hh) / 2, w, hh, undefined, 'FAST');
}

// ------------------------------------------------------------------
// Het rapport
// ------------------------------------------------------------------

export interface RapportOpties {
  /** De origin van de portal, voor logo's en foto's in public/. */
  origin?: string;
  nu?: Date;
  /** Fotobijlage meenemen (standaard ja). */
  metFotos?: boolean;
}

export async function maakRapportPdf(opdracht: Opdracht, opties: RapportOpties = {}): Promise<Buffer> {
  const nu = opties.nu ?? new Date();
  const metFotos = opties.metFotos ?? true;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  zetFonts(doc, await laadFonts());
  doc.setProperties({
    title: `Oliemonsters ${opdracht.jaar} ${opdracht.klant.naam}`,
    subject: `Rapport oliemonsters ${opdracht.jaar}`,
    author: CONTACT.naam,
    creator: 'IDS Portal',
  });

  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const [klantLogo, idsLogo] = await Promise.all([
    laadLogo(opdracht.klant.logoUrl, opties.origin),
    laadLogo('/logo-navy.png', opties.origin),
  ]);

  // ---------- Kop ----------
  let y = 12;
  if (klantLogo) {
    tekenBeeld(doc, klantLogo, MARGE, y, Math.min(48, 11 * klantLogo.ratio), 11);
  } else {
    doc.setFont('Inter', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...NAVY);
    doc.text(opdracht.klant.naam, MARGE, y + 7.5);
  }
  if (idsLogo) {
    const lb = 38;
    const lh = lb / idsLogo.ratio;
    tekenBeeld(doc, idsLogo, W - MARGE - lb, y + (11 - lh) / 2, lb, lh);
    doc.setFont('Inter', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIJS_500);
    doc.text('uitgevoerd door', W - MARGE - lb - 2.5, y + 6.8, { align: 'right' });
  }
  y = 28;
  doc.setFillColor(...NAVY);
  doc.rect(0, y, W, 30, 'F');
  doc.setFont('Inter', 'extrabold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text(`Oliemonsters ${opdracht.jaar}`, MARGE, y + 13);
  doc.setFont('Inter', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...BAND_TEKST);
  doc.text(`${opdracht.klant.naam}, stand van ${datumLang(nu)}`, MARGE, y + 21);
  // Oranje streep: het ene accent van de pagina.
  doc.setFillColor(...ORANJE);
  doc.rect(0, y + 30, W, 1.2, 'F');

  // ---------- Voortgang ----------
  y = 72;
  const t = opdracht.telling;
  const totaal = teNemen(t);
  doc.setFont('Inter', 'extrabold');
  doc.setFontSize(26);
  doc.setTextColor(...NAVY);
  doc.text(String(t.genomen), MARGE, y);
  const breedteGetal = doc.getTextWidth(String(t.genomen));
  doc.setFont('Inter', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(...GRIJS_500);
  doc.text(`van ${totaal} ${totaal === 1 ? 'monster' : 'monsters'} genomen`, MARGE + breedteGetal + 2.5, y);

  y += 6;
  const balkB = W - 2 * MARGE;
  const alle = KLANT_STATUSSEN.reduce((som, s) => som + t[s], 0);
  doc.setFillColor(...GRIJS_200);
  doc.roundedRect(MARGE, y, balkB, 3.2, 1.6, 1.6, 'F');
  let x = MARGE;
  for (const s of KLANT_STATUSSEN) {
    if (!alle || !t[s] || s === 'in-te-plannen') {
      x += alle ? (t[s] / alle) * balkB : 0;
      continue;
    }
    const b = (t[s] / alle) * balkB;
    doc.setFillColor(...KLANT_STATUS_KLEUR[s]);
    doc.rect(x, y, b, 3.2, 'F');
    x += b;
  }
  y += 9;
  doc.setFontSize(9);
  x = MARGE;
  for (const s of KLANT_STATUSSEN) {
    if (!t[s]) continue;
    const tekst = `${t[s]} ${KLANT_STATUS_LEGENDA[s]}`;
    const b = doc.getTextWidth(tekst) + 9;
    if (x + b > W - MARGE) {
      x = MARGE;
      y += 5.5;
    }
    doc.setFillColor(...KLANT_STATUS_KLEUR[s]);
    if (s === 'in-te-plannen') {
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(x, y - 2.6, 3, 3, 0.6, 0.6, 'FD');
    } else {
      doc.roundedRect(x, y - 2.6, 3, 3, 0.6, 0.6, 'F');
    }
    doc.setTextColor(...GRIJS_700);
    doc.text(tekst, x + 4.5, y);
    x += b;
  }
  if (t.geannuleerd > 0) {
    y += 5.5;
    doc.setTextColor(...GRIJS_500);
    doc.text('Geannuleerde monsters tellen niet mee in het aantal dat genomen moet worden.', MARGE, y);
  }

  // ---------- Tabel per object ----------
  y += 10;
  doc.setFont('Inter', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text('Per object', MARGE, y);
  y += 3;

  type Rij = (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[];
  const body: Rij[] = [];
  const statusVanRij: (OpdrachtMonster['status'] | null)[] = [];
  for (const o of opdracht.objecten) {
    const monsters = opdracht.monsters.filter((m) => (m.objectId ?? null) === o.id);
    const ot = teNemen(o.telling);
    body.push([
      {
        content: `${o.naam}   ${o.telling.genomen} van ${ot} genomen`,
        colSpan: 5,
        styles: { fillColor: GRIJS_50, fontStyle: 'bold', textColor: NAVY },
      },
    ]);
    statusVanRij.push(null);
    for (const m of monsters) {
      body.push([
        m.oNumber,
        [m.installatieNaam, m.description].filter((w, i, l) => w && l.indexOf(w) === i).join(', '),
        KLANT_STATUS_LABELS[m.status],
        datumKort(m.datum),
        m.reden ?? '',
      ]);
      statusVanRij.push(m.status);
    }
  }
  if (body.length === 0) {
    body.push([{ content: 'Er staan nog geen monsters in deze opdracht.', colSpan: 5 }]);
    statusVanRij.push(null);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: MARGE, right: MARGE, top: 16, bottom: 18 },
    head: [['O-nummer', 'Omschrijving', 'Status', 'Datum', 'Reden of toelichting']],
    body,
    theme: 'plain',
    styles: { font: 'Inter', fontSize: 8.5, textColor: NAVY, cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 }, lineColor: GRIJS_200, lineWidth: { bottom: 0.2 } },
    headStyles: { font: 'Inter', fontStyle: 'bold', fontSize: 7.5, textColor: GRIJS_500, fillColor: [255, 255, 255], lineWidth: { bottom: 0.4 }, lineColor: NAVY },
    columnStyles: {
      0: { cellWidth: 24, fontStyle: 'bold' },
      1: { cellWidth: 54 },
      2: { cellWidth: 32 },
      3: { cellWidth: 20 },
      4: { cellWidth: 'auto' },
    },
    didParseCell: (d) => {
      if (d.section !== 'body' || d.column.index !== 2) return;
      const s = statusVanRij[d.row.index];
      if (s) {
        d.cell.styles.textColor = STATUS_TEKST[s];
        d.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // ---------- Fotobijlage ----------
  const metFoto = metFotos
    ? opdracht.monsters.filter((m) => m.status === 'genomen' && (m.photoUrl || m.partPhotoUrl))
    : [];
  if (metFoto.length > 0) {
    const beelden = await perStuk(metFoto, 5, async (m) => ({
      m,
      onderdeel: await laadFotoKlein(m.partPhotoUrl, opties.origin),
      potje: await laadFotoKlein(m.photoUrl, opties.origin),
    }));
    doc.addPage();
    y = 20;
    doc.setFont('Inter', 'extrabold');
    doc.setFontSize(16);
    doc.setTextColor(...NAVY);
    doc.text('Fotobijlage', MARGE, y);
    y += 6;
    doc.setFont('Inter', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRIJS_500);
    doc.text("Per genomen monster links het onderdeel, rechts het monsterpotje. De foto's zijn verkleind.", MARGE, y);
    y += 8;

    const kolomB = (W - 2 * MARGE - 8) / 2;
    const fotoB = (kolomB - 3) / 2;
    const fotoH = fotoB * 0.75;
    const vakH = fotoH + 12;
    let kolom = 0;
    for (const { m, onderdeel, potje } of beelden) {
      if (y + vakH > H - 20) {
        doc.addPage();
        y = 20;
        kolom = 0;
      }
      const x0 = MARGE + kolom * (kolomB + 8);
      doc.setFont('Inter', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...NAVY);
      doc.text(m.oNumber, x0, y + 3);
      const nrB = doc.getTextWidth(m.oNumber);
      doc.setFont('Inter', 'normal');
      doc.setTextColor(...GRIJS_500);
      const bij = `${m.installatieNaam ?? m.objectNaam ?? m.location}, ${datumKort(m.datum)}`;
      doc.text(doc.splitTextToSize(bij, kolomB - nrB - 2)[0] ?? '', x0 + nrB + 2, y + 3);
      for (const [i, beeld] of [onderdeel, potje].entries()) {
        const fx = x0 + i * (fotoB + 3);
        const fy = y + 5.5;
        doc.setFillColor(...GRIJS_50);
        doc.setDrawColor(...GRIJS_200);
        doc.roundedRect(fx, fy, fotoB, fotoH, 1.2, 1.2, 'FD');
        if (beeld) {
          tekenBeeld(doc, beeld, fx + 0.6, fy + 0.6, fotoB - 1.2, fotoH - 1.2);
        } else {
          doc.setFontSize(7.5);
          doc.setTextColor(...GRIJS_500);
          doc.text(i === 0 ? 'Geen foto onderdeel' : 'Geen foto potje', fx + fotoB / 2, fy + fotoH / 2, { align: 'center' });
        }
      }
      kolom += 1;
      if (kolom === 2) {
        kolom = 0;
        y += vakH;
      }
    }
  }

  // ---------- Voet op elke pagina ----------
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setDrawColor(...GRIJS_200);
    doc.setLineWidth(0.2);
    doc.line(MARGE, H - 12, W - MARGE, H - 12);
    doc.setFont('Inter', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIJS_500);
    doc.text(`${CONTACT.naam}   ${CONTACT.telefoon}   ${CONTACT.email}`, MARGE, H - 7.5);
    doc.text(`Pagina ${p} van ${paginas}`, W - MARGE, H - 7.5, { align: 'right' });
  }

  return Buffer.from(doc.output('arraybuffer'));
}

/** Bestandsnaam: oliemonsters-2026-mourik-infra-b-v.pdf */
export function rapportNaam(klantNaam: string, jaar: number): string {
  const schoon = klantNaam
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `oliemonsters-${jaar}-${schoon || 'klant'}.pdf`;
}
