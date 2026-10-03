// Het rapport van één inspectie als PDF, gemaakt op de SERVER
// (GET /api/inspecties/[id]/rapport), met dezelfde aanpak als het
// oliemonsterrapport (lib/rapport/rapportPdf.ts): jsPDF met Inter, foto's
// verkleind met sharp, kop en voet in huisstijl v2.0.
//
// Inhoud:
// 1. Kop met logo's, navy band met de titel van het sjabloon.
// 2. Gegevens: klant, object, datum, uitvoerder, nummer, volgende inspectie.
// 3. Persluchtlekken: kengetallen (lekken, verlies, kosten en CO2 per jaar),
//    besparing na reparatie, uitgangspunten, tabel per lek.
//    Arbeidsmiddelen: de verklaring uit het juridisch onderzoek (letterlijk),
//    uitslag per arbeidsmiddel, doorverwijzing bij een grote luchtketel, en
//    per arbeidsmiddel de checklist.
// 4. Fotobijlage: per bevinding alle foto's.
//
// Markering heeft de opbouw van het verzamelrapport, met één object
// (lib/rapport/verzamelrapportPdf.ts).

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { InspectieRij } from '../inspecties/server';
import { nlDag } from '../klantOpdracht';
import {
  CHECKLIST_ANTWOORDEN,
  checklistVan,
  getal,
  inspectieNummer,
  leesInstellingen,
  luchtketelWaarschuwing,
  oordeelVan,
  sjabloonVan,
  type SjabloonSleutel,
} from '../inspecties/sjablonen';
import { aantalNietGoed, arbeidsmiddelTelling, berekenLek, co2Tekst, euro, lekInstellingen, lekTotalen, nl, volgendeInspectie } from '../inspecties/rekenen';
import {
  CONTACT,
  GRIJS_200,
  GRIJS_50,
  GRIJS_500,
  GRIJS_700,
  MARGE,
  NAVY,
  laadFonts,
  laadLogo,
  schoneNaam,
  tekenKop,
  tekenVoet,
  zetFonts,
  type RGB,
} from './rapportPdf';
import { AMBER_RAND, AMBER_TEKST, AMBER_VLAK, GROEN_TEKST, OORDEEL_TEKST, dagKort, dagTekst, ingekort, laadInspectieFotos, tekenFotoVak, verklaringGeldtVoor } from './inspectieHulp';
import { maakVerzamelrapportPdf, verzamelrapportNaam } from './verzamelrapportPdf';

export { verklaringGeldtVoor };

export interface InspectieRapportOpties {
  origin?: string;
  metFotos?: boolean;
}

