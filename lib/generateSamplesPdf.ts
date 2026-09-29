import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sampleStatus, telStatussen, STATUS_LABELS } from './sampleStatus';

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
  /** Reden van annulering; komt onder de status te staan als het mag van cancelReasonInPdf */
  cancelReason?: string | null;
  cancelReasonInPdf?: boolean;
  /** Foto van het monsterpotje */
  photoUrl?: string | null;
  /** Foto van het onderdeel waar het monster vandaan komt */
  partPhotoUrl?: string | null;
  /** Niet bereikbaar: het monster staat nog open, maar de locatie was niet te bereiken */
  isUnreachable?: boolean;
  unreachableReason?: string | null;
  unreachableNote?: string | null;
}

// Huisstijl It's Done Services / IDS Portal
const NAVY: [number, number, number] = [12, 27, 51]; // #0C1B33
const SLATE: [number, number, number] = [100, 116, 139]; // #64748B
const GREEN: [number, number, number] = [22, 163, 74]; // #16A34A
const RED: [number, number, number] = [204, 41, 0]; // #CC2900
const AMBER: [number, number, number] = [180, 83, 9]; // #B45309, --geel-tekst

// De twee fotokolommen: eerst het onderdeel, dan het potje.
const FOTO_KOLOMMEN = [
  { titel: 'Foto onderdeel', veld: 'partPhotoUrl' as const },
  { titel: 'Foto potje', veld: 'photoUrl' as const },
];

const KOLOM_STATUS = 0;
const KOLOM_FOTO_EERSTE = 5;

// Hoogte van een regel met foto's, in mm. Groot genoeg om er iets op te zien,
// klein genoeg om een jaaroverzicht van een paar honderd monsters leesbaar te
// houden.
const FOTO_HOOGTE = 22;

function formatDate(value: string | null): string {
  if (!value) return '-';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('nl-NL');
}

/**
 * De status in woorden, met de reden eronder.
 * - Geannuleerd: de reden erbij, tenzij die voor intern gebruik is.
 * - Niet bereikbaar: altijd de reden en de omschrijving erbij; dat is juist wat
 *   de klant moet weten, want het monster moet nog gebeuren.
 */
function statusLabel(s: PdfSample): string {
  const status = sampleStatus(s);
  if (status === 'geannuleerd') {
    if (s.cancelReasonInPdf !== false && s.cancelReason) {
      return `${STATUS_LABELS.geannuleerd}\n${s.cancelReason}`;
    }
    return STATUS_LABELS.geannuleerd;
  }
  if (status === 'niet-bereikbaar') {
    const regels = [STATUS_LABELS['niet-bereikbaar']];
    if (s.unreachableReason) regels.push(s.unreachableReason);
    if (s.unreachableNote) regels.push(s.unreachableNote);
    return regels.join('\n');
  }
  return STATUS_LABELS[status];
}

interface GeladenFoto {
  dataUrl: string;
  /** Breedte gedeeld door hoogte */
  ratio: number;
}

/**
 * Haalt een foto op en maakt er een kleine JPEG van. Via een canvas, zodat elk
 * formaat dat de browser kan lezen werkt en de PDF niet volloopt met foto's van
 * vier megapixel. Lukt het niet, dan komt er null terug en blijft de cel leeg:
 * een PDF zonder foto is beter dan geen PDF.
 */
async function laadFoto(url: string): Promise<GeladenFoto | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bron: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const beeld = new Image();
      beeld.onload = () => resolve(beeld);
      beeld.onerror = reject;
      beeld.src = bron;
    });
    const maxZijde = 480;
    const schaal = Math.min(1, maxZijde / Math.max(img.naturalWidth, img.naturalHeight));
    const breedte = Math.max(1, Math.round(img.naturalWidth * schaal));
    const hoogte = Math.max(1, Math.round(img.naturalHeight * schaal));
    const canvas = document.createElement('canvas');
    canvas.width = breedte;
    canvas.height = hoogte;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, breedte, hoogte);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.72), ratio: breedte / hoogte };
  } catch {
    return null;
  }
}

