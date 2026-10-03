// De sjablonen van de inspectie-engine, als configuratie in code. Een nieuw
// sjabloon: voeg hier een object aan SJABLONEN toe (velden, oordelen, checklist,
// instellingen, rapporttekst). Het model in de database (Inspectie en
// InspectieItem) blijft hetzelfde; sjabloonspecifieke getallen staan als JSON in
// `instellingen` en `waarden`, en de API controleert ze met leesWaarden() en
// leesInstellingen() hieronder.
//
// Rekenen (kosten, CO2, totalen): lib/inspecties/rekenen.ts.
// Geen server-imports: dit bestand draait ook in de browser.

import type { IconNaam } from '@/app/components/ui';
import { documentNummer, type Genummerd } from '../nummering';

export type SjabloonSleutel = 'persluchtlekken' | 'arbeidsmiddelen' | 'markering';
export const SJABLOON_SLEUTELS = ['persluchtlekken', 'arbeidsmiddelen', 'markering'] as const satisfies readonly SjabloonSleutel[];

export type InspectieStatus = 'concept' | 'afgerond';
export const INSPECTIE_STATUSSEN = ['concept', 'afgerond'] as const;
export const INSPECTIE_STATUS_LABELS: Record<InspectieStatus, string> = { concept: 'Concept', afgerond: 'Afgerond' };
export const INSPECTIE_STATUS_BADGE: Record<InspectieStatus, string> = { concept: 'badge-gray', afgerond: 'badge-success' };

export interface Keuze {
  waarde: string;
  label: string;
  badge: string;
  icoon: IconNaam;
}

/** Een getal per bevinding of in de instellingen. */
export interface GetalVeld {
  soort: 'getal';
  sleutel: string;
  label: string;
  /** Korte naam voor een tabelkop in het rapport. */
  kort?: string;
  eenheid?: string;
  min: number;
  max: number;
  /** Aantal decimalen dat bewaard wordt. */
  decimalen: number;
  hint?: string;
  standaard?: number | null;
}

export interface KeuzeVeld {
  soort: 'keuze';
  sleutel: string;
  label: string;
  keuzes: { waarde: string; label: string }[];
  standaard: string;
  hint?: string;
}

export interface TekstVeld {
  soort: 'tekst';
  sleutel: string;
  label: string;
  standaard: string;
  hint?: string;
}

export type InstellingVeld = GetalVeld | KeuzeVeld | TekstVeld;

export interface ChecklistPunt {
  sleutel: string;
  label: string;
}

export type ChecklistAntwoord = 'goed' | 'niet-goed' | 'nvt';
export const CHECKLIST_ANTWOORDEN: { waarde: ChecklistAntwoord; label: string }[] = [
  { waarde: 'goed', label: 'Goed' },
  { waarde: 'niet-goed', label: 'Niet goed' },
  { waarde: 'nvt', label: 'N.v.t.' },
];

