// Rekenen voor de inspecties: kosten en CO2 van persluchtlekken, totalen per
// inspectie, samenvattingen en de volgende inspectiedatum. Eén plek, zodat het
// invulscherm, het overzicht, het klantportaal en het rapport hetzelfde zeggen.
// Geen server-imports: dit bestand draait ook in de browser.

import { checklistVan, getal, leesInstellingen, sjabloonVan, type Instellingen, type SjabloonSleutel } from './sjablonen';

// ------------------------------------------------------------------
// Persluchtlekken
// ------------------------------------------------------------------

/** Rendement van een gemiddelde compressor, voor de energie per m3 als die niet is ingevuld. */
export const COMPRESSOR_RENDEMENT = 0.7;
const ATMOSFEER_BAR = 1.013;
const KAPPA = 1.4;

/**
 * Energie om 1 m3 vrije lucht op netdruk (bar overdruk) te brengen, in kWh.
 * Adiabatische compressie gedeeld door het rendement: bij 7 bar ongeveer
 * 0,11 kWh per m3, wat past bij de vuistregel uit de branche (0,1 tot 0,12).
 */
export function energiePerM3(drukBar: number, rendement = COMPRESSOR_RENDEMENT): number {
  const verhouding = (drukBar + ATMOSFEER_BAR) / ATMOSFEER_BAR;
  const arbeidJ = (KAPPA / (KAPPA - 1)) * ATMOSFEER_BAR * 1e5 * (verhouding ** ((KAPPA - 1) / KAPPA) - 1);
  return arbeidJ / 3.6e6 / rendement;
}

export interface LekBerekening {
  m3PerJaar: number;
  kwhPerJaar: number;
  kostenPerJaar: number;
  co2KgPerJaar: number;
}

/** De instellingen van een lekkeninspectie als getallen, met de standaardwaarden. */
export function lekInstellingen(ruw: unknown) {
  const i = leesInstellingen(sjabloonVan('persluchtlekken'), ruw);
  const drukBar = Number(i.drukBar ?? 7);
  const kwhPerM3 = typeof i.kwhPerM3 === 'number' ? i.kwhPerM3 : energiePerM3(drukBar);
  return {
    drukBar,
    draaiuren: Number(i.draaiuren ?? 2000),
    prijsmodel: i.prijsmodel === 'm3' ? ('m3' as const) : ('kwh' as const),
    prijsKwh: Number(i.prijsKwh ?? 0.25),
    prijsM3: Number(i.prijsM3 ?? 0.025),
    kwhPerM3,
    kwhPerM3Berekend: typeof i.kwhPerM3 !== 'number',
    co2PerKwh: Number(i.co2PerKwh ?? 0.268),
  };
}
export type LekInstellingen = ReturnType<typeof lekInstellingen>;

/** Kosten en CO2 per jaar van één lek, uit het verlies in liter per minuut. */
export function berekenLek(verliesLpm: number | null, inst: LekInstellingen): LekBerekening {
  const lpm = verliesLpm ?? 0;
  const m3PerJaar = (lpm * 60 * inst.draaiuren) / 1000;
  const kwhPerJaar = m3PerJaar * inst.kwhPerM3;
  const kostenPerJaar = inst.prijsmodel === 'm3' ? m3PerJaar * inst.prijsM3 : kwhPerJaar * inst.prijsKwh;
  return { m3PerJaar, kwhPerJaar, kostenPerJaar, co2KgPerJaar: kwhPerJaar * inst.co2PerKwh };
}

export interface LekItem {
  waarden: unknown;
  gerepareerd: boolean;
}

export interface LekTotalen {
  aantal: number;
  gerepareerd: number;
  verliesLpm: number;
  m3PerJaar: number;
  kostenPerJaar: number;
  co2KgPerJaar: number;
  /** Wat de gerepareerde lekken per jaar schelen. */
  besparingKosten: number;
  besparingCo2Kg: number;
  /** Wat er nog te halen is met de lekken die nog open staan. */
  openKosten: number;
  openCo2Kg: number;
}

export function lekTotalen(items: LekItem[], inst: LekInstellingen): LekTotalen {
  const t: LekTotalen = {
    aantal: items.length,
    gerepareerd: 0,
    verliesLpm: 0,
    m3PerJaar: 0,
    kostenPerJaar: 0,
    co2KgPerJaar: 0,
    besparingKosten: 0,
    besparingCo2Kg: 0,
    openKosten: 0,
    openCo2Kg: 0,
  };
  for (const item of items) {
    const lpm = getal(item.waarden, 'verliesLpm');
    const b = berekenLek(lpm, inst);
    t.verliesLpm += lpm ?? 0;
    t.m3PerJaar += b.m3PerJaar;
    t.kostenPerJaar += b.kostenPerJaar;
    t.co2KgPerJaar += b.co2KgPerJaar;
    if (item.gerepareerd) {
      t.gerepareerd += 1;
      t.besparingKosten += b.kostenPerJaar;
      t.besparingCo2Kg += b.co2KgPerJaar;
    } else {
      t.openKosten += b.kostenPerJaar;
      t.openCo2Kg += b.co2KgPerJaar;
    }
  }
  return t;
}

