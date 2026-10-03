// De werkbon (in de code nog dagrapport) als PDF, op de SERVER gemaakt
// (GET /api/dagrapporten/[id]/pdf): jsPDF met Inter, foto's verkleind met
// sharp, huisstijl v2.0. Fonts, foto's en de voet komen uit lib/rapport/rapportPdf.ts.
//
// Een werkbon komt van It's Done Services, dus geen logo van de klant: bovenaan
// een navy band met het witte logo links en Werkbon met het nummer rechts, de
// oranje streep eronder. Daarna opdrachtgever en kerngegevens in twee kolommen,
// een grijze strook met plek, uitvoering en tijd, en de blokken werkzaamheden,
// bevindingen, materialen, vervolg, foto's en afronding (handtekening van de
// klant, of afgerond zonder handtekening). Geen bedragen: geen factuur.

import { jsPDF } from 'jspdf';
import sharp from 'sharp';
import type { DagrapportRij } from '../dagrapporten';
import { dagrapportNummer, leesMaterialen } from '../dagrapporten';
import { nlDag } from '../klantOpdracht';
import { aantalTekst, duurTekst, soortWerkLabel, werktijdTekst } from '../werkbon';
import {
  BAND_TEKST,
  CONTACT,
  GRIJS_200,
  GRIJS_50,
  GRIJS_500,
  GRIJS_700,
  MARGE,
  NAVY,
  ORANJE,
  laadFonts,
  laadFotoKlein,
  laadLogo,
  perStuk,
  schoneNaam,
  tekenBeeld,
  tekenVoet,
  zetFonts,
  type Beeld,
  type RGB,
} from './rapportPdf';

const NL = { timeZone: 'Europe/Amsterdam' } as const;
const BLAUW: RGB = [29, 78, 216];

