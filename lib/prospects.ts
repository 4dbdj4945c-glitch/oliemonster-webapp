// Gedeelde begrippen van de module Acquisitie.
// Alleen constanten en pure functies, zodat zowel de API-routes als de pagina
// dit bestand kunnen gebruiken.

export const PROSPECT_STATUSSEN = [
  'NIEUW',
  'ONDERZOCHT',
  'BENADERD',
  'REACTIE',
  'GESPREK',
  'OFFERTE',
  'KLANT',
  'AFGEWEZEN',
  'LATER',
] as const;

export type ProspectStatusNaam = (typeof PROSPECT_STATUSSEN)[number];

export const STATUS_LABELS: Record<ProspectStatusNaam, string> = {
  NIEUW: 'Nieuw',
  ONDERZOCHT: 'Onderzocht',
  BENADERD: 'Benaderd',
  REACTIE: 'Reactie',
  GESPREK: 'Gesprek',
  OFFERTE: 'Offerte',
  KLANT: 'Klant',
  AFGEWEZEN: 'Afgewezen',
  LATER: 'Later',
};

// De statussen die samen de pijplijn vormen, in de volgorde waarin je ze doorloopt.
export const PIJPLIJN_STATUSSEN: ProspectStatusNaam[] = [
  'NIEUW',
  'ONDERZOCHT',
  'BENADERD',
  'REACTIE',
  'GESPREK',
  'OFFERTE',
  'KLANT',
];

// Alles wat loopt: hier zit geld in de pijplijn.
export const LOPENDE_STATUSSEN: ProspectStatusNaam[] = ['BENADERD', 'REACTIE', 'GESPREK', 'OFFERTE'];

export const PROSPECT_KANALEN = ['MAIL', 'LINKEDIN', 'TELEFOON', 'BEZOEK', 'OFFERTE', 'OVERIG'] as const;

export type ProspectKanaalNaam = (typeof PROSPECT_KANALEN)[number];

export const KANAAL_LABELS: Record<ProspectKanaalNaam, string> = {
  MAIL: 'Mail',
  LINKEDIN: 'LinkedIn',
  TELEFOON: 'Telefoon',
  BEZOEK: 'Bezoek',
  OFFERTE: 'Offerte',
  OVERIG: 'Overig',
};

// Een prospect benader je via één kanaal tegelijk: mail of LinkedIn.
export const BENADER_KANALEN = ['MAIL', 'LINKEDIN'] as const;

export const SEGMENT_LABELS: Record<string, string> = {
  industrie: 'Industrie en productie',
  dienstverlener: 'Technische dienstverleners',
  overheid: 'Overheid en semi-publiek',
  warm: 'Warme contacten',
};

// Na zoveel dagen zonder reactie op een benadering zet de module het op "opvolgen".
export const OPVOLGEN_NA_DAGEN = 14;

export function isProspectStatus(waarde: unknown): waarde is ProspectStatusNaam {
  return typeof waarde === 'string' && (PROSPECT_STATUSSEN as readonly string[]).includes(waarde);
}

export function isProspectKanaal(waarde: unknown): waarde is ProspectKanaalNaam {
  return typeof waarde === 'string' && (PROSPECT_KANALEN as readonly string[]).includes(waarde);
}

export function segmentLabel(segment?: string | null): string {
  if (!segment) return 'Onbekend segment';
  return SEGMENT_LABELS[segment.toLowerCase()] ?? segment;
}

/** Begin en einde van het kwartaal waar deze datum in valt. */
export function kwartaalGrenzen(datum: Date): { start: Date; eind: Date } {
  const kwartaal = Math.floor(datum.getMonth() / 3);
  const start = new Date(datum.getFullYear(), kwartaal * 3, 1);
  const eind = new Date(datum.getFullYear(), kwartaal * 3 + 3, 1);
  return { start, eind };
}

/* ---------- Vormen zoals de API ze teruggeeft (datums als ISO-tekst) ---------- */

export interface ProspectRegel {
  id: number;
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
  status: ProspectStatusNaam;
  kanaal: ProspectKanaalNaam;
  afgemeldOp: string | null;
  volgendeActie: string | null;
  volgendeActieOp: string | null;
  laatsteContactOp: string | null;
  klantSindsOp: string | null;
  geschatteWaarde: number | null;
  notities: string | null;
  archief: boolean;
  createdAt: string;
  updatedAt: string;
  contactmomentenCount?: number;
}

export interface ContactmomentRegel {
  id: number;
  prospectId: number;
  datum: string;
  kanaal: ProspectKanaalNaam;
  samenvatting: string;
  uitkomst: string | null;
  aangemaaktDoor: string | null;
  createdAt: string;
}

/* ---------- Kleine hulpjes voor de pagina ---------- */

/** Vandaag om 00:00, zodat datumvergelijkingen niet op uren stuklopen. */
export function beginVanVandaag(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function datumNL(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** ISO-datum (jjjj-mm-dd) voor een date-veld. */
export function datumVoorVeld(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

/** Bedrag met euroteken, zoals de rest van de portal het schrijft. */
export function euroTekst(bedrag: number | null | undefined): string {
  return `€ ${(bedrag ?? 0).toLocaleString('nl-NL')}`;
}

/** Hoeveel hele dagen zit er tussen een datum en vandaag (positief = in het verleden). */
export function dagenGeleden(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return Math.round((beginVanVandaag().getTime() - d.getTime()) / 86400000);
}