/** Laadt foto's een paar tegelijk, zodat de telefoon het bijhoudt. */
async function laadFotos(urls: string[], tegelijk = 5): Promise<Map<string, GeladenFoto>> {
  const uniek = [...new Set(urls)];
  const uitkomst = new Map<string, GeladenFoto>();
  let volgende = 0;
  const werker = async () => {
    while (volgende < uniek.length) {
      const url = uniek[volgende++];
      const foto = await laadFoto(url);
      if (foto) uitkomst.set(url, foto);
    }
  };
  await Promise.all(Array.from({ length: Math.min(tegelijk, uniek.length) }, werker));
  return uitkomst;
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
 * Genereert en downloadt een PDF met alle oliemonsters van een jaar, inclusief de
 * twee foto's per monster (het onderdeel en het monsterpotje).
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

  // Alle foto's van tevoren ophalen; daarna staan ze klaar om te tekenen.
  const fotoUrls: string[] = [];
  for (const s of sorted) {
    for (const kolom of FOTO_KOLOMMEN) {
      const url = s[kolom.veld];
      if (url) fotoUrls.push(url);
    }
  }
  const fotos = await laadFotos(fotoUrls);

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

  // Telling: alle vier de statussen
  const totalen = telStatussen(sorted);

  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(
    `Totaal: ${sorted.length}    Genomen: ${totalen.genomen}    Niet genomen: ${totalen['niet-genomen']}` +
      `    Niet bereikbaar: ${totalen['niet-bereikbaar']}    Geannuleerd: ${totalen.geannuleerd}`,
    marginX,
    headerBottom + 15
  );

  /**
   * Het monster bij een tabelregel. autoTable roept de hooks ook aan voor een
   * regel die over een paginagrens valt; die heeft index -1 en hoort bij geen
   * monster. Zonder deze controle liep het tekenen van de foto's daarop stuk.
   */
  const monsterVanRij = (index: number): PdfSample | null => sorted[index] ?? null;

  // Tabel
  autoTable(doc, {
    startY: headerBottom + 20,
    margin: { left: marginX, right: marginX },
    head: [['Status', 'O-nummer', 'Datum', 'Locatie', 'Omschrijving', ...FOTO_KOLOMMEN.map((k) => k.titel)]],
    body: sorted.map((s) => [
      statusLabel(s),
      s.oNumber,
      s.isTaken ? formatDate(s.sampleDate) : '-',
      s.location,
      s.description,
      // De foto's worden getekend in didDrawCell; staat er geen foto, dan blijft
      // het streepje staan.
      ...FOTO_KOLOMMEN.map((k) => (s[k.veld] && fotos.has(s[k.veld] as string) ? '' : '-')),
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
      0: { cellWidth: 34 },
      1: { cellWidth: 24, fontStyle: 'bold' },
      2: { cellWidth: 22 },
      3: { cellWidth: 42 },
      4: { cellWidth: 'auto' },
      5: { cellWidth: 26, halign: 'center' },
      6: { cellWidth: 26, halign: 'center' },
    },
    // Kleur de statuscel per regel, en maak een regel met foto's hoog genoeg.
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const s = monsterVanRij(data.row.index);
      if (!s) return;
      if (data.column.index === KOLOM_STATUS) {
        const status = sampleStatus(s);
        if (status === 'geannuleerd') {
          data.cell.styles.textColor = SLATE;
        } else if (status === 'genomen') {
          data.cell.styles.textColor = GREEN;
          data.cell.styles.fontStyle = 'bold';
        } else if (status === 'niet-bereikbaar') {
          data.cell.styles.textColor = AMBER;
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = RED;
          data.cell.styles.fontStyle = 'bold';
        }
      }
      if (data.column.index >= KOLOM_FOTO_EERSTE) {
        const kolom = FOTO_KOLOMMEN[data.column.index - KOLOM_FOTO_EERSTE];
        const url = kolom ? s[kolom.veld] : null;
        if (url && fotos.has(url)) {
          data.cell.styles.minCellHeight = FOTO_HOOGTE;
        }
      }
    },
    // De foto's zelf: passend in de cel, met de juiste verhoudingen.
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index < KOLOM_FOTO_EERSTE) return;
      const kolom = FOTO_KOLOMMEN[data.column.index - KOLOM_FOTO_EERSTE];
      const rij = monsterVanRij(data.row.index);
      if (!kolom || !rij) return;
      const url = rij[kolom.veld];
      const foto = url ? fotos.get(url) : undefined;
      if (!foto) return;

      const rand = 1.5;
      const ruimteBreed = data.cell.width - rand * 2;
      const ruimteHoog = data.cell.height - rand * 2;
      if (ruimteBreed <= 0 || ruimteHoog <= 0) return;
      let breedte = ruimteBreed;
      let hoogte = breedte / foto.ratio;
      if (hoogte > ruimteHoog) {
        hoogte = ruimteHoog;
        breedte = hoogte * foto.ratio;
      }
      const x = data.cell.x + (data.cell.width - breedte) / 2;
      const y = data.cell.y + (data.cell.height - hoogte) / 2;
      try {
        doc.addImage(foto.dataUrl, 'JPEG', x, y, breedte, hoogte);
      } catch (error) {
        // Eén foto overslaan is beter dan een halve PDF.
        console.error('Foto niet in de PDF gekregen:', error);
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