export interface Sjabloon {
  sleutel: SjabloonSleutel;
  naam: string;
  /** Een zin voor in het overzicht en bij Nieuwe inspectie. */
  beschrijving: string;
  icoon: IconNaam;
  item: {
    enkel: string;
    meervoud: string;
    /** Tekst op de grote knop, bijvoorbeeld "Lek toevoegen". */
    nieuw: string;
    /** Label van het titelveld. */
    titel: string;
    titelHint: string;
    /** Een bevinding hoort bij een arbeidsmiddel uit de installaties. */
    kiesInstallatie: boolean;
  };
  /**
   * `standaard` is het oordeel van een nieuwe bevinding. null = geen: je moet
   * zelf kiezen (arbeidsmiddelen, zodat er nooit vanzelf In orde in een rapport staat).
   */
  oordeel: {
    label: string;
    keuzes: Keuze[];
    standaard: string | null;
    /** De keuze voor iets dat bewust is overgeslagen, voor de melding bij afronden (Niet gecontroleerd). */
    overslaan?: string;
  };
  /** Afronden kan pas als elke bevinding een oordeel heeft. */
  oordeelVerplicht: boolean;
  /** Getallen per bevinding, in `waarden`. */
  meetwaarden: GetalVeld[];
  checklist: ChecklistPunt[];
  instellingen: InstellingVeld[];
  /** Gerepareerd ja of nee, met datum. */
  reparatie: boolean;
  /** Elke bevinding heeft een eigen datum voor de volgende inspectie. */
  volgendePerItem: boolean;
  /**
   * Heeft dit sjabloon een volgende inspectie? Nee bij eenmalig werk zoals
   * markeren: dan geen datum op de schermen, in het rapport en in het klantportaal.
   */
  heeftVolgende: boolean;
  /** Voorstel voor de volgende inspectie, in maanden na de inspectiedatum (alleen met heeftVolgende). */
  volgendeNaMaanden: number;
  rapport: {
    titel: string;
    /** Vaste tekst in het rapport, met de instellingen ingevuld. */
    verklaring?: (instellingen: Instellingen) => string;
  };
}

export type Instellingen = Record<string, number | string | null>;
export type Waarden = { [sleutel: string]: number | null | Record<string, ChecklistAntwoord> | undefined; checklist?: Record<string, ChecklistAntwoord> };

// ------------------------------------------------------------------
// Eigen titel (alle sjablonen)
// ------------------------------------------------------------------

/**
 * Elke inspectie kan een eigen titel krijgen, bijvoorbeeld "Opleverrapport
 * aanbrengen asbestmarkeringen". Die staat in de instellingen onder `titel` en
 * komt op het scherm, in het overzicht, in het klantportaal en als kop van het
 * rapport. Leeg: de naam van het sjabloon en de standaardtitel van het rapport.
 */
function titelVeld(standaard: string): TekstVeld {
  return { soort: 'tekst', sleutel: 'titel', label: 'Titel van het rapport', standaard: '', hint: `Leeg laten: ${standaard}` };
}

/** De titel die de gebruiker zelf gaf, of null. */
export function eigenTitel(instellingen: unknown): string | null {
  const t = instellingen && typeof instellingen === 'object' ? (instellingen as Record<string, unknown>).titel : null;
  return typeof t === 'string' && t.trim() ? t.trim().slice(0, 200) : null;
}

/** De naam van een inspectie op het scherm: de eigen titel, anders de naam van het sjabloon. */
export function inspectieTitel(sjabloon: string, instellingen: unknown): string {
  return eigenTitel(instellingen) ?? sjabloonVan(sjabloon).naam;
}

/** De kop van het rapport: de eigen titel, anders de standaardtitel van het sjabloon. */
export function rapportTitel(sjabloon: string, instellingen: unknown): string {
  return eigenTitel(instellingen) ?? sjabloonVan(sjabloon).rapport.titel;
}

// ------------------------------------------------------------------
// Persluchtlekken
// ------------------------------------------------------------------

