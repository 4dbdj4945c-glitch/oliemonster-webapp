// CSV lezen en schrijven voor de module Acquisitie.
// Het kolomformaat komt uit de prospectlijst van het onderzoek (VELDEN.md):
// bedrijfsnaam, segment, plaats, provincie, website, telefoon, email, contactpersoon,
// functie, linkedin, omvang, activiteit, aanknopingspunt, signaal, bron, score,
// score_reden, afstand_km. Extra kolommen uit een eerdere export (status,
// volgende_actie, ...) worden ook gelezen; onbekende kolommen worden genegeerd.

import { isProspectStatus, BENADER_KANALEN, type ProspectStatusNaam } from './prospects';

/** Kolommen van de import en de export, in vaste volgorde. */
export const CSV_KOLOMMEN = [
  'bedrijfsnaam',
  'segment',
  'plaats',
  'provincie',
  'website',
  'telefoon',
  'email',
  'contactpersoon',
  'functie',
  'linkedin',
  'omvang',
  'activiteit',
  'aanknopingspunt',
  'signaal',
  'bron',
  'score',
  'score_reden',
  'afstand_km',
] as const;

/** Kolommen die de export er achteraan zet, zodat je een bewerkte lijst terug kunt lezen. */
export const CSV_EXTRA_KOLOMMEN = [
  'status',
  'kanaal',
  'afgemeld_op',
  'volgende_actie',
  'volgende_actie_op',
  'laatste_contact_op',
  'geschatte_waarde',
  'notities',
] as const;

/** Kopregel die de importhulp als voorbeeld toont. */
export const CSV_VOORBEELD = `${CSV_KOLOMMEN.join(',')}
Voorbeeld Techniek BV,industrie,Weert,Limburg,https://voorbeeld.nl,0495123456,info@voorbeeld.nl,Jan Jansen,Technisch manager,https://linkedin.com/company/voorbeeld,50-100,"Producent van kunststof onderdelen","Draait 24/5 met hydraulische persen, storing kost direct productie","Vacature onderhoudsmonteur, 3 sep 2026",https://voorbeeld.nl/vacatures,4,"Veel hydrauliek en geen eigen monteur",22`;

type CsvRij = Record<string, string>;

/**
 * Splitst een CSV-tekst in rijen met velden. Houdt rekening met velden tussen
 * dubbele aanhalingstekens (inclusief komma's en regeleindes daarbinnen) en met
 * puntkomma als scheidingsteken, want dat maakt Excel er in Nederland van.
 */
export function splitsCsv(tekst: string): string[][] {
  const schoon = tekst.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const scheiding = kiesScheidingsteken(schoon);

  const rijen: string[][] = [];
  let rij: string[] = [];
  let veld = '';
  let inQuote = false;

  for (let i = 0; i < schoon.length; i++) {
    const teken = schoon[i];

    if (inQuote) {
      if (teken === '"') {
        if (schoon[i + 1] === '"') { veld += '"'; i++; }
        else inQuote = false;
      } else {
        veld += teken;
      }
      continue;
    }

    if (teken === '"') { inQuote = true; continue; }
    if (teken === scheiding) { rij.push(veld); veld = ''; continue; }
    if (teken === '\n') { rij.push(veld); rijen.push(rij); rij = []; veld = ''; continue; }
    veld += teken;
  }

  rij.push(veld);
  rijen.push(rij);

  // Lege regels eruit
  return rijen.filter((r) => r.some((v) => v.trim() !== ''));
}

function kiesScheidingsteken(tekst: string): ',' | ';' {
  const eersteRegel = tekst.split('\n')[0] ?? '';
  const kommas = (eersteRegel.match(/,/g) || []).length;
  const punten = (eersteRegel.match(/;/g) || []).length;
  return punten > kommas ? ';' : ',';
}