export async function maakInspectieRapportPdf(rij: InspectieRij, opties: InspectieRapportOpties = {}): Promise<Buffer> {
  if (rij.sjabloon === 'markering') return maakVerzamelrapportPdf([rij], opties);
  const sjabloon = rij.sjabloon as SjabloonSleutel;
  const s = sjabloonVan(sjabloon);
  const instellingen = leesInstellingen(s, rij.instellingen);
  const metFotos = opties.metFotos ?? true;
  const nummer = inspectieNummer(rij.id);
  const datum = nlDag(rij.datum);
  const volgende = volgendeInspectie(sjabloon, rij.volgendeOp, rij.items);

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  zetFonts(doc, await laadFonts());
  doc.setProperties({
    title: `${s.rapport.titel} ${rij.klant.naam} ${datum}`,
    subject: `${s.naam}, ${nummer}`,
    author: CONTACT.naam,
    creator: 'IDS Portal',
  });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const breed = W - 2 * MARGE;

  const [klantLogo, idsLogo] = await Promise.all([laadLogo(rij.klant.logoUrl, opties.origin), laadLogo('/logo-navy.png', opties.origin)]);
  tekenKop(doc, {
    klantLogo,
    idsLogo,
    klantNaam: rij.klant.naam,
    titel: s.rapport.titel,
    onder: `${rij.klant.naam}, ${rij.object.name}, ${dagTekst(datum)}${rij.status === 'concept' ? '. Concept' : ''}`,
  });

  // ---------- Gegevens ----------
  let y = 68;
  const gegevens: [string, string][] = [
    ['Klant', [rij.klant.naam, rij.klant.plaats].filter(Boolean).join(', ')],
    ['Locatie', [rij.object.name, rij.object.address].filter(Boolean).join(', ')],
    ...(rij.installatie ? ([['Installatie', `${rij.installatie.naam} (${rij.installatie.code})`]] as [string, string][]) : []),
    ['Datum inspectie', dagTekst(datum)],
    ['Uitgevoerd door', `${rij.uitvoerder}, ${CONTACT.naam}`],
    ['Nummer', nummer],
    ['Volgende inspectie', dagTekst(volgende)],
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
  y += Math.ceil(gegevens.length / 2) * 10 + 2;

  const kengetallen = (lijst: [string, string][]) => {
    const b = breed / lijst.length;
    doc.setDrawColor(...GRIJS_200);
    doc.setFillColor(...GRIJS_50);
    doc.roundedRect(MARGE, y, breed, 20, 2, 2, 'FD');
    lijst.forEach(([waarde, label], i) => {
      const x = MARGE + i * b + 5;
      doc.setFont('Inter', 'extrabold');
      doc.setFontSize(15);
      doc.setTextColor(...NAVY);
      doc.text(waarde, x, y + 9);
      doc.setFont('Inter', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...GRIJS_500);
      doc.text(label, x, y + 15);
    });
    y += 26;
  };

  const kop = (tekst: string) => {
    if (y > H - 55) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('Inter', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...NAVY);
    doc.text(tekst, MARGE, y);
    y += 3;
  };

  const alinea = (tekst: string, kleur: RGB = GRIJS_700, grootte = 9) => {
    doc.setFont('Inter', 'normal');
    doc.setFontSize(grootte);
    doc.setTextColor(...kleur);
    const regels = doc.splitTextToSize(tekst, breed);
    doc.text(regels, MARGE, y + 3.5);
    y += 3.5 + regels.length * grootte * 0.42 + 6;
  };

  const kader = (tekst: string, vlak: RGB, rand: RGB, kleur: RGB) => {
    doc.setFont('Inter', 'normal');
    doc.setFontSize(8.5);
    const regels = doc.splitTextToSize(tekst, breed - 10);
    const h = regels.length * 3.8 + 7;
    if (y + h > H - 20) {
      doc.addPage();
      y = 20;
    }
    doc.setFillColor(...vlak);
    doc.setDrawColor(...rand);
    doc.roundedRect(MARGE, y, breed, h, 2, 2, 'FD');
    doc.setTextColor(...kleur);
    doc.text(regels, MARGE + 5, y + 5.6);
    y += h + 5;
  };

  const tabelStijl = {
    margin: { left: MARGE, right: MARGE, top: 16, bottom: 18 },
    theme: 'plain' as const,
    styles: { font: 'Inter', fontSize: 8, textColor: NAVY, cellPadding: { top: 2, bottom: 2, left: 1.6, right: 1.6 }, lineColor: GRIJS_200, lineWidth: { bottom: 0.2 } },
    headStyles: { font: 'Inter', fontStyle: 'bold' as const, fontSize: 7, textColor: GRIJS_500, fillColor: [255, 255, 255] as RGB, lineWidth: { bottom: 0.4 }, lineColor: NAVY },
  };
  const naTabel = () => {
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8;
  };

  if (sjabloon === 'persluchtlekken') {
    const inst = lekInstellingen(rij.instellingen);
    const t = lekTotalen(rij.items, inst);
    kengetallen([
      [nl(t.aantal), t.aantal === 1 ? 'lek gevonden' : 'lekken gevonden'],
      [`${nl(t.verliesLpm, 1)} l/min`, 'geschat verlies samen'],
      [euro(t.kostenPerJaar), 'kosten per jaar'],
      [co2Tekst(t.co2KgPerJaar).replace(' CO2', ''), 'CO2 per jaar'],
    ]);
    kader(
      t.gerepareerd > 0
        ? `Besparing na reparatie: ${euro(t.besparingKosten)} en ${co2Tekst(t.besparingCo2Kg)} per jaar (${t.gerepareerd} van ${t.aantal} lekken gerepareerd).` +
            (t.aantal > t.gerepareerd ? ` Met de overige ${t.aantal - t.gerepareerd} lekken is nog ${euro(t.openKosten)} per jaar te besparen.` : ' Alle lekken zijn gerepareerd.')
        : `Wordt alles gerepareerd, dan scheelt dat ${euro(t.kostenPerJaar)} en ${co2Tekst(t.co2KgPerJaar)} per jaar.`,
      [240, 253, 244],
      [187, 247, 208],
      GROEN_TEKST
    );
    if (rij.samenvatting) {
      kop('Samenvatting');
      alinea(rij.samenvatting);
    }

    kop('Per lek');
    const body = rij.items.map((i) => {
      const lpm = getal(i.waarden, 'verliesLpm');
      const b = berekenLek(lpm, inst);
      return [
        i.titel,
        [i.locatie, i.notitie].filter(Boolean).join('. '),
        getal(i.waarden, 'db') !== null ? nl(getal(i.waarden, 'db')!) : '-',
        lpm !== null ? nl(lpm, 1) : '-',
        euro(b.kostenPerJaar),
        nl(b.co2KgPerJaar),
        oordeelVan(s, i.oordeel)?.label ?? '-',
        i.gerepareerd ? `ja, ${dagKort(i.gerepareerdOp)}` : 'nee',
      ];
    });
    autoTable(doc, {
      ...tabelStijl,
      startY: y,
      head: [['Label', 'Locatie en toelichting', 'dB', 'l/min', 'per jaar', 'kg CO2', 'Prioriteit', 'Gerepareerd']],
      body: body.length ? body : [[{ content: 'Geen lekken gevonden.', colSpan: 8 }]],
      columnStyles: { 0: { cellWidth: 16, fontStyle: 'bold' }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 10, halign: 'right' }, 3: { cellWidth: 14, halign: 'right' }, 4: { cellWidth: 19, halign: 'right' }, 5: { cellWidth: 14, halign: 'right' }, 6: { cellWidth: 17 }, 7: { cellWidth: 23 } },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 6) {
          const kleur = OORDEEL_TEKST[rij.items[d.row.index]?.oordeel ?? ''];
          if (kleur) {
            d.cell.styles.textColor = kleur;
            d.cell.styles.fontStyle = 'bold';
          }
        }
        if (d.section === 'head' && d.column.index >= 2 && d.column.index <= 5) d.cell.styles.halign = 'right';
      },
    });
    naTabel();

    kop('Uitgangspunten');
    alinea(
      [
        `Netdruk ${nl(inst.drukBar, 1)} bar, ${nl(inst.draaiuren)} draaiuren per jaar.`,
        `Energie per m3 perslucht ${nl(inst.kwhPerM3, 3)} kWh${inst.kwhPerM3Berekend ? ' (uitgerekend uit de netdruk, compressor met 70 procent rendement)' : ''}.`,
        inst.prijsmodel === 'm3' ? `Kosten met € ${nl(inst.prijsM3, 3)} per m3 perslucht.` : `Kosten met € ${nl(inst.prijsKwh, 3)} per kWh.`,
        `CO2 met ${nl(inst.co2PerKwh, 3)} kg per kWh.`,
        'Het verlies per lek is een schatting met een ultrasone lekdetector (methode volgens ISO 11011). Een jaarlijkse controle is aan te raden.',
      ].join(' '),
      GRIJS_500,
      8
    );
  } else {
    const t = arbeidsmiddelTelling(rij.items);
    kengetallen([
      [nl(t.aantal), t.aantal === 1 ? 'arbeidsmiddel' : 'arbeidsmiddelen'],
      [nl(t['in-orde']), 'in orde'],
      [nl(t['actie-nodig']), 'actie nodig'],
      [nl(t['buiten-gebruik']), 'buiten gebruik'],
      ...(t['niet-gecontroleerd'] + t.zonderUitslag > 0 ? ([[nl(t['niet-gecontroleerd'] + t.zonderUitslag), 'niet gecontroleerd']] as [string, string][]) : []),
    ]);
    // De verklaring geldt alleen voor wat echt gecontroleerd is. Wat bewust is
    // overgeslagen (of nog geen uitslag heeft), staat er los onder.
    // Gecontroleerd = een uitslag (niet Niet gecontroleerd) en de hele checklist beantwoord.
    const geldt = new Set(verklaringGeldtVoor(rij));
    const isGecontroleerd = (i: (typeof rij.items)[number]) => geldt.has(i);
    const gecontroleerd = rij.items.filter(isGecontroleerd);
    const nietGecontroleerd = rij.items.filter((i) => !isGecontroleerd(i));
    if (gecontroleerd.length > 0) {
      kader(
        `${s.rapport.verklaring!(instellingen)} Deze verklaring geldt voor: ${gecontroleerd.map((i) => i.titel).join(', ')}.`,
        GRIJS_50,
        GRIJS_200,
        GRIJS_700
      );
    }
    if (nietGecontroleerd.length > 0) {
      kader(
        `Niet (volledig) gecontroleerd: ${nietGecontroleerd.map((i) => i.titel).join(', ')}. ${
          nietGecontroleerd.length === 1 ? 'Dit arbeidsmiddel is' : 'Deze arbeidsmiddelen zijn'
        } bij deze inspectie niet of niet op alle controlepunten geïnspecteerd; de verklaring ${gecontroleerd.length > 0 ? 'hierboven ' : 'van art. 7.4a Arbobesluit '}geldt er niet voor.`,
        AMBER_VLAK,
        AMBER_RAND,
        AMBER_TEKST
      );
    }
    for (const i of rij.items) {
      const w = luchtketelWaarschuwing(i.waarden);
      if (w) kader(`${i.titel}: ${w}`, AMBER_VLAK, AMBER_RAND, AMBER_TEKST);
    }
    if (rij.samenvatting) {
      kop('Samenvatting');
      alinea(rij.samenvatting);
    }

    kop('Uitslag per arbeidsmiddel');
    autoTable(doc, {
      ...tabelStijl,
      startY: y,
      head: [['Arbeidsmiddel', 'Uitslag', 'Niet goed', 'Volgende inspectie', 'Toelichting']],
      body: rij.items.length
        ? rij.items.map((i) => [
            [i.titel, i.installatie ? `${i.installatie.merk ?? ''} ${i.installatie.typenummer ?? ''}`.trim() : '', i.locatie ?? ''].filter(Boolean).join('\n'),
            oordeelVan(s, i.oordeel)?.label ?? '-',
            String(aantalNietGoed(i.waarden)),
            dagKort(i.volgendeOp),
            i.notitie ?? '',
          ])
        : [[{ content: 'Nog geen arbeidsmiddelen.', colSpan: 5 }]],
      columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' }, 1: { cellWidth: 26 }, 2: { cellWidth: 16, halign: 'right' }, 3: { cellWidth: 28 }, 4: { cellWidth: 'auto' } },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 1) {
          const kleur = OORDEEL_TEKST[rij.items[d.row.index]?.oordeel ?? ''];
          if (kleur) {
            d.cell.styles.textColor = kleur;
            d.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
    naTabel();

    // Checklist per arbeidsmiddel
    for (const i of rij.items) {
      kop(`${i.titel}: ${oordeelVan(s, i.oordeel)?.label ?? 'zonder uitslag'}`);
      if (!i.oordeel || i.oordeel === 'niet-gecontroleerd') {
        alinea(i.notitie ? `Niet gecontroleerd. ${i.notitie}` : 'Niet gecontroleerd bij deze inspectie.', GRIJS_500);
        continue;
      }
      const c = checklistVan(i.waarden);
      const meet = s.meetwaarden
        .map((v) => (getal(i.waarden, v.sleutel) !== null ? [`${v.label}`, `${nl(getal(i.waarden, v.sleutel)!, v.decimalen)} ${v.eenheid ?? ''}`.trim()] : null))
        .filter((r): r is string[] => r !== null);
      autoTable(doc, {
        ...tabelStijl,
        startY: y,
        head: [['Controlepunt', 'Bevinding']],
        body: [
          ...s.checklist.map((p) => [p.label, CHECKLIST_ANTWOORDEN.find((a) => a.waarde === c[p.sleutel])?.label ?? 'Niet gecontroleerd']),
          ...meet,
        ],
        columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 45 } },
        didParseCell: (d) => {
          if (d.section === 'body' && d.column.index === 1) {
            if (d.cell.raw === 'Niet goed') {
              d.cell.styles.textColor = AMBER_TEKST;
              d.cell.styles.fontStyle = 'bold';
            } else if (d.cell.raw === 'Goed') {
              d.cell.styles.textColor = GROEN_TEKST;
            }
          }
        },
      });
      naTabel();
    }
  }

  // ---------- Fotobijlage ----------
  // Alle foto's per bevinding, drie naast elkaar. Onder elke foto de titel van
  // de bevinding en het bijschrift of de locatie.
  const metFoto = metFotos ? rij.items.filter((i) => i.fotos.length > 0) : [];
  if (metFoto.length > 0) {
    const beelden = await laadInspectieFotos(metFoto, opties.origin);
    const lijst = metFoto.flatMap((i) => i.fotos.map((f, n) => ({ i, f, n, van: i.fotos.length })));
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
    doc.text(`Per ${s.item.enkel} de foto's die ter plekke zijn gemaakt. De foto's zijn verkleind.`, MARGE, y);
    y += 8;
    const kolommen = 3;
    const fotoB = (breed - (kolommen - 1) * 5) / kolommen;
    const fotoH = fotoB * 0.75;
    const vakH = fotoH + 13;
    let k = 0;
    for (const { i, f, n, van } of lijst) {
      if (y + vakH > H - 20) {
        doc.addPage();
        y = 20;
        k = 0;
      }
      const x = MARGE + k * (fotoB + 5);
      tekenFotoVak(doc, beelden.get(f.id) ?? null, x, y, fotoB, fotoH);
      const naam = van > 1 ? `${i.titel} (${n + 1}/${van})` : i.titel;
      doc.setFont('Inter', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...NAVY);
      doc.text(ingekort(doc, naam, fotoB), x, y + fotoH + 4);
      doc.setFont('Inter', 'normal');
      doc.setTextColor(...GRIJS_500);
      const onder = f.bijschrift ?? i.locatie;
      if (onder) doc.text(ingekort(doc, onder, fotoB), x, y + fotoH + 7.6);
      k += 1;
      if (k === kolommen) {
        k = 0;
        y += vakH;
      }
    }
  }

  tekenVoet(doc);
  return Buffer.from(doc.output('arraybuffer'));
}

/**
 * Bestandsnaam: persluchtlekken-2026-09-29-kempen-metaalbewerking-b-v.pdf, bij
 * markering Opleverrapport-markering-kempen-metaalbewerking-b-v-2026-09-29.pdf.
 */
export function inspectieRapportNaam(rij: Pick<InspectieRij, 'sjabloon' | 'datum' | 'klant'>): string {
  if (rij.sjabloon === 'markering') return verzamelrapportNaam([rij]);
  return `${rij.sjabloon}-${nlDag(rij.datum)}-${schoneNaam(rij.klant.naam) || 'klant'}.pdf`;
}