const PERSLUCHTLEKKEN: Sjabloon = {
  sleutel: 'persluchtlekken',
  naam: 'Persluchtlekken',
  beschrijving: 'Lekken in het persluchtnet opsporen, labelen en omrekenen naar kosten en CO2 per jaar',
  icoon: 'air-leak',
  item: {
    enkel: 'lek',
    meervoud: 'lekken',
    nieuw: 'Lek toevoegen',
    titel: 'Labelnummer',
    titelHint: 'Het nummer op het lekkagelabel',
    kiesInstallatie: false,
  },
  oordeel: {
    label: 'Prioriteit',
    standaard: 'middel',
    keuzes: [
      { waarde: 'hoog', label: 'Hoog', badge: 'badge-warning', icoon: 'alert-warning' },
      { waarde: 'middel', label: 'Middel', badge: 'badge-info', icoon: 'alert-info' },
      { waarde: 'laag', label: 'Laag', badge: 'badge-gray', icoon: 'status-round-open' },
    ],
  },
  oordeelVerplicht: false,
  meetwaarden: [
    { soort: 'getal', sleutel: 'db', label: 'Geluid', eenheid: 'dB', min: 0, max: 150, decimalen: 0, hint: 'Van de ultrasone lekdetector' },
    { soort: 'getal', sleutel: 'verliesLpm', label: 'Geschat verlies', eenheid: 'l/min', min: 0, max: 10000, decimalen: 1, hint: 'Vrije lucht per minuut' },
  ],
  checklist: [],
  instellingen: [
    titelVeld('Rapport persluchtlekken'),
    { soort: 'getal', sleutel: 'drukBar', label: 'Netdruk', eenheid: 'bar', min: 0.5, max: 40, decimalen: 1, standaard: 7 },
    { soort: 'getal', sleutel: 'draaiuren', label: 'Draaiuren per jaar', eenheid: 'uur', min: 1, max: 8760, decimalen: 0, standaard: 2000, hint: 'Uren per jaar dat het net onder druk staat. 2.000 is één ploeg.' },
    {
      soort: 'keuze',
      sleutel: 'prijsmodel',
      label: 'Kosten rekenen met',
      standaard: 'kwh',
      keuzes: [
        { waarde: 'kwh', label: 'Prijs per kWh' },
        { waarde: 'm3', label: 'Prijs per m3 perslucht' },
      ],
    },
    { soort: 'getal', sleutel: 'prijsKwh', label: 'Prijs per kWh', eenheid: 'euro', min: 0, max: 5, decimalen: 3, standaard: 0.25 },
    { soort: 'getal', sleutel: 'prijsM3', label: 'Prijs per m3', eenheid: 'euro', min: 0, max: 5, decimalen: 3, standaard: 0.025 },
    {
      soort: 'getal',
      sleutel: 'kwhPerM3',
      label: 'Energie per m3',
      eenheid: 'kWh',
      min: 0.01,
      max: 2,
      decimalen: 3,
      standaard: null,
      hint: 'Leeg: uitgerekend uit de netdruk (compressor met 70 procent rendement).',
    },
    {
      soort: 'getal',
      sleutel: 'co2PerKwh',
      label: 'CO2 per kWh',
      eenheid: 'kg',
      min: 0,
      max: 2,
      decimalen: 3,
      standaard: 0.268,
      hint: 'Stroom onbekend, CO2emissiefactoren.nl 2025. Groene stroom: vul de factor van de leverancier in.',
    },
  ],
  reparatie: true,
  volgendePerItem: false,
  heeftVolgende: true,
  volgendeNaMaanden: 12,
  rapport: { titel: 'Rapport persluchtlekken' },
};

// ------------------------------------------------------------------
// Inspectie arbeidsmiddelen (hydrauliek en pneumatiek)
// ------------------------------------------------------------------

/** Vanaf deze grenzen geldt een luchtketel als aangewezen drukapparatuur (Wrda 2016, art. 3). */
export const LUCHTKETEL_MAX_LITER = 2500;
export const LUCHTKETEL_MAX_BAR = 30;

/**
 * De tekst uit het juridisch onderzoek (portaal-plan/05-juridisch/keuring-arbeidsmiddelen.md,
 * punt 4), letterlijk. Alleen [norm/fabrieksvoorschrift] wordt ingevuld.
 */
export function verklaringArbeidsmiddelen(norm: string): string {
  return (
    `Inspectierapport technische staat, uitgevoerd door een vakbekwaam monteur hydrauliek/pneumatiek volgens ${norm}. ` +
    'Dit rapport kan dienen als schriftelijk bewijsstuk van een keuring door een deskundige zoals bedoeld in art. 7.4a Arbobesluit. ' +
    'Het is geen keuring door een aangewezen instelling (NL-CBI) en geen gecertificeerde keuring (SCIOS).'
  );
}

