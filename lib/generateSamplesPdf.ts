import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Minimale vorm van een oliemonster zoals de dashboards die kennen.
export interface PdfSample {
  oNumber: string;
  sampleDate: string | null;
  location: string;
  description: string;
  oilType?: string | null;
  remarks?: string | null;
  isTaken: boolean;
  isDisabled?: boolean;
}

// Huisstijl It's Done Services / IDS Portal
const NAVY: [number, number, number] = [12, 27, 51]; // #0C1B33
const BLUE: [number, number, number] = [29, 78, 216]; // #1D4ED8
const SLATE: [number, number, number] = [100, 116, 139]; // #64748B
const GREEN: [number, number, number] = [22, 163, 74]; // #16A34A
const RED: [number, number, number] = [204, 41, 0]; // #CC2900

function formatDate(value: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('nl-NL');
}

function statusLabel(s: PdfSample): string {
  if (s.isDisabled) return 'Geannuleerd';
  return s.isTaken ? 'Genomen' : 'Niet genomen';
}

// Laadt het logo uit /public als data-URL. Geeft null terug als het niet lukt,
// zodat de PDF ook zonder logo netjes wordt gegenereerd.
async function loadLogo(): Promise<{ dataUrl: string; ratio: number } | null> {
  try {
    const res = await fetch('/header_logo.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const ratio: number = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth / img.naturalHeight || 4);
      img.onerror = () => resolve(4);
      img.src = dataUrl;
    });
    return { dataUrl, ratio };
  } catch {
    return null;
  }
}

/**
 * Genereert en downloadt een PDF met alle oliemonsters van een jaar.
 * Draait volledig client-side (werkt ook op telefoon/tablet).
 */
export async function generateSamplesPdf(samples: PdfSample[], year: number): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;

  // Sorteer altijd op o-nummer (natuurlijke volgorde)
  const sorted = [...samples].sort((a, b) =>
    a.oNumber.localeCompare(b.oNumber, 'nl', { numeric: true, sensitivity: 'base' })
  );

  // Kopregel met logo
  const logo = await loadLogo();
  let headerBottom = 16;
  if (logo) {
    const logoHeight = 9;
    const logoWidth = logoHeight * logo.ratio;
    try {
      doc.addImage(logo.dataUrl, 'PNG', marginX, 12, logoWidth, logoHeight);
    } catch {
      /* logo overslaan bij fout */
    }
    headerBottom = 12 + logoHeight;
  }

  // Titel
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text(`Oliemonsters ${year}`, marginX, headerBottom + 8);

  // Gegenereerd-op regel (rechts uitgelijnd)
  const generatedAt = new Date().toLocaleString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  doc.text(`Gegenereerd: ${generatedAt}`, pageWidth - marginX, headerBottom + 8, { align: 'right' });

  // Telling
  const total = sorted.length;
  const taken = sorted.filter((s) => s.isTaken && !s.isDisabled).length;
  const notTaken = sorted.filter((s) => !s.isTaken && !s.isDisabled).length;
  const cancelled = sorted.filter((s) => s.isDisabled).length;

  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(
    `Totaal: ${total}    Genomen: ${taken}    Niet genomen: ${notTaken}    Geannuleerd: ${cancelled}`,
    marginX,
    headerBottom + 15
  );

  // Tabel
  autoTable(doc, {
    startY: headerBottom + 20,
    margin: { left: marginX, right: marginX },
    head: [['Status', 'O-nummer', 'Datum afname', 'Locatie', 'Omschrijving', 'Type olie']],
    body: sorted.map((s) => [
      statusLabel(s),
      s.oNumber,
      s.isTaken ? formatDate(s.sampleDate) : '-',
      s.location,
      s.description,
      s.oilType || '-',
    ]),
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 2.5,
      textColor: NAVY,
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
      valign: 'middle',
    },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: [244, 246, 248] },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 26, fontStyle: 'bold' },
      2: { cellWidth: 26 },
      3: { cellWidth: 45 },
      4: { cellWidth: 'auto' },
      5: { cellWidth: 40 },
    },
    // Kleur de statuscel per regel
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 0) {
        const s = sorted[data.row.index];
        if (s.isDisabled) {
          data.cell.styles.textColor = SLATE;
        } else if (s.isTaken) {
          data.cell.styles.textColor = GREEN;
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = RED;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    // Voettekst met paginanummer
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      const current = data.pageNumber;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...SLATE);
      const pageHeight = doc.internal.pageSize.getHeight();
      doc.text("It's Done Services  ·  IDS Portal", marginX, pageHeight - 7);
      doc.text(`Pagina ${current} van ${pageCount}`, pageWidth - marginX, pageHeight - 7, {
        align: 'right',
      });
    },
  });

  doc.save(`oliemonsters-${year}.pdf`);
}