function normaliseerKop(kop: string): string {
  return kop
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

// Een paar schrijfwijzen die we allemaal accepteren.
const KOP_SYNONIEMEN: Record<string, string> = {
  bedrijf: 'bedrijfsnaam',
  naam: 'bedrijfsnaam',
  scorereden: 'score_reden',
  reden: 'score_reden',
  afstandkm: 'afstand_km',
  afstand: 'afstand_km',
  emailadres: 'email',
  mail: 'email',
  tel: 'telefoon',
  telefoonnummer: 'telefoon',
  url: 'website',
  volgendeactie: 'volgende_actie',
  volgendeactieop: 'volgende_actie_op',
  laatstecontactop: 'laatste_contact_op',
  geschattewaarde: 'geschatte_waarde',
  afgemeldop: 'afgemeld_op',
  afgemeld: 'afgemeld_op',
};

export interface ProspectUitCsv {
  bedrijfsnaam: string;
  segment: string | null;
  plaats: string;
  provincie: string | null;
  website: string | null;
  telefoon: string | null;
  email: string | null;
  contactpersoon: string | null;
  functie: string | null;
  linkedin: string | null;
  omvang: string | null;
  activiteit: string | null;
  aanknopingspunt: string | null;
  signaal: string | null;
  bron: string | null;
  score: number | null;
  scoreReden: string | null;
  afstandKm: number | null;
  status: ProspectStatusNaam | null;
  kanaal: 'MAIL' | 'LINKEDIN' | null;
  afgemeldOp: Date | null;
  volgendeActie: string | null;
  volgendeActieOp: Date | null;
  geschatteWaarde: number | null;
  notities: string | null;
}

export interface CsvLeesResultaat {
  prospects: ProspectUitCsv[];
  /** Regelnummers uit het bestand die niet gelezen konden worden, met reden. */
  fouten: { regel: number; reden: string }[];
  /** Kopjes die de module niet kent en overslaat. */
  onbekendeKolommen: string[];
}

/** Leest een CSV-tekst uit tot prospects. Gooit alleen als de kopregel onbruikbaar is. */
export function leesProspectsCsv(tekst: string): CsvLeesResultaat {
  const rijen = splitsCsv(tekst);
  if (rijen.length === 0) {
    throw new Error('Het bestand is leeg.');
  }

  const koppen = rijen[0].map((k) => {
    const genormaliseerd = normaliseerKop(k);
    return KOP_SYNONIEMEN[genormaliseerd] ?? genormaliseerd;
  });

  if (!koppen.includes('bedrijfsnaam') || !koppen.includes('plaats')) {
    throw new Error('De kopregel mist de kolommen bedrijfsnaam en plaats. Controleer of de eerste regel de kolomnamen bevat.');
  }

  const bekend = new Set<string>([...CSV_KOLOMMEN, ...CSV_EXTRA_KOLOMMEN]);
  const onbekendeKolommen = koppen.filter((k) => k && !bekend.has(k));

  const prospects: ProspectUitCsv[] = [];
  const fouten: { regel: number; reden: string }[] = [];

  for (let i = 1; i < rijen.length; i++) {
    const waarden = rijen[i];
    const rij: CsvRij = {};
    koppen.forEach((kop, k) => { if (kop) rij[kop] = (waarden[k] ?? '').trim(); });

    const bedrijfsnaam = rij.bedrijfsnaam ?? '';
    const plaats = rij.plaats ?? '';
    if (!bedrijfsnaam || !plaats) {
      fouten.push({ regel: i + 1, reden: 'bedrijfsnaam of plaats ontbreekt' });
      continue;
    }

    const statusWaarde = (rij.status || '').toUpperCase();
    const kanaalWaarde = (rij.kanaal || '').toUpperCase();

    prospects.push({
      bedrijfsnaam,
      plaats,
      segment: tekstOfNull(rij.segment),
      provincie: tekstOfNull(rij.provincie),
      website: tekstOfNull(rij.website),
      telefoon: tekstOfNull(rij.telefoon),
      email: tekstOfNull(rij.email),
      contactpersoon: tekstOfNull(rij.contactpersoon),
      functie: tekstOfNull(rij.functie),
      linkedin: tekstOfNull(rij.linkedin),
      omvang: tekstOfNull(rij.omvang),
      activiteit: tekstOfNull(rij.activiteit),
      aanknopingspunt: tekstOfNull(rij.aanknopingspunt),
      signaal: tekstOfNull(rij.signaal),
      bron: tekstOfNull(rij.bron),
      score: geheelGetal(rij.score, 1, 5),
      scoreReden: tekstOfNull(rij.score_reden),
      afstandKm: kommaGetal(rij.afstand_km),
      status: isProspectStatus(statusWaarde) ? statusWaarde : null,
      kanaal: (BENADER_KANALEN as readonly string[]).includes(kanaalWaarde) ? (kanaalWaarde as 'MAIL' | 'LINKEDIN') : null,
      afgemeldOp: datumOfNull(rij.afgemeld_op),
      volgendeActie: tekstOfNull(rij.volgende_actie),
      volgendeActieOp: datumOfNull(rij.volgende_actie_op),
      geschatteWaarde: geheelGetal(rij.geschatte_waarde, 0, 10_000_000),
      notities: tekstOfNull(rij.notities),
    });
  }

  return { prospects, fouten, onbekendeKolommen };
}

function tekstOfNull(waarde?: string): string | null {
  const t = (waarde ?? '').trim();
  return t === '' ? null : t;
}

function geheelGetal(waarde: string | undefined, min: number, max: number): number | null {
  const t = (waarde ?? '').replace(/[^0-9-]/g, '');
  if (t === '') return null;
  const n = parseInt(t, 10);
  if (Number.isNaN(n) || n < min || n > max) return null;
  return n;
}

function kommaGetal(waarde?: string): number | null {
  const t = (waarde ?? '').trim().replace(',', '.').replace(/[^0-9.]/g, '');
  if (t === '') return null;
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

function datumOfNull(waarde?: string): Date | null {
  const t = (waarde ?? '').trim();
  if (!t) return null;
  // dd-mm-jjjj of dd/mm/jjjj
  const nl = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (nl) {
    const d = new Date(Number(nl[3]), Number(nl[2]) - 1, Number(nl[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ---------- Export ---------- */

function csvVeld(waarde: unknown): string {
  if (waarde === null || waarde === undefined) return '';
  const t = String(waarde);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function datumNaarCsv(datum: Date | null): string {
  if (!datum) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${datum.getFullYear()}-${p(datum.getMonth() + 1)}-${p(datum.getDate())}`;
}

export interface ProspectVoorExport {
  bedrijfsnaam: string;
  segment: string | null;
  plaats: string;
  provincie: string | null;
  website: string | null;
  telefoon: string | null;
  email: string | null;
  contactpersoon: string | null;
  functie: string | null;
  linkedin: string | null;
  omvang: string | null;
  activiteit: string | null;
  aanknopingspunt: string | null;
  signaal: string | null;
  bron: string | null;
  score: number | null;
  scoreReden: string | null;
  afstandKm: number | null;
  status: string;
  kanaal: string;
  afgemeldOp: Date | null;
  volgendeActie: string | null;
  volgendeActieOp: Date | null;
  laatsteContactOp: Date | null;
  geschatteWaarde: number | null;
  notities: string | null;
}

/** Zet prospects om naar een CSV-tekst met dezelfde kolommen als de import. */
export function schrijfProspectsCsv(prospects: ProspectVoorExport[]): string {
  const kop = [...CSV_KOLOMMEN, ...CSV_EXTRA_KOLOMMEN].join(',');
  const regels = prospects.map((p) =>
    [
      p.bedrijfsnaam,
      p.segment,
      p.plaats,
      p.provincie,
      p.website,
      p.telefoon,
      p.email,
      p.contactpersoon,
      p.functie,
      p.linkedin,
      p.omvang,
      p.activiteit,
      p.aanknopingspunt,
      p.signaal,
      p.bron,
      p.score,
      p.scoreReden,
      p.afstandKm,
      p.status,
      p.kanaal,
      datumNaarCsv(p.afgemeldOp),
      p.volgendeActie,
      datumNaarCsv(p.volgendeActieOp),
      datumNaarCsv(p.laatsteContactOp),
      p.geschatteWaarde,
      p.notities,
    ]
      .map(csvVeld)
      .join(',')
  );
  return [kop, ...regels].join('\n');
}