export const STANDAARD_NORM = 'NEN-EN-ISO 4413 (hydrauliek), NEN-EN-ISO 4414 (pneumatiek) en het voorschrift van de fabrikant';

const ARBEIDSMIDDELEN: Sjabloon = {
  sleutel: 'arbeidsmiddelen',
  naam: 'Inspectie arbeidsmiddelen',
  beschrijving: 'Hydraulische en pneumatische arbeidsmiddelen nalopen met een checklist, uitslag en volgende inspectie',
  icoon: 'hydraulic-cylinder',
  item: {
    enkel: 'arbeidsmiddel',
    meervoud: 'arbeidsmiddelen',
    nieuw: 'Arbeidsmiddel toevoegen',
    titel: 'Arbeidsmiddel',
    titelHint: 'Bijvoorbeeld Kantpers 1 of Compressor hal 2',
    kiesInstallatie: true,
  },
  oordeel: {
    label: 'Uitslag',
    standaard: null,
    keuzes: [
      { waarde: 'in-orde', label: 'In orde', badge: 'badge-success', icoon: 'status-taken' },
      { waarde: 'actie-nodig', label: 'Actie nodig', badge: 'badge-warning', icoon: 'alert-warning' },
      { waarde: 'buiten-gebruik', label: 'Buiten gebruik', badge: 'badge-danger', icoon: 'status-cancelled' },
      // Bewust overgeslagen (niet bereikbaar, niet in bedrijf): staat in het
      // rapport apart, buiten de verklaring van art. 7.4a.
      { waarde: 'niet-gecontroleerd', label: 'Niet gecontroleerd', badge: 'badge-gray', icoon: 'status-round-open' },
    ],
    overslaan: 'niet-gecontroleerd',
  },
  oordeelVerplicht: true,
  meetwaarden: [
    { soort: 'getal', sleutel: 'werkdrukBar', label: 'Werkdruk', eenheid: 'bar', min: 0, max: 1000, decimalen: 1 },
    { soort: 'getal', sleutel: 'ketelLiter', label: 'Luchtketel, inhoud', eenheid: 'liter', min: 0, max: 100000, decimalen: 0, hint: 'Alleen bij een luchtketel' },
    { soort: 'getal', sleutel: 'ketelBar', label: 'Luchtketel, maximale druk (PS)', eenheid: 'bar', min: 0, max: 1000, decimalen: 1, hint: 'Van het typeplaatje' },
  ],
  checklist: [
    { sleutel: 'slangen', label: 'Slangen en koppelingen zonder schade, niet te oud' },
    { sleutel: 'lekkage', label: 'Geen lekkage van olie of lucht' },
    { sleutel: 'leidingen', label: 'Leidingen en bevestigingen vast' },
    { sleutel: 'beveiliging', label: 'Drukbeveiliging en veiligheidsventiel werken' },
    { sleutel: 'manometer', label: 'Manometer aanwezig en leesbaar' },
    { sleutel: 'bediening', label: 'Noodstop en bediening werken' },
    { sleutel: 'afscherming', label: 'Afschermingen en kappen op hun plaats' },
    { sleutel: 'olie', label: 'Olieniveau en olie in orde, of condensaat afgetapt' },
    { sleutel: 'filters', label: 'Filters in orde' },
    { sleutel: 'markering', label: 'Typeplaatje en markeringen leesbaar' },
  ],
  instellingen: [
    titelVeld('Inspectierapport technische staat'),
    { soort: 'tekst', sleutel: 'norm', label: 'Volgens norm of voorschrift', standaard: STANDAARD_NORM, hint: 'Komt letterlijk in de verklaring in het rapport.' },
  ],
  reparatie: false,
  volgendePerItem: true,
  heeftVolgende: true,
  volgendeNaMaanden: 12,
  rapport: {
    titel: 'Inspectierapport technische staat',
    verklaring: (i) => verklaringArbeidsmiddelen(String(i.norm || STANDAARD_NORM)),
  },
};

