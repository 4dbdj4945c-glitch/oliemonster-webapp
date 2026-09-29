// Het inhuurdossier: alle geldige documenten uit het eigen dossier in één PDF,
// voor een opdrachtgever die It's Done Services inhuurt. Voorblad in huisstijl
// (jsPDF, Inter) met de lijst van documenten en hun geldigheid, daarna elk
// bestand zelf: een PDF met al zijn pagina's (pdf-lib), een foto of scan als
// eigen pagina. Een bestand dat niet te lezen is (bijvoorbeeld een beveiligde
// PDF) staat op het voorblad als niet bijgevoegd.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { haalFoto } from '../fotoLaden';
import { documentSoort } from '../eigenDossier';
import { nlDag } from '../klantOpdracht';
import { BAND_TEKST, CONTACT, GRIJS_200, GRIJS_500, GRIJS_700, MARGE, NAVY, ORANJE, datumLang, laadFonts, laadLogo, tekenBeeld, tekenVoet, zetFonts } from './rapportPdf';

export interface InhuurDocument {
  id: number;
  soort: string;
  titel: string;
  uitgever: string | null;
  nummer: string | null;
  afgegevenOp: Date | null;
  vervaltOp: Date | null;
  bestandUrl: string | null;
  bestandType: string | null;
}

type Bijlage = { soort: 'pdf'; doc: PDFDocument } | { soort: 'beeld'; bytes: Uint8Array; breed: number; hoog: number } | null;

async function laadBijlage(d: InhuurDocument, origin?: string): Promise<Bijlage> {
  if (!d.bestandUrl) return null;
  const bestand = await haalFoto(d.bestandUrl, origin);
  if (!bestand) return null;
  const type = d.bestandType ?? bestand.type;
  try {
    if (type === 'application/pdf') return { soort: 'pdf', doc: await PDFDocument.load(bestand.bytes) };
    const { data, info } = await sharp(bestand.bytes).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 80 }).toBuffer({ resolveWithObject: true });
    return { soort: 'beeld', bytes: new Uint8Array(data), breed: info.width, hoog: info.height };
  } catch {
    return null;
  }
}

const dag = (d: Date | null) =>
  d ? new Date(`${nlDag(d)}T12:00:00Z`).toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'numeric', year: 'numeric' }) : '-';

export async function maakInhuurdossierPdf(documenten: InhuurDocument[], opties: { origin?: string; nu?: Date } = {}): Promise<Buffer> {
  const nu = opties.nu ?? new Date();
  const bijlagen = await Promise.all(documenten.map((d) => laadBijlage(d, opties.origin)));

  // ---------- Voorblad ----------
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  zetFonts(doc, await laadFonts());
  doc.setProperties({ title: `Inhuurdossier ${CONTACT.naam}`, author: CONTACT.naam, creator: 'IDS Portal' });
  const W = doc.internal.pageSize.getWidth();
  const logo = await laadLogo('/logo-navy.png', opties.origin);
  if (logo) tekenBeeld(doc, logo, MARGE, 12, 46, 46 / logo.ratio);
  let y = 28;
  doc.setFillColor(...NAVY);
  doc.rect(0, y, W, 30, 'F');
  doc.setFont('Inter', 'extrabold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('Inhuurdossier', MARGE, y + 13);
  doc.setFont('Inter', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...BAND_TEKST);
  doc.text(`${CONTACT.naam}, Heeze. Stand van ${datumLang(nu)}`, MARGE, y + 21);
  doc.setFillColor(...ORANJE);
  doc.rect(0, y + 30, W, 1.2, 'F');

  y = 72;
  doc.setFont('Inter', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...GRIJS_700);
  const inleiding = doc.splitTextToSize(
    `In dit dossier staan de geldige documenten van ${CONTACT.naam}: VCA, verzekering, inschrijving bij de Kamer van Koophandel, en het deskundigheidsdossier met diploma's, cursussen en de kalibratie van meetmiddelen. Na dit voorblad volgt elk document zelf.`,
    W - 2 * MARGE
  );
  doc.text(inleiding, MARGE, y);
  y += inleiding.length * 4.2 + 6;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGE, right: MARGE, top: 16, bottom: 18 },
    head: [['Soort', 'Document', 'Uitgever en nummer', 'Afgegeven', 'Geldig tot', 'Bijgevoegd']],
    body: documenten.length
      ? documenten.map((d, i) => [
          documentSoort(d.soort).label,
          d.titel,
          [d.uitgever, d.nummer].filter(Boolean).join(', ') || '-',
          dag(d.afgegevenOp),
          d.vervaltOp ? dag(d.vervaltOp) : 'verloopt niet',
          bijlagen[i] ? 'ja' : d.bestandUrl ? 'niet te lezen' : 'geen bestand',
        ])
      : [[{ content: 'Er zijn nog geen geldige documenten.', colSpan: 6 }]],
    theme: 'plain',
    styles: { font: 'Inter', fontSize: 8.5, textColor: NAVY, cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 }, lineColor: GRIJS_200, lineWidth: { bottom: 0.2 } },
    headStyles: { font: 'Inter', fontStyle: 'bold', fontSize: 7.5, textColor: GRIJS_500, fillColor: [255, 255, 255], lineWidth: { bottom: 0.4 }, lineColor: NAVY },
    columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 'auto', fontStyle: 'bold' }, 2: { cellWidth: 40 }, 3: { cellWidth: 20 }, 4: { cellWidth: 22 }, 5: { cellWidth: 20 } },
  });
  // Zonder paginanummer: de bijgevoegde documenten hebben hun eigen opmaak.
  tekenVoet(doc, { nummers: false });

  // ---------- Samenvoegen ----------
  const uit = await PDFDocument.load(doc.output('arraybuffer'));
  for (const b of bijlagen) {
    if (!b) continue;
    if (b.soort === 'pdf') {
      const paginas = await uit.copyPages(b.doc, b.doc.getPageIndices());
      for (const p of paginas) uit.addPage(p);
    } else {
      const beeld = await uit.embedJpg(b.bytes);
      const [pw, ph] = [595.28, 841.89];
      const marge = 36;
      const schaal = Math.min((pw - 2 * marge) / b.breed, (ph - 2 * marge) / b.hoog);
      const pagina = uit.addPage([pw, ph]);
      const w = b.breed * schaal;
      const h = b.hoog * schaal;
      pagina.drawImage(beeld, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
  }
  uit.setTitle(`Inhuurdossier ${CONTACT.naam}`);
  uit.setAuthor(CONTACT.naam);
  return Buffer.from(await uit.save());
}
