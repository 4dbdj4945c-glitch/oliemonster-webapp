// Het verzamelrapport: meerdere inspecties van één klant en één sjabloon in
// één PDF, gemaakt op de SERVER (GET /api/inspecties/rapport?ids=1,2,3). Een
// inspectie hoort bij één object; zo komt werk op een paar objecten toch in
// één opleverrapport. Het enkele rapport van een markering gebruikt dezelfde
// opbouw met één object (lib/rapport/inspectieRapportPdf.ts).
//
// Opbouw, in huisstijl v2.0 (navy, oranje streep, Inter):
// 1. Voorblad: navy band met het witte logo, titel van het sjabloonrapport,
//    opdrachtgever (met t.a.v.), opdracht, periode, uitvoerder, aantallen,
//    telling per uitslag, de verklaring en de gegevens van It's Done Services.
// 2. Overzicht van alle bevindingen, per object, met de telling eronder.
// 3. Per object een hoofdstuk: per bevinding titel, locatie, uitslag,
//    meetwaarden, opmerking en alle foto's in een raster.
// Bovenaan elke volgende pagina de titel en de klant (en CONCEPT als er een
// concept bij zit), onderaan contact en "Pagina x van y".

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { InspectieRij } from '../inspecties/server';
import { nlDag } from '../klantOpdracht';
import { eigenTitel, getal, inspectieNummer, leesInstellingen, luchtketelWaarschuwing, oordeelVan, sjabloonVan, type GetalVeld, type Instellingen, type Sjabloon } from '../inspecties/sjablonen';
import { nl } from '../inspecties/rekenen';
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
  laadLogo,
  schoneNaam,
  tekenBeeld,
  tekenVoet,
  zetFonts,
  type RGB,
} from './rapportPdf';
import { AMBER_RAND, AMBER_TEKST, AMBER_VLAK, BLAUW, OORDEEL_TEKST, dagKort, dagTekst, ingekort, laadInspectieFotos, tekenFotoVak, verklaringGeldtVoor } from './inspectieHulp';

export interface VerzamelrapportOpties {
  origin?: string;
  metFotos?: boolean;
}

type Item = InspectieRij['items'][number];

/** Met een hoofdletter: "locaties" wordt "Locaties". */
const hoofdletter = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** De meetwaarden die als kolom in het overzicht staan. */
function tabelMeetwaarden(s: Sjabloon): GetalVeld[] {
  if (s.sleutel === 'persluchtlekken') return s.meetwaarden.filter((v) => v.sleutel === 'verliesLpm');
  return s.meetwaarden.length === 1 ? s.meetwaarden : [];
}

/** Een getal met de eenheid, of '-'. */
function meetTekst(v: GetalVeld, waarden: unknown): string {
  const n = getal(waarden, v.sleutel);
  return n === null ? '-' : `${nl(n, v.decimalen)}${v.eenheid ? ` ${v.eenheid}` : ''}`;
}

/** Telling per oordeel van het sjabloon, plus zonder oordeel. */
export function tellingPerOordeel(s: Sjabloon, items: { oordeel: string | null }[]) {
  const per = s.oordeel.keuzes.map((k) => ({ keuze: k, aantal: items.filter((i) => i.oordeel === k.waarde).length }));
  const zonder = items.filter((i) => !s.oordeel.keuzes.some((k) => k.waarde === i.oordeel)).length;
  return { per, zonder };
}

/** "11 locaties, 10 gemarkeerd, 1 niet bereikbaar" */
export function tellingTekst(s: Sjabloon, items: { oordeel: string | null }[]): string {
  const { per, zonder } = tellingPerOordeel(s, items);
  const n = items.length;
  const delen = [`${n} ${n === 1 ? s.item.enkel : s.item.meervoud}`];
  for (const { keuze, aantal } of per) if (aantal > 0) delen.push(`${aantal} ${keuze.label.toLowerCase()}`);
  if (zonder > 0) delen.push(`${zonder} zonder ${s.oordeel.label.toLowerCase()}`);
  return delen.join(', ');
}