// ------------------------------------------------------------------
// Markering (locaties of bronnen markeren met stickers of borden)
// ------------------------------------------------------------------

/**
 * De vaste tekst in het opleverrapport. Zonder opdracht valt dat deel weg,
 * zonder soort markering staat er "markering".
 */
export function verklaringMarkering(i: Instellingen): string {
  const soort = String(i.markering ?? '').trim() || 'markering';
  const opdracht = String(i.opdracht ?? '').trim();
  return (
    `Op de locaties in dit rapport is een ${soort.charAt(0).toLowerCase()}${soort.slice(1)} aangebracht${opdracht ? ` zoals gevraagd in ${opdracht}` : ''}. ` +
    "Per locatie staan de uitslag en de foto's die ter plekke zijn gemaakt."
  );
}

const MARKERING: Sjabloon = {
  sleutel: 'markering',
  naam: 'Markering',
  beschrijving: "Locaties of bronnen markeren met stickers of borden en dat met foto's vastleggen",
  icoon: 'tag',
  item: {
    enkel: 'locatie',
    meervoud: 'locaties',
    nieuw: 'Locatie toevoegen',
    titel: 'Bron of omschrijving',
    titelHint: 'Bijvoorbeeld Bron 6: pakkingen',
    kiesInstallatie: false,
  },
  oordeel: {
    label: 'Uitslag',
    standaard: null,
    keuzes: [
      { waarde: 'gemarkeerd', label: 'Gemarkeerd', badge: 'badge-success', icoon: 'status-taken' },
      { waarde: 'niet-bereikbaar', label: 'Niet bereikbaar', badge: 'badge-warning', icoon: 'alert-warning' },
      { waarde: 'niet-aangetroffen', label: 'Niet aangetroffen', badge: 'badge-gray', icoon: 'search' },
    ],
    overslaan: 'niet-bereikbaar',
  },
  oordeelVerplicht: true,
  meetwaarden: [{ soort: 'getal', sleutel: 'stickers', label: 'Aantal stickers geplakt', kort: 'Stickers', min: 0, max: 1000, decimalen: 0 }],
  checklist: [],
  instellingen: [
    titelVeld('Opleverrapport markering'),
    {
      soort: 'tekst',
      sleutel: 'opdracht',
      label: 'Opdracht of referentie',
      standaard: '',
      hint: 'Bijvoorbeeld het rapport of de werkorder van de klant waar deze markering uit volgt',
    },
    { soort: 'tekst', sleutel: 'markering', label: 'Soort markering', standaard: 'Waarschuwingssticker' },
    { soort: 'tekst', sleutel: 'tav', label: 'Ter attentie van', standaard: '' },
  ],
  reparatie: false,
  volgendePerItem: false,
  heeftVolgende: false,
  volgendeNaMaanden: 0,
  rapport: { titel: 'Opleverrapport markering', verklaring: verklaringMarkering },
};

export const SJABLONEN: Record<SjabloonSleutel, Sjabloon> = {
  persluchtlekken: PERSLUCHTLEKKEN,
  arbeidsmiddelen: ARBEIDSMIDDELEN,
  markering: MARKERING,
};

export function sjabloonVan(sleutel: string): Sjabloon {
  const s = SJABLONEN[sleutel as SjabloonSleutel];
  if (!s) throw new Error(`Onbekend sjabloon ${sleutel}`);
  return s;
}

export function isSjabloon(sleutel: string): sleutel is SjabloonSleutel {
  return (SJABLOON_SLEUTELS as readonly string[]).includes(sleutel);
}

export function oordeelVan(sjabloon: Sjabloon, waarde: string | null | undefined): Keuze | null {
  return sjabloon.oordeel.keuzes.find((k) => k.waarde === waarde) ?? null;
}

// ------------------------------------------------------------------
// Instellingen en waarden lezen (server en browser)
// ------------------------------------------------------------------

function rond(n: number, decimalen: number): number {
  const f = 10 ** decimalen;
  return Math.round(n * f) / f;
}

