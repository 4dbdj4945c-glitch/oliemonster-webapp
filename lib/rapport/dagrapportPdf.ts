// Het dagrapport als PDF, op de SERVER gemaakt (GET /api/dagrapporten/[id]/pdf),
// met dezelfde kop en voet als het oliemonsterrapport en het inspectierapport
// (lib/rapport/rapportPdf.ts): jsPDF met Inter, foto's verkleind met sharp,
// huisstijl v2.0.
//
// Inhoud: kop met de logo's en een navy band, de gegevens van het bezoek,
// werkzaamheden, bevindingen, de foto's met bijschrift en onderaan het vak
// Akkoord klant met de handtekening, de naam en het tijdstip. Geen bedragen:
// dit is bewijs van het bezoek, geen factuur.

import { jsPDF } from 'jspdf';
import sharp from 'sharp';
import type { DagrapportRij } from '../dagrapporten';
import { dagrapportNummer } from '../dagrapporten';
import { nlDag } from '../klantOpdracht';
import {
  CONTACT,
  GRIJS_200,
  GRIJS_50,
  GRIJS_500,
  GRIJS_700,
  MARGE,
  NAVY,
  laadFonts,
  laadFotoKlein,
  laadLogo,
  perStuk,
  schoneNaam,
  tekenBeeld,
  tekenKop,
  tekenVoet,
  zetFonts,
  type Beeld,
  type RGB,
} from './rapportPdf';

const NL = { timeZone: 'Europe/Amsterdam' } as const;