/** Eerste niet-lege tekstinstelling over de inspecties heen. */
function eersteTekst(instellingen: Instellingen[], sleutel: string): string {
  for (const i of instellingen) {
    const t = String(i[sleutel] ?? '').trim();
    if (t) return t;
  }
  return '';
}

export async function maakVerzamelrapportPdf(invoer: InspectieRij[], opties: VerzamelrapportOpties = {}): Promise<Buffer> {
  if (invoer.length === 0) throw new Error('Geen inspecties voor het rapport');
  const rijen = [...invoer].sort((a, b) => a.datum.getTime() - b.datum.getTime() || a.object.name.localeCompare(b.object.name, 'nl') || a.id - b.id);
  const s = sjabloonVan(rijen[0].sjabloon);
  const metFotos = opties.metFotos ?? true;
  const klant = rijen[0].klant;
  const concept = rijen.some((r) => r.status === 'concept');
  const enkel = rijen.length === 1;
  const instellingen = rijen.map((r) => leesInstellingen(s, r.instellingen));
  const opdracht = eersteTekst(instellingen, 'opdracht');
  const tav = eersteTekst(instellingen, 'tav');
  const alleItems = rijen.flatMap((r) => r.items);
  const dagen = rijen.map((r) => nlDag(r.datum)).sort();
  const periode = dagen[0] === dagen.at(-1) ? dagTekst(dagen[0]) : `${dagTekst(dagen[0])} t/m ${dagTekst(dagen.at(-1)!)}`;
  const uitvoerders = [...new Set(rijen.map((r) => r.uitvoerder.trim()).filter(Boolean))];
  const titel = rijen.map((r) => eigenTitel(r.instellingen)).find(Boolean) ?? s.rapport.titel;
  const meet = tabelMeetwaarden(s);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  zetFonts(doc, await laadFonts());
  doc.setProperties({
    title: `${titel} ${klant.naam} ${dagen.at(-1)}`,
    subject: enkel ? `${s.naam}, ${inspectieNummer(rijen[0])}` : `${s.naam}, ${rijen.length} inspecties`,
    author: CONTACT.naam,
    creator: 'IDS Portal',
  });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const breed = W - 2 * MARGE;
  const ONDER = H - 20;

  const [logo, klantLogo, beelden] = await Promise.all([
    laadLogo('/header_logo.png', opties.origin),
    laadLogo(klant.logoUrl, opties.origin),
    metFotos ? laadInspectieFotos(alleItems, opties.origin) : Promise.resolve(new Map()),
  ]);

  let y = 0;
  const nieuwePagina = () => {
    doc.addPage();
    y = 20;
  };
  const pastNiet = (nodig: number) => y + nodig > ONDER;
  const kleinKop = (tekst: string, x: number, yy: number) => {
    doc.setFont('Inter', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...BLAUW);
    doc.text(tekst.toUpperCase(), x, yy, { charSpace: 0.3 });
  };
  const kader = (tekst: string, vlak: RGB, rand: RGB, kleur: RGB) => {
    doc.setFont('Inter', 'normal');
    doc.setFontSize(9);
    const regels = doc.splitTextToSize(tekst, breed - 10) as string[];
    const h = regels.length * 4.1 + 7;
    if (pastNiet(h)) nieuwePagina();
    doc.setFillColor(...vlak);
    doc.setDrawColor(...rand);
    doc.roundedRect(MARGE, y, breed, h, 2, 2, 'FD');
    doc.setTextColor(...kleur);
    doc.text(regels, MARGE + 5, y + 5.8);
    y += h + 5;
  };

  // ================= 1. Voorblad =================
  const bandH = 80;
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, bandH, 'F');
  if (logo) {
    const lb = 58;
    tekenBeeld(doc, logo, MARGE, 14, lb, lb / logo.ratio);
  } else {
    doc.setFont('Inter', 'extrabold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text(CONTACT.naam, MARGE, 24);
  }
  doc.setFont('Inter', 'extrabold');
  doc.setTextColor(255, 255, 255);
  // Een eigen titel kan lang zijn: kleiner tot hij op één regel past, en
  // anders over twee regels (met puntjes als ook dat niet past).
  let kopMaat = 24;
  doc.setFontSize(kopMaat);
  while (kopMaat > 17 && doc.getTextWidth(titel) > breed) doc.setFontSize((kopMaat -= 1));
  const kopRegels: string[] = doc.splitTextToSize(titel, breed);
  if (kopRegels.length === 1) doc.text(kopRegels[0], MARGE, 52);
  else {
    let tweede = kopRegels.slice(1).join(' ');
    if (kopRegels.length > 2) {
      while (tweede.length > 1 && doc.getTextWidth(`${tweede}...`) > breed) tweede = tweede.slice(0, -1).trimEnd();
      tweede += '...';
    }
    doc.text(kopRegels[0], MARGE, 45);
    doc.text(tweede, MARGE, 52.5);
  }
  doc.setFont('Inter', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...BAND_TEKST);
  doc.text(doc.splitTextToSize(`${klant.naam}, ${periode}`, breed)[0] ?? '', MARGE, 61);
  if (concept) {
    doc.setFont('Inter', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...ORANJE);
    doc.text(enkel ? 'CONCEPT: deze inspectie is nog niet afgerond' : 'CONCEPT: nog niet alle inspecties zijn afgerond', MARGE, 70, { charSpace: 0.2 });
  }
  doc.setFillColor(...ORANJE);
  doc.rect(0, bandH, W, 1.2, 'F');

  // Opdrachtgever links, logo van de klant rechts
  y = bandH + 14;
  kleinKop('Opdrachtgever', MARGE, y);
  doc.setFont('Inter', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text(klant.naam, MARGE, y + 6.5);
  doc.setFont('Inter', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...GRIJS_700);
  const adres = [klant.adres, [klant.postcode, klant.plaats].filter(Boolean).join(' ')].filter(Boolean) as string[];
  if (tav) adres.push(`T.a.v. ${tav}`);
  adres.forEach((r, i) => doc.text(r, MARGE, y + 12 + i * 4.6));
  if (klantLogo) {
    const lh = 16;
    const lb = Math.min(50, lh * klantLogo.ratio);
    tekenBeeld(doc, klantLogo, W - MARGE - lb, y - 2, lb, lh);
  }
  y += 12 + adres.length * 4.6 + 8;

  // Gegevens in twee kolommen
  const gegevens: [string, string][] = [];
  if (opdracht) gegevens.push(['Opdracht of referentie', opdracht]);
  gegevens.push([enkel ? 'Datum' : 'Periode', periode]);
  gegevens.push(['Uitgevoerd door', `${uitvoerders.join(', ')}, ${CONTACT.naam}`]);
  if (enkel) {
    gegevens.push(['Object', [rijen[0].object.name, rijen[0].object.address].filter(Boolean).join(', ')]);
    gegevens.push(['Nummer', inspectieNummer(rijen[0])]);
  } else {
    const objecten = new Set(rijen.map((r) => r.objectId)).size;
    gegevens.push(['Objecten', objecten === rijen.length ? String(objecten) : `${objecten} (${rijen.length} inspecties)`]);
  }
  gegevens.push([hoofdletter(s.item.meervoud), String(alleItems.length)]);
  const soort = eersteTekst(instellingen, 'markering');
  if (s.sleutel === 'markering' && soort) gegevens.push(['Soort markering', soort]);
  const kolomB = breed / 2;
  for (let i = 0; i < gegevens.length; i += 2) {
    let rijH = 0;
    for (let k = 0; k < 2 && i + k < gegevens.length; k++) {
      const [label, waarde] = gegevens[i + k];
      const x = MARGE + k * kolomB;
      doc.setFont('Inter', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...GRIJS_500);
      doc.text(label, x, y);
      doc.setFont('Inter', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...NAVY);
      const regels = (doc.splitTextToSize(waarde, kolomB - 6) as string[]).slice(0, 3);
      doc.text(regels, x, y + 4.8);
      rijH = Math.max(rijH, 4.8 + regels.length * 4.2);
    }
    y += rijH + 5;
  }
  y += 2;

  // Kengetallen: aantal en telling per uitslag
  const { per, zonder } = tellingPerOordeel(s, alleItems);
  const kengetallen: [string, string][] = [[nl(alleItems.length), alleItems.length === 1 ? s.item.enkel : s.item.meervoud]];
  for (const { keuze, aantal } of per) kengetallen.push([nl(aantal), keuze.label.toLowerCase()]);
  if (zonder > 0) kengetallen.push([nl(zonder), `zonder ${s.oordeel.label.toLowerCase()}`]);
  if (s.sleutel === 'markering') {
    const stickers = alleItems.reduce((som, i) => som + (getal(i.waarden, 'stickers') ?? 0), 0);
    kengetallen.push([nl(stickers), stickers === 1 ? 'sticker' : 'stickers']);
  }
  {
    const b = breed / kengetallen.length;
    doc.setDrawColor(...GRIJS_200);
    doc.setFillColor(...GRIJS_50);
    doc.roundedRect(MARGE, y, breed, 21, 2, 2, 'FD');
    kengetallen.forEach(([waarde, label], i) => {
      const x = MARGE + i * b + 5;
      doc.setFont('Inter', 'extrabold');
      doc.setFontSize(16);
      doc.setTextColor(...NAVY);
      doc.text(waarde, x, y + 10);
      doc.setFont('Inter', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...GRIJS_500);
      doc.text(doc.splitTextToSize(label, b - 6)[0] ?? '', x, y + 16);
    });
    y += 27;
  }

  // Verklaring
  if (s.sleutel === 'arbeidsmiddelen') {
    // Art. 7.4a geldt alleen voor wat echt gecontroleerd is (zie het enkele rapport).
    const geldt = rijen.flatMap((r) => verklaringGeldtVoor(r));
    const niet = alleItems.filter((i) => !geldt.includes(i));
    if (geldt.length > 0) {
      kader(`${s.rapport.verklaring!(instellingen[0])} Deze verklaring geldt voor: ${geldt.map((i) => i.titel).join(', ')}.`, GRIJS_50, GRIJS_200, GRIJS_700);
    }
    if (niet.length > 0) {
      kader(
        `Niet (volledig) gecontroleerd: ${niet.map((i) => i.titel).join(', ')}. De verklaring ${geldt.length > 0 ? 'hierboven ' : 'van art. 7.4a Arbobesluit '}geldt er niet voor.`,
        AMBER_VLAK,
        AMBER_RAND,
        AMBER_TEKST
      );
    }
  } else if (s.rapport.verklaring) {
    kader(s.rapport.verklaring({ ...instellingen[0], opdracht, tav, ...(soort ? { markering: soort } : {}) }), GRIJS_50, GRIJS_200, GRIJS_700);
  }

  // Gegevens van It's Done Services onderaan het voorblad
  const bedrijfH = 30;
  if (y + 6 > H - 20 - bedrijfH) nieuwePagina();
  y = Math.max(y + 6, H - 20 - bedrijfH);
  doc.setDrawColor(...GRIJS_200);
  doc.setLineWidth(0.2);
  doc.line(MARGE, y, W - MARGE, y);
  kleinKop('Uitgevoerd door', MARGE, y + 7);
  const bedrijf: [string, string][][] = [
    [
      [CONTACT.naam, ''],
      ['Werkplaats', CONTACT.werkplaats],
      ['Postadres', CONTACT.postadres],
    ],
    [
      ['Telefoon', CONTACT.telefoon],
      ['E-mail', CONTACT.email],
      ['Website', CONTACT.website],
    ],
  ];
  bedrijf.forEach((kolom, k) => {
    const x = MARGE + k * kolomB;
    kolom.forEach(([label, waarde], r) => {
      const yy = y + 13 + r * 4.8;
      if (!waarde) {
        doc.setFont('Inter', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...NAVY);
        doc.text(label, x, yy);
        return;
      }
      doc.setFont('Inter', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...GRIJS_500);
      doc.text(label, x, yy);
      doc.setTextColor(...GRIJS_700);
      doc.text(waarde, x + 22, yy);
    });
  });

  // ================= 2. Overzicht =================
  nieuwePagina();
  doc.setFont('Inter', 'extrabold');
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text('Overzicht', MARGE, y);
  y += 6;
  doc.setFont('Inter', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRIJS_500);
  doc.text(doc.splitTextToSize(`Alle ${s.item.meervoud}${enkel ? '' : ' per object'}. ${tellingTekst(s, alleItems)}.`, breed), MARGE, y);
  y += 5;

  type Cel = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };
  const kolommen = ['Nr', hoofdletter(s.item.titel), 'Locatie', s.oordeel.label, ...meet.map((v) => v.kort ?? v.label), 'Datum'];
  const body: Cel[][] = [];
  const oordeelVanRij: (string | null)[] = [];
  let nr = 0;
  const nummers = new Map<number, number>();
  for (const r of rijen) {
    if (!enkel) {
      body.push([
        {
          content: `${r.object.name}   ${inspectieNummer(r)}${r.status === 'concept' ? ', concept' : ''}`,
          colSpan: kolommen.length,
          styles: { fillColor: GRIJS_50, fontStyle: 'bold', textColor: NAVY },
        },
      ]);
      oordeelVanRij.push(null);
    }
    if (r.items.length === 0) {
      body.push([{ content: `Geen ${s.item.meervoud}.`, colSpan: kolommen.length, styles: { textColor: GRIJS_500 } }]);
      oordeelVanRij.push(null);
    }
    for (const i of r.items) {
      nr += 1;
      nummers.set(i.id, nr);
      body.push([String(nr), i.titel, i.locatie ?? '', oordeelVan(s, i.oordeel)?.label ?? '-', ...meet.map((v) => meetTekst(v, i.waarden)), dagKort(r.datum)]);
      oordeelVanRij.push(i.oordeel);
    }
  }
  const oordeelKolom = 3;
  autoTable(doc, {
    startY: y,
    margin: { left: MARGE, right: MARGE, top: 18, bottom: 18 },
    head: [kolommen],
    body,
    theme: 'plain',
    styles: { font: 'Inter', fontSize: 8, textColor: NAVY, cellPadding: { top: 2, bottom: 2, left: 1.6, right: 1.6 }, lineColor: GRIJS_200, lineWidth: { bottom: 0.2 } },
    headStyles: { font: 'Inter', fontStyle: 'bold', fontSize: 7, textColor: GRIJS_500, fillColor: [255, 255, 255], lineWidth: { bottom: 0.4 }, lineColor: NAVY },
    columnStyles: {
      0: { cellWidth: 9, textColor: GRIJS_500 },
      1: { cellWidth: 48, fontStyle: 'bold' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 27 },
      ...Object.fromEntries(meet.map((_, k) => [4 + k, { cellWidth: 18, halign: 'right' }])),
      [4 + meet.length]: { cellWidth: 19 },
    },
    didParseCell: (d) => {
      if (d.section === 'head' && d.column.index >= 4 && d.column.index < 4 + meet.length) d.cell.styles.halign = 'right';
      if (d.section !== 'body' || d.column.index !== oordeelKolom) return;
      const kleur = OORDEEL_TEKST[oordeelVanRij[d.row.index] ?? ''];
      if (kleur) {
        d.cell.styles.textColor = kleur;
        d.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 6;
  if (pastNiet(10)) nieuwePagina();
  doc.setFont('Inter', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  const totaal = `Totaal: ${tellingTekst(s, alleItems)}.`;
  doc.text(doc.splitTextToSize(totaal, breed), MARGE, y);

  // ================= 3. Per object =================
  const fotoKolommen = 3;
  const fotoTussen = 4;
  const fotoB = (breed - (fotoKolommen - 1) * fotoTussen) / fotoKolommen;
  const fotoH = fotoB * 0.75;

  /** Regels "Label: waarde" onder de titel van een bevinding. */
  const regelsVan = (r: InspectieRij, i: Item): [string, string][] => {
    const uit: [string, string][] = [];
    if (i.locatie) uit.push(['Locatie', i.locatie]);
    for (const v of s.meetwaarden) if (getal(i.waarden, v.sleutel) !== null) uit.push([v.label, meetTekst(v, i.waarden)]);
    if (i.notitie) uit.push(['Opmerking', i.notitie]);
    if (r.sjabloon === 'arbeidsmiddelen') {
      const w = luchtketelWaarschuwing(i.waarden);
      if (w) uit.push(['Let op', w]);
    }
    return uit;
  };
  // Labels in één kolom, zo breed als het langste label (de meetwaarden van het sjabloon tellen mee).
  doc.setFont('Inter', 'normal');
  doc.setFontSize(9);
  const labelB = Math.min(60, Math.max(...['Locatie', 'Opmerking', 'Let op', ...s.meetwaarden.map((v) => v.label)].map((l) => doc.getTextWidth(l))) + 5);
  const waardeB = breed - labelB;
  const meetRegels = (regels: [string, string][]) => {
    doc.setFont('Inter', 'normal');
    doc.setFontSize(9);
    return regels.map(([l, w]) => ({ l, w: doc.splitTextToSize(w, waardeB) as string[] }));
  };

  rijen.forEach((r, objectNr) => {
    nieuwePagina();
    if (!enkel) kleinKop(`Object ${objectNr + 1} van ${rijen.length}`, MARGE, y);
    y += enkel ? 0 : 7;
    doc.setFont('Inter', 'extrabold');
    doc.setFontSize(18);
    doc.setTextColor(...NAVY);
    doc.text(doc.splitTextToSize(r.object.name, breed)[0] ?? r.object.name, MARGE, y + 2);
    y += 8;
    doc.setFont('Inter', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRIJS_700);
    const onder = [
      r.object.address,
      `${inspectieNummer(r)}, ${dagTekst(nlDag(r.datum))}, uitgevoerd door ${r.uitvoerder}${r.status === 'concept' ? '. Concept, nog niet afgerond' : ''}`,
      tellingTekst(s, r.items),
    ].filter(Boolean) as string[];
    onder.forEach((t) => {
      doc.text(doc.splitTextToSize(t, breed)[0] ?? '', MARGE, y);
      y += 4.6;
    });
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.4);
    doc.line(MARGE, y, W - MARGE, y);
    doc.setLineWidth(0.2);
    y += 7;
    if (r.samenvatting) {
      doc.setFont('Inter', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...GRIJS_700);
      for (const regel of doc.splitTextToSize(r.samenvatting, breed) as string[]) {
        if (pastNiet(5)) nieuwePagina();
        doc.text(regel, MARGE, y);
        y += 4.6;
      }
      y += 4;
    }
    if (r.items.length === 0) {
      doc.setFontSize(9.5);
      doc.setTextColor(...GRIJS_500);
      doc.text(`Geen ${s.item.meervoud} bij dit object.`, MARGE, y);
      return;
    }

    for (const i of r.items) {
      const regels = meetRegels(regelsVan(r, i));
      const regelsH = regels.reduce((som, x) => som + x.w.length * 4.2 + 0.8, 0);
      const kopH = 7 + regelsH + 2;
      const fotos = metFotos ? i.fotos : [];
      const rijHoogte = (vanaf: number) => fotoH + (fotos.slice(vanaf, vanaf + fotoKolommen).some((f) => f.bijschrift) ? 12 : 4);
      // Kop van de bevinding nooit los onderaan een pagina: met de eerste rij foto's samen.
      if (pastNiet(kopH + (fotos.length ? rijHoogte(0) : 8))) nieuwePagina();

      // Titel met nummer, uitslag rechts
      const oordeel = oordeelVan(s, i.oordeel);
      const uitslag = oordeel?.label ?? `Zonder ${s.oordeel.label.toLowerCase()}`;
      doc.setFont('Inter', 'bold');
      doc.setFontSize(9);
      const uitslagB = doc.getTextWidth(uitslag);
      doc.setTextColor(...(OORDEEL_TEKST[i.oordeel ?? ''] ?? GRIJS_500));
      doc.text(uitslag, W - MARGE, y + 4, { align: 'right' });
      doc.setFontSize(11);
      doc.setTextColor(...NAVY);
      const kop = `${nummers.get(i.id) ?? ''}. ${i.titel}`;
      doc.text(doc.splitTextToSize(kop, breed - uitslagB - 6)[0] ?? kop, MARGE, y + 4);
      y += 9;
      for (const { l, w } of regels) {
        doc.setFont('Inter', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...GRIJS_500);
        doc.text(l, MARGE, y);
        doc.setTextColor(...GRIJS_700);
        doc.text(w, MARGE + labelB, y);
        y += w.length * 4.2 + 0.8;
      }
      y += 2;

      if (metFotos && fotos.length === 0) {
        doc.setFontSize(8.5);
        doc.setTextColor(...GRIJS_500);
        doc.text("Geen foto's.", MARGE, y + 1);
        y += 6;
      }
      for (let start = 0; start < fotos.length; start += fotoKolommen) {
        const h = rijHoogte(start);
        if (pastNiet(h)) nieuwePagina();
        fotos.slice(start, start + fotoKolommen).forEach((f, k) => {
          const x = MARGE + k * (fotoB + fotoTussen);
          tekenFotoVak(doc, beelden.get(f.id) ?? null, x, y, fotoB, fotoH);
          if (f.bijschrift) {
            doc.setFont('Inter', 'normal');
            doc.setFontSize(7.5);
            doc.setTextColor(...GRIJS_700);
            doc.text(ingekort(doc, f.bijschrift, fotoB, 2), x, y + fotoH + 4);
          }
        });
        y += h;
      }
      y += 3;
      doc.setDrawColor(...GRIJS_200);
      doc.line(MARGE, y, W - MARGE, y);
      y += 6;
    }
  });

  // ================= Kop en voet op elke pagina =================
  const paginas = doc.getNumberOfPages();
  for (let p = 2; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFont('Inter', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIJS_500);
    doc.text(doc.splitTextToSize(`${titel}, ${klant.naam}`, breed - 30)[0] ?? '', MARGE, 10);
    if (concept) {
      doc.setFont('Inter', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...AMBER_TEKST);
      doc.text('CONCEPT', W - MARGE, 10, { align: 'right', charSpace: 0.3 });
    }
    doc.setDrawColor(...GRIJS_200);
    doc.line(MARGE, 12.5, W - MARGE, 12.5);
  }
  tekenVoet(doc);
  return Buffer.from(doc.output('arraybuffer'));
}

/** Bestandsnaam: Opleverrapport-markering-kempen-metaalbewerking-b-v-2026-10-03.pdf */
export function verzamelrapportNaam(rijen: Pick<InspectieRij, 'sjabloon' | 'datum' | 'klant' | 'instellingen'>[]): string {
  const s = sjabloonVan(rijen[0].sjabloon);
  const laatste = rijen.map((r) => nlDag(r.datum)).sort().at(-1);
  const eigen = rijen.map((r) => eigenTitel(r.instellingen)).find(Boolean);
  const titel = (eigen ?? s.rapport.titel).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${titel}-${schoneNaam(rijen[0].klant.naam) || 'klant'}-${laatste}.pdf`;
}