/** Een getal uit een veld: "7,5" en 7.5 mogen allebei. Leeg = null, onleesbaar = NaN. */
export function leesGetal(w: unknown): number | null {
  if (w === undefined || w === null) return null;
  if (typeof w === 'number') return w;
  if (typeof w === 'string') {
    const t = w.trim().replace(/\s/g, '').replace(',', '.');
    if (t === '') return null;
    return Number(t);
  }
  return NaN;
}

/** Een of meer velden kloppen niet. `velden` heeft per veld de melding, `message` is de eerste. */
export class WaardeFout extends Error {
  public velden: Record<string, string>;
  constructor(public veld: string, melding: string, velden?: Record<string, string>) {
    super(melding);
    this.velden = velden ?? { [veld]: melding };
  }
}

/** Werk uitvoeren per veld en alle fouten samen melden, niet één per keer. */
function verzamel(stappen: (() => void)[]) {
  const velden: Record<string, string> = {};
  for (const stap of stappen) {
    try {
      stap();
    } catch (e) {
      if (!(e instanceof WaardeFout)) throw e;
      Object.assign(velden, e.velden);
    }
  }
  const namen = Object.keys(velden);
  if (namen.length > 0) throw new WaardeFout(namen[0], velden[namen[0]], velden);
}

function leesGetalVeld(v: GetalVeld, ruw: unknown): number | null {
  const n = leesGetal(ruw);
  if (n === null) return null;
  if (!Number.isFinite(n) || n < v.min || n > v.max) {
    const eenheid = v.eenheid ? ` ${v.eenheid}` : '';
    throw new WaardeFout(v.sleutel, `${v.label}: vul een getal in tussen ${v.min.toLocaleString('nl-NL')} en ${v.max.toLocaleString('nl-NL')}${eenheid}`);
  }
  return rond(n, v.decimalen);
}

/** De instellingen van een inspectie: alles wat ontbreekt krijgt de standaardwaarde. */
export function leesInstellingen(sjabloon: Sjabloon, ruw: unknown): Instellingen {
  const bron = (ruw && typeof ruw === 'object' ? ruw : {}) as Record<string, unknown>;
  const uit: Instellingen = {};
  for (const v of sjabloon.instellingen) {
    const w = bron[v.sleutel];
    if (v.soort === 'getal') {
      const n = w === undefined ? v.standaard ?? null : leesGetalVeld(v, w);
      uit[v.sleutel] = n;
    } else if (v.soort === 'keuze') {
      const k = typeof w === 'string' && v.keuzes.some((x) => x.waarde === w) ? w : w === undefined || w === null || w === '' ? v.standaard : null;
      if (k === null) throw new WaardeFout(v.sleutel, `${v.label}: kies een van de mogelijkheden`);
      uit[v.sleutel] = k;
    } else {
      const t = typeof w === 'string' ? w.trim().slice(0, 500) : '';
      uit[v.sleutel] = t || v.standaard;
    }
  }
  return uit;
}

/** De meetwaarden en checklist van een bevinding. Onbekende sleutels vallen weg. */
export function leesWaarden(sjabloon: Sjabloon, ruw: unknown): Waarden {
  const bron = (ruw && typeof ruw === 'object' ? ruw : {}) as Record<string, unknown>;
  const uit: Waarden = {};
  const stappen: (() => void)[] = sjabloon.meetwaarden.map((v) => () => {
    uit[v.sleutel] = leesGetalVeld(v, bron[v.sleutel]);
  });
  const checklist: Record<string, ChecklistAntwoord> = {};
  const lijst = (bron.checklist && typeof bron.checklist === 'object' ? bron.checklist : {}) as Record<string, unknown>;
  for (const p of sjabloon.checklist) {
    stappen.push(() => {
      const a = lijst[p.sleutel];
      if (a === undefined || a === null || a === '') return;
      if (a !== 'goed' && a !== 'niet-goed' && a !== 'nvt') throw new WaardeFout(`checklist.${p.sleutel}`, `${p.label}: kies goed, niet goed of n.v.t.`);
      checklist[p.sleutel] = a;
    });
  }
  verzamel(stappen);
  if (sjabloon.checklist.length > 0) uit.checklist = checklist;
  return uit;
}

