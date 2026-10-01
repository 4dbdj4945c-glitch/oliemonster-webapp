// Werkbon (in de code en database nog Dagrapport): keuzes en rekenregels die de
// server, de schermen en de PDF delen. Geen database, dus ook in de browser te
// gebruiken.
//
// Een werkbon is het verslag van werk ter plaatse. Hij wordt getekend door de
// opdrachtgever (status getekend) of, als de klant geen handtekening vraagt,
// afgerond zonder handtekening (status afgerond). In beide gevallen ligt hij
// daarna vast en staat hij in het klantdossier en het klantportaal.

export type WerkbonStatus = 'concept' | 'afgerond' | 'getekend';
export const WERKBON_STATUSSEN = ['concept', 'afgerond', 'getekend'] as const;
/** Statussen die vastliggen en die de klant in het portaal ziet. */
export const VASTE_STATUSSEN: WerkbonStatus[] = ['afgerond', 'getekend'];

export const STATUS_LABEL: Record<WerkbonStatus, string> = {
  concept: 'Concept',
  afgerond: 'Afgerond',
  getekend: 'Getekend',
};

/** WB-12, voor op het scherm en in de PDF. */
export function werkbonNummer(id: number): string {
  return `WB-${id}`;
}

export const SOORTEN_WERK = [
  { waarde: 'onderhoud', label: 'Onderhoud' },
  { waarde: 'storing', label: 'Storing' },
  { waarde: 'reparatie', label: 'Reparatie' },
  { waarde: 'inspectie', label: 'Inspectie of keuring' },
  { waarde: 'montage', label: 'Montage of installatie' },
  { waarde: 'oliemonsters', label: 'Oliemonsters' },
  { waarde: 'overig', label: 'Overig' },
] as const;
export type SoortWerk = (typeof SOORTEN_WERK)[number]['waarde'];
export const SOORT_WERK_WAARDEN = SOORTEN_WERK.map((s) => s.waarde) as [SoortWerk, ...SoortWerk[]];

export function soortWerkLabel(waarde: string | null | undefined): string | null {
  return SOORTEN_WERK.find((s) => s.waarde === waarde)?.label ?? null;
}

/** uren: alleen een totaal; tijden: begin, eind en pauze; nvt: geen urenafspraak. */
export type Tijdsoort = 'uren' | 'tijden' | 'nvt';
export const TIJDSOORTEN = ['uren', 'tijden', 'nvt'] as const;

export interface Materiaal {
  omschrijving: string;
  aantal: number | null;
  eenheid: string | null;
  artikelnummer: string | null;
}

/** "07:30" als minuten na middernacht, of null. */
export function klokMinuten(tijd: string | null | undefined): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(tijd ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Gewerkte minuten uit begin, eind en pauze. Null als begin of eind ontbreekt
 * of als de pauze langer is dan de tijd ertussen. Eind voor begin = over
 * middernacht (nachtstoring).
 */
export function minutenUitTijden(begin: string | null | undefined, eind: string | null | undefined, pauze: number | null | undefined): number | null {
  const b = klokMinuten(begin);
  const e = klokMinuten(eind);
  if (b === null || e === null) return null;
  const duur = (e - b + 24 * 60) % (24 * 60);
  const netto = duur - (pauze ?? 0);
  return netto >= 0 ? netto : null;
}

/** 150 als "2,5 uur", 45 als "45 minuten", null als "-". */
export function duurTekst(minuten: number | null | undefined): string {
  if (minuten === null || minuten === undefined) return '-';
  if (minuten < 60) return `${minuten} minuten`;
  const uren = Math.round((minuten / 60) * 100) / 100;
  return `${uren.toLocaleString('nl-NL')} uur`;
}

/** De gewerkte tijd zoals op de werkbon: "07:30 tot 16:00, 30 min pauze (8 uur)", "2,5 uur" of "n.v.t.". */
export function werktijdTekst(w: { tijdsoort: string; minuten: number | null; beginTijd: string | null; eindTijd: string | null; pauzeMinuten: number | null }): string {
  if (w.tijdsoort === 'nvt') return 'n.v.t.';
  if (w.tijdsoort === 'tijden' && w.beginTijd && w.eindTijd) {
    const pauze = w.pauzeMinuten ? `, ${w.pauzeMinuten} min pauze` : '';
    return `${w.beginTijd} tot ${w.eindTijd}${pauze} (${duurTekst(w.minuten)})`;
  }
  return duurTekst(w.minuten);
}

/** "3 st", "2,5 l": aantal en eenheid samen, of leeg. */
export function aantalTekst(m: Pick<Materiaal, 'aantal' | 'eenheid'>): string {
  if (m.aantal === null) return m.eenheid ?? '';
  return [m.aantal.toLocaleString('nl-NL'), m.eenheid].filter(Boolean).join(' ');
}