function dagTekst(dag: string): string {
  return new Date(`${dag}T12:00:00Z`).toLocaleDateString('nl-NL', { ...NL, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function tijdstip(d: Date): string {
  return d.toLocaleString('nl-NL', { ...NL, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** 150 minuten als "2,5 uur", 45 als "45 minuten". */
export const urenTekst = (minuten: number | null) => duurTekst(minuten);

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
  const nummer = dagrapportNummer(rij);
  const datum = nlDag(rij.datum);
  const materialen = leesMaterialen(rij.materialen);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  zetFonts(doc, await laadFonts());
  doc.setProperties({ title: `Werkbon ${nummer} ${rij.klant.naam} ${datum}`, subject: nummer, author: CONTACT.naam, creator: 'IDS Portal' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const breed = W - 2 * MARGE;

  const [logo, handtekening] = await Promise.all([laadLogo('/header_logo.png', opties.origin), laadHandtekening(rij.handtekening)]);

  // ---------- Kop: navy band met het eigen logo ----------
  const bandH = 34;
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, bandH, 'F');
  if (logo) {
    const lb = 62;
    const lh = lb / logo.ratio;
    tekenBeeld(doc, logo, MARGE, (bandH - lh) / 2, lb, lh);
  } else {
    doc.setFont('Inter', 'extrabold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text(CONTACT.naam, MARGE, bandH / 2 + 2);
  }
  doc.setFont('Inter', 'extrabold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('Werkbon', W - MARGE, 16, { align: 'right' });
  doc.setFont('Inter', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...BAND_TEKST);
  doc.text(rij.status === 'concept' ? `${nummer}  |  CONCEPT` : nummer, W - MARGE, 23, { align: 'right' });
  doc.setFillColor(...ORANJE);
  doc.rect(0, bandH, W, 1.2, 'F');

  let y = bandH + 12;
  const nieuwePaginaAls = (nodig: number) => {
    if (y + nodig > H - 20) {
      doc.addPage();
      y = 20;
    }
  };

  // ---------- Opdrachtgever links, kerngegevens rechts ----------
  const kleinKop = (tekst: string, x: number, yy: number) => {
    doc.setFont('Inter', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...BLAUW);
    doc.text(tekst.toUpperCase(), x, yy, { charSpace: 0.3 });
  };
  kleinKop('Opdrachtgever', MARGE, y);
  doc.setFont('Inter', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(rij.klant.naam, MARGE, y + 6);
  doc.setFont('Inter', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRIJS_700);
  const adres = [rij.klant.adres, [rij.klant.postcode, rij.klant.plaats].filter(Boolean).join(' ')].filter(Boolean) as string[];
  adres.forEach((r, i) => doc.text(r, MARGE, y + 11 + i * 4.4));

  const xR = MARGE + breed * 0.55;
  const kern: [string, string][] = [['Werkbonnummer', nummer], ['Datum', dagTekst(datum)]];
  if (rij.referentie) kern.push(['Werkorder klant', rij.referentie]);
  if (rij.soortWerk) kern.push(['Soort werk', soortWerkLabel(rij.soortWerk) ?? rij.soortWerk]);
  kleinKop('Gegevens', xR, y);
  kern.forEach(([label, waarde], i) => {
    const yy = y + 6 + i * 5;
    doc.setFont('Inter', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...GRIJS_500);
    doc.text(label, xR, yy);
    doc.setFont('Inter', 'bold');
    doc.setTextColor(...NAVY);
    doc.text(doc.splitTextToSize(waarde, W - MARGE - xR - 30)[0] ?? '', xR + 30, yy);
  });
  y += Math.max(11 + adres.length * 4.4, 6 + kern.length * 5) + 6;

  // ---------- Strook: plek, uitvoering, tijd ----------
  // Per vak een label, een vette hoofdregel (hooguit twee regels) en eventueel
  // grijze regels eronder (gescheiden door \n).
  const strook: [string, string, string?][] = [
    ['Locatie', rij.object?.name ?? '-', rij.object?.address ?? undefined],
    ['Uitgevoerd door', rij.uitvoerder, CONTACT.naam],
    ['Contactpersoon', rij.contactpersoon ?? '-'],
    rij.tijdsoort === 'tijden' && rij.beginTijd && rij.eindTijd
      ? ['Werktijd', duurTekst(rij.minuten), `${rij.beginTijd} - ${rij.eindTijd}${rij.pauzeMinuten ? `\n${rij.pauzeMinuten} min pauze` : ''}`]
      : ['Werktijd', werktijdTekst(rij)],
  ];
  if (rij.reisMinuten !== null || rij.kilometers !== null) {
    strook.push(['Reis', rij.reisMinuten !== null ? duurTekst(rij.reisMinuten) : '-', rij.kilometers !== null ? `${rij.kilometers} km` : undefined]);
  }
  const kolomB = (breed - 8) / strook.length;
  const strookH = 23;
  const ingekort = (tekst: string, b: number) => {
    if (doc.getTextWidth(tekst) <= b) return tekst;
    let t = tekst;
    while (t.length > 1 && doc.getTextWidth(`${t}...`) > b) t = t.slice(0, -1);
    return `${t.trimEnd().replace(/,$/, '')}...`;
  };
  doc.setFillColor(...GRIJS_50);
  doc.setDrawColor(...GRIJS_200);
  doc.roundedRect(MARGE, y, breed, strookH, 1.5, 1.5, 'FD');
  strook.forEach(([label, waarde, onder], i) => {
    const x = MARGE + 4 + i * kolomB;
    doc.setFont('Inter', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIJS_500);
    doc.text(label, x, y + 6);
    doc.setFont('Inter', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...NAVY);
    const regels = (doc.splitTextToSize(waarde, kolomB - 3) as string[]).slice(0, 2);
    doc.text(regels, x, y + 10.5);
    if (onder) {
      doc.setFont('Inter', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...GRIJS_700);
      onder.split('\n').forEach((r, j) => doc.text(ingekort(r, kolomB - 3), x, y + 10.9 + regels.length * 3.8 + j * 3.4));
    }
  });
  y += strookH + 9;

  // ---------- Blokken ----------
  const kop = (tekst: string) => {
    nieuwePaginaAls(20);
    doc.setFont('Inter', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...BLAUW);
    doc.text(tekst.toUpperCase(), MARGE, y, { charSpace: 0.3 });
    doc.setDrawColor(...GRIJS_200);
    doc.setLineWidth(0.2);
    doc.line(MARGE, y + 2, W - MARGE, y + 2);
    y += 4;
  };
  const alinea = (tekst: string, kleur: RGB = GRIJS_700) => {
    doc.setFont('Inter', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...kleur);
    for (const regel of doc.splitTextToSize(tekst, breed) as string[]) {
      nieuwePaginaAls(6);
      doc.text(regel, MARGE, y + 3.8);
      y += 4.6;
    }
    y += 6;
  };

  kop('Uitgevoerde werkzaamheden');
  alinea(rij.werkzaamheden?.trim() || 'Niet ingevuld.', rij.werkzaamheden ? GRIJS_700 : GRIJS_500);
  kop('Bevindingen');
  alinea(rij.bevindingen?.trim() || 'Geen bijzonderheden.', rij.bevindingen ? GRIJS_700 : GRIJS_500);

  if (materialen.length > 0) {
    kop('Materialen en onderdelen');
    const xArt = MARGE + breed * 0.62;
    const xAantal = W - MARGE;
    doc.setFont('Inter', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIJS_500);
    doc.text('Omschrijving', MARGE, y + 3);
    doc.text('Artikelnummer', xArt, y + 3);
    doc.text('Aantal', xAantal, y + 3, { align: 'right' });
    y += 5;
    for (const m of materialen) {
      const regels = doc.splitTextToSize(m.omschrijving, breed * 0.58) as string[];
      const h = regels.length * 4.2 + 2.6;
      nieuwePaginaAls(h);
      doc.setFont('Inter', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...GRIJS_700);
      doc.text(regels, MARGE, y + 3.6);
      doc.setTextColor(...GRIJS_500);
      doc.text(m.artikelnummer ?? '-', xArt, y + 3.6);
      doc.setFont('Inter', 'bold');
      doc.setTextColor(...NAVY);
      doc.text(aantalTekst(m) || '-', xAantal, y + 3.6, { align: 'right' });
      y += h;
      doc.setDrawColor(...GRIJS_200);
      doc.line(MARGE, y, W - MARGE, y);
    }
    y += 8;
  }

  if (rij.vervolgNodig || rij.vervolgActie) {
    kop('Vervolg en aanbevelingen');
    const regels = doc.splitTextToSize(rij.vervolgActie?.trim() || 'Er is vervolgwerk nodig.', breed - 10) as string[];
    const h = regels.length * 4.6 + 6;
    nieuwePaginaAls(h);
    doc.setFillColor(...GRIJS_50);
    doc.rect(MARGE, y, breed, h, 'F');
    doc.setFillColor(...NAVY);
    doc.rect(MARGE, y, 1.2, h, 'F');
    doc.setFont('Inter', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...GRIJS_700);
    doc.text(regels, MARGE + 5, y + 6.5);
    y += h + 8;
  }

  // ---------- Foto's ----------
  if (rij.fotos.length > 0) {
    const beelden = await perStuk(rij.fotos, 5, async (f) => ({ f, beeld: await laadFotoKlein(f.url, opties.origin) }));
    kop("Foto's");
    y += 1;
    const perRij = 3;
    const fotoB = (breed - (perRij - 1) * 5) / perRij;
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
      if (k === perRij) {
        k = 0;
        y += vakH;
      }
    }
    if (k !== 0) y += vakH;
    y += 2;
  }

  // ---------- Afronding ----------
  if (rij.status === 'getekend') {
    const vakH = 38;
    nieuwePaginaAls(vakH + 12);
    kop('Akkoord opdrachtgever');
    y += 1;
    doc.setDrawColor(...GRIJS_200);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(MARGE, y, breed, vakH, 1.5, 1.5, 'FD');
    if (handtekening) tekenBeeld(doc, handtekening, MARGE + 4, y + 3, breed * 0.5, vakH - 14);
    doc.setDrawColor(...GRIJS_200);
    doc.line(MARGE + 4, y + vakH - 10, MARGE + breed * 0.52, y + vakH - 10);
    doc.setFont('Inter', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text(rij.getekendDoor ?? '', MARGE + 4, y + vakH - 5);
    doc.setFont('Inter', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIJS_500);
    const uitleg = doc.splitTextToSize('Met deze handtekening bevestigt de opdrachtgever dat de werkzaamheden zijn uitgevoerd zoals hierboven beschreven.', breed * 0.4) as string[];
    doc.text(uitleg, MARGE + breed * 0.57, y + 9);
    if (rij.getekendOp) doc.text(`Getekend op ${tijdstip(rij.getekendOp)}`, MARGE + breed * 0.57, y + vakH - 5);
    y += vakH + 8;
  } else {
    nieuwePaginaAls(24);
    kop('Afronding');
    doc.setFont('Inter', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRIJS_700);
    const tekst =
      rij.status === 'afgerond'
        ? `Afgerond door ${rij.uitvoerder}${rij.afgerondOp ? ` op ${tijdstip(rij.afgerondOp)}` : ''}. Voor dit werk is geen handtekening van de opdrachtgever nodig.`
        : 'Concept: deze werkbon is nog niet afgerond.';
    const regels = doc.splitTextToSize(tekst, breed) as string[];
    doc.text(regels, MARGE, y + 3.8);
    y += regels.length * 4.6 + 8;
  }

  doc.setFont('Inter', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIJS_500);
  nieuwePaginaAls(8);
  doc.text('Deze werkbon is een verslag van de uitgevoerde werkzaamheden en geen factuur.', MARGE, y);

  tekenVoet(doc);
  return Buffer.from(doc.output('arraybuffer'));
}

/** Bestandsnaam: werkbon-wb-2026-012-2026-09-08-kempen-metaalbewerking-b-v.pdf */
export function dagrapportNaam(rij: Pick<DagrapportRij, 'id' | 'nummerJaar' | 'volgnummer' | 'datum' | 'klant'>): string {
  return `werkbon-${dagrapportNummer(rij).toLowerCase()}-${nlDag(rij.datum)}-${schoneNaam(rij.klant.naam) || 'klant'}.pdf`;
}