/**
 * Mag dit oordeel bij deze waarden? In orde kan bij een sjabloon met een
 * checklist pas als elk controlepunt beantwoord is en er geen op niet goed
 * staat. null = in orde, anders de melding.
 */
export function oordeelFout(sjabloon: Sjabloon, oordeel: string | null | undefined, waarden: unknown): string | null {
  if (oordeel !== 'in-orde' || sjabloon.checklist.length === 0) return null;
  const c = checklistVan(waarden);
  const open = sjabloon.checklist.filter((p) => !c[p.sleutel]).length;
  if (open > 0) return `In orde kan pas als alle controlepunten zijn beantwoord. Nog ${open} ${open === 1 ? 'punt' : 'punten'} open.`;
  if (sjabloon.checklist.some((p) => c[p.sleutel] === 'niet-goed')) return 'Een controlepunt staat op niet goed. Kies Actie nodig of Buiten gebruik.';
  return null;
}

/** Is elk controlepunt van de checklist beantwoord (goed, niet goed of n.v.t.)? Zonder checklist: ja. */
export function checklistVolledig(sjabloon: Sjabloon, waarden: unknown): boolean {
  const c = checklistVan(waarden);
  return sjabloon.checklist.every((p) => !!c[p.sleutel]);
}

/** Een getal uit de waarden, of null. */
export function getal(waarden: unknown, sleutel: string): number | null {
  const w = (waarden && typeof waarden === 'object' ? (waarden as Record<string, unknown>)[sleutel] : null) ?? null;
  return typeof w === 'number' && Number.isFinite(w) ? w : null;
}

export function checklistVan(waarden: unknown): Record<string, ChecklistAntwoord> {
  const c = waarden && typeof waarden === 'object' ? (waarden as Record<string, unknown>).checklist : null;
  return c && typeof c === 'object' ? (c as Record<string, ChecklistAntwoord>) : {};
}

/**
 * Waarschuwing bij een luchtketel boven 2.500 liter of vanaf 30 bar: dan is de
 * ketel aangewezen drukapparatuur en hoort de keuring bij een aangewezen
 * instelling (NL-CBI). Precies 30 bar telt voor de zekerheid mee.
 */
export function luchtketelWaarschuwing(waarden: unknown): string | null {
  const liter = getal(waarden, 'ketelLiter');
  const bar = getal(waarden, 'ketelBar');
  const teGroot = liter !== null && liter > LUCHTKETEL_MAX_LITER;
  const teHoog = bar !== null && bar >= LUCHTKETEL_MAX_BAR;
  if (!teGroot && !teHoog) return null;
  const waarom = [teGroot ? `${liter!.toLocaleString('nl-NL')} liter` : null, teHoog ? `${bar!.toLocaleString('nl-NL')} bar` : null].filter(Boolean).join(' en ');
  return `Luchtketel van ${waarom}: boven 2.500 liter of vanaf 30 bar hoort de keuring bij een aangewezen instelling (NL-CBI). Verwijs de klant daarnaar door; deze inspectie vervangt die keuring niet.`;
}

/** Datum van vandaag plus een aantal maanden, als jjjj-mm-dd. */
export function plusMaanden(dag: string, maanden: number): string {
  const [j, m, d] = dag.split('-').map(Number);
  const uit = new Date(Date.UTC(j, m - 1 + maanden, d));
  return uit.toISOString().slice(0, 10);
}

/** Het nummer van een inspectie voor op het scherm en in het rapport: INS-2026-001 (lib/nummering.ts). */
export function inspectieNummer(r: Genummerd): string {
  return documentNummer('INS', r);
}