function dagTekst(dag: string): string {
  return new Date(`${dag}T12:00:00Z`).toLocaleDateString('nl-NL', { ...NL, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** 150 minuten als "2,5 uur", 45 als "45 minuten". */
export function urenTekst(minuten: number | null): string {
  if (minuten === null || minuten === undefined) return '-';
  if (minuten < 60) return `${minuten} minuten`;
  const uren = Math.round((minuten / 60) * 100) / 100;
  return `${uren.toLocaleString('nl-NL')} uur`;
}

async function laadHandtekening(dataUrl: string | null): Promise<Beeld | null> {
  if (!dataUrl?.startsWith('data:image/png;base64,')) return null;
  try {
    const bytes = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
    // Op wit, zodat een doorzichtige tekening ook in elke PDF-lezer goed staat.
    const { data, info } = await sharp(bytes).flatten({ background: '#ffffff' }).png().toBuffer({ resolveWithObject: true });
    return { data: new Uint8Array(data), soort: 'PNG', ratio: info.width / info.height };
  } catch {
    return null;
  }
}

export async function maakDagrapportPdf(rij: DagrapportRij, opties: { origin?: string } = {}): Promise<Buffer> {
  const nummer = dagrapportNummer(rij.id);
  const datum = nlDag(rij.datum);
  const concept = rij.status !== 'getekend';

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  zetFonts(doc, await laadFonts());
  doc.setProperties({ title: `Dagrapport ${rij.klant.naam} ${datum}`, subject: nummer, author: CONTACT.naam, creator: 'IDS Portal' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const breed = W - 2 * MARGE;

  const [klantLogo, idsLogo, handtekening] = await Promise.all([
    laadLogo(rij.klant.logoUrl, opties.origin),
    laadLogo('/logo-navy.png', opties.origin),
    laadHandtekening(rij.handtekening),
  ]);
  tekenKop(doc, {
    klantLogo,
    idsLogo,
    klantNaam: rij.klant.naam,
    titel: 'Dagrapport',
    onder: [rij.klant.naam, rij.object?.name, dagTekst(datum)].filter(Boolean).join(', ') + (concept ? '. Concept, nog niet getekend' : ''),
  });

  let y = 68;
  const nieuwePaginaAls = (nodig: number) => {
    if (y + nodig > H - 20) {
      doc.addPage();
      y = 20;
    }
  };

  // ---------- Gegevens ----------
  const gegevens: [string, string][] = [
    ['Klant', [rij.klant.naam, rij.klant.plaats].filter(Boolean).join(', ')],
    ['Locatie', rij.object ? [rij.object.name, rij.object.address].filter(Boolean).join(', ') : '-'],
    ['Datum bezoek', dagTekst(datum)],
    ['Uitgevoerd door', `${rij.uitvoerder}, ${CONTACT.naam}`],
    ['Gewerkte tijd', urenTekst(rij.minuten)],
    ['Nummer', nummer],
  ];
  const kolomB = breed / 2;
  doc.setFontSize(8.5);
  gegevens.forEach(([label, waarde], i) => {
    const x = MARGE + (i % 2) * kolomB;
    const yy = y + Math.floor(i / 2) * 10;
    doc.setFont('Inter', 'normal');
    doc.setTextColor(...GRIJS_500);
    doc.text(label, x, yy);
    doc.setFont('Inter', 'bold');
    doc.setTextColor(...NAVY);
    doc.text(doc.splitTextToSize(waarde, kolomB - 4)[0] ?? '', x, yy + 4.5);
  });
  y += Math.ceil(gegevens.length / 2) * 10 + 4;

  const kop = (tekst: string) => {
    nieuwePaginaAls(20);
    doc.setFont('Inter', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...NAVY);
    doc.text(tekst, MARGE, y);
    y += 3;
  };
  const alinea = (tekst: string, kleur: RGB = GRIJS_700) => {
    doc.setFont('Inter', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...kleur);
    for (const regel of doc.splitTextToSize(tekst, breed) as string[]) {
      nieuwePaginaAls(6);
      doc.text(regel, MARGE, y + 3.8);
      y += 4.4;
    }
    y += 6;
  };

  kop('Werkzaamheden');
  alinea(rij.werkzaamheden?.trim() || 'Niet ingevuld.', rij.werkzaamheden ? GRIJS_700 : GRIJS_500);
  kop('Bevindingen');
  alinea(rij.bevindingen?.trim() || 'Geen bijzonderheden.', rij.bevindingen ? GRIJS_700 : GRIJS_500);

  // ---------- Foto's ----------
  if (rij.fotos.length > 0) {
    const beelden = await perStuk(rij.fotos, 5, async (f) => ({ f, beeld: await laadFotoKlein(f.url, opties.origin) }));
    kop("Foto's");
    y += 2;
    const kolommen = 3;
    const fotoB = (breed - (kolommen - 1) * 5) / kolommen;
    const fotoH = fotoB * 0.75;
    const vakH = fotoH + 11;
    let k = 0;
    for (const { f, beeld } of beelden) {
      if (k === 0) nieuwePaginaAls(vakH);
      const x = MARGE + k * (fotoB + 5);
      doc.setFillColor(...GRIJS_50);
      doc.setDrawColor(...GRIJS_200);
      doc.roundedRect(x, y, fotoB, fotoH, 1.2, 1.2, 'FD');
      if (beeld) tekenBeeld(doc, beeld, x + 0.6, y + 0.6, fotoB - 1.2, fotoH - 1.2);
      if (f.bijschrift) {
        doc.setFont('Inter', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...GRIJS_700);
        doc.text((doc.splitTextToSize(f.bijschrift, fotoB) as string[]).slice(0, 2), x, y + fotoH + 4);
      }
      k += 1;
      if (k === kolommen) {
        k = 0;
        y += vakH;
      }
    }
    if (k !== 0) y += vakH;
    y += 2;
  }

  // ---------- Akkoord klant ----------
  const vakH = 46;
  nieuwePaginaAls(vakH + 18);
  kop('Akkoord klant');
  y += 2;
  doc.setDrawColor(...GRIJS_200);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(MARGE, y, breed, vakH, 2, 2, 'FD');
  if (handtekening && !concept) {
    tekenBeeld(doc, handtekening, MARGE + 4, y + 3, breed * 0.55, vakH - 14);
    doc.setDrawColor(...GRIJS_200);
    doc.line(MARGE + 4, y + vakH - 10, MARGE + breed * 0.55, y + vakH - 10);
    doc.setFont('Inter', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text(rij.getekendDoor ?? '', MARGE + 4, y + vakH - 5);
    doc.setFont('Inter', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIJS_500);
    const op = rij.getekendOp
      ? new Date(rij.getekendOp).toLocaleString('nl-NL', { ...NL, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '';
    doc.text(`Getekend op het scherm op ${op}`, MARGE + breed - 4, y + vakH - 5, { align: 'right' });
    const uitleg = doc.splitTextToSize('Met deze handtekening bevestigt de klant dat het bezoek en de werkzaamheden zijn uitgevoerd zoals hierboven beschreven.', breed * 0.38) as string[];
    doc.text(uitleg, MARGE + breed * 0.6, y + 9);
  } else {
    doc.setFont('Inter', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRIJS_500);
    doc.text('Nog niet getekend.', MARGE + 5, y + 10);
  }
  y += vakH + 6;

  doc.setFont('Inter', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIJS_500);
  nieuwePaginaAls(8);
  doc.text('Dit dagrapport is een verslag van het bezoek en geen factuur.', MARGE, y);

  tekenVoet(doc);
  return Buffer.from(doc.output('arraybuffer'));
}

/** Bestandsnaam: dagrapport-2026-09-08-kempen-metaalbewerking-b-v.pdf */
export function dagrapportNaam(rij: Pick<DagrapportRij, 'datum' | 'klant'>): string {
  return `dagrapport-${nlDag(rij.datum)}-${schoneNaam(rij.klant.naam) || 'klant'}.pdf`;
}