// ------------------------------------------------------------------
// Arbeidsmiddelen
// ------------------------------------------------------------------

export interface ArbeidsmiddelTelling {
  aantal: number;
  'in-orde': number;
  'actie-nodig': number;
  'buiten-gebruik': number;
  zonderUitslag: number;
}

export function arbeidsmiddelTelling(items: { oordeel: string | null }[]): ArbeidsmiddelTelling {
  const t: ArbeidsmiddelTelling = { aantal: items.length, 'in-orde': 0, 'actie-nodig': 0, 'buiten-gebruik': 0, zonderUitslag: 0 };
  for (const i of items) {
    if (i.oordeel === 'in-orde' || i.oordeel === 'actie-nodig' || i.oordeel === 'buiten-gebruik') t[i.oordeel] += 1;
    else t.zonderUitslag += 1;
  }
  return t;
}

/** Hoeveel checklistpunten staan op niet goed? */
export function aantalNietGoed(waarden: unknown): number {
  return Object.values(checklistVan(waarden)).filter((a) => a === 'niet-goed').length;
}

// ------------------------------------------------------------------
// Voor alle sjablonen
// ------------------------------------------------------------------

/** Een bedrag in hele euro's: "€ 1.234". */
export function euro(n: number): string {
  return `€ ${Math.round(n).toLocaleString('nl-NL')}`;
}

/** Een getal met hoogstens `d` decimalen, Nederlands geschreven. */
export function nl(n: number, d = 0): string {
  return n.toLocaleString('nl-NL', { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

/** CO2 in kg, of in ton vanaf 1.000 kg. */
export function co2Tekst(kg: number): string {
  return kg >= 1000 ? `${nl(kg / 1000, 1)} ton CO2` : `${nl(kg)} kg CO2`;
}

export interface SamenvatItem {
  oordeel: string | null;
  waarden: unknown;
  gerepareerd: boolean;
  volgendeOp?: string | Date | null;
}

/** Eén regel over de uitkomst, voor het overzicht, de tijdlijn en het klantportaal. */
export function uitkomstTekst(sjabloon: SjabloonSleutel, items: SamenvatItem[], instellingen: unknown): string {
  if (sjabloon === 'persluchtlekken') {
    const t = lekTotalen(items, lekInstellingen(instellingen));
    if (t.aantal === 0) return 'Geen lekken gevonden';
    const delen = [`${t.aantal} ${t.aantal === 1 ? 'lek' : 'lekken'}`, `${euro(t.kostenPerJaar)} per jaar`, co2Tekst(t.co2KgPerJaar) + ' per jaar'];
    if (t.gerepareerd > 0) delen.push(`${t.gerepareerd} gerepareerd`);
    return delen.join(', ');
  }
  const t = arbeidsmiddelTelling(items);
  if (t.aantal === 0) return 'Nog geen arbeidsmiddelen';
  const delen = [`${t.aantal} ${t.aantal === 1 ? 'arbeidsmiddel' : 'arbeidsmiddelen'}`];
  if (t['in-orde']) delen.push(`${t['in-orde']} in orde`);
  if (t['actie-nodig']) delen.push(`${t['actie-nodig']} actie nodig`);
  if (t['buiten-gebruik']) delen.push(`${t['buiten-gebruik']} buiten gebruik`);
  return delen.join(', ');
}

function alsDag(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/**
 * De volgende inspectie (jjjj-mm-dd): bij arbeidsmiddelen de vroegste datum van
 * de arbeidsmiddelen, anders de datum van de inspectie zelf.
 */
export function volgendeInspectie(
  sjabloon: SjabloonSleutel,
  volgendeOp: string | Date | null | undefined,
  items: { volgendeOp?: string | Date | null }[]
): string | null {
  if (sjabloonVan(sjabloon).volgendePerItem) {
    const dagen = items.map((i) => alsDag(i.volgendeOp)).filter((d): d is string => !!d).sort();
    if (dagen.length > 0) return dagen[0];
  }
  return alsDag(volgendeOp);
}

export type { Instellingen };
