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
  /** De klant die uit deze prospect ontstond (actie Wordt klant) */
  klantId?: number | null;
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

/**
 * Datums uit de database komen als UTC-middernacht terug. Reken daarom altijd met
 * de kalenderdag zelf, anders verschuift een datum lokaal een dag en tellen de
 * cijfers op het dashboard en op de pagina verschillend.
 */
export function alsLokaleDatum(iso: string): Date | null {
  const kop = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (kop) return new Date(Number(kop[1]), Number(kop[2]) - 1, Number(kop[3]));
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function datumNL(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = alsLokaleDatum(iso);
  return d ? d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

/** Vandaag om 23:59:59, de grens voor "staat open". */
export function eindeVanVandaag(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Zondag van deze week om 23:59:59. */
export function eindeVanDezeWeek(): Date {
  const d = eindeVanVandaag();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return d;
}

/**
 * Staat er een actie open op of voor `grens`? Gebruikt door de pagina en door de
 * modulekaart op het dashboard, zodat beide hetzelfde tellen.
 */
export function actieStaatOpen(
  prospect: { volgendeActieOp: string | null; status: string; archief?: boolean; afgemeldOp?: string | null },
  grens: Date
): boolean {
  if (!prospect.volgendeActieOp) return false;
  if (prospect.archief || prospect.afgemeldOp) return false;
  if (prospect.status === 'KLANT' || prospect.status === 'AFGEWEZEN') return false;
  const d = alsLokaleDatum(prospect.volgendeActieOp);
  return d !== null && d <= grens;
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

/**
 * Geeft de URL alleen terug als het echt een http- of https-adres is. Zo wordt
 * "voorbeeld.nl" uit een geimporteerde lijst geen link naar een pagina in de portal
 * zelf, en komt er nooit een javascript:-adres in een href.
 */
export function veiligeUrl(url: string | null | undefined): string | null {
  const t = (url ?? '').trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : null;
}

/** Hoeveel hele dagen zit er tussen een datum en vandaag (positief = in het verleden). */
export function dagenGeleden(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = alsLokaleDatum(iso);
  if (!d) return null;
  d.setHours(0, 0, 0, 0);
  return Math.round((beginVanVandaag().getTime() - d.getTime()) / 86400000);
}

/** Een actie in "Wat moet er vandaag gebeuren" (Acquisitie en Vandaag). */
export interface ActieItem<P extends ProspectActieBron = ProspectRegel> {
  prospect: P;
  reden: string;
  /** Te laat (rood); anders staat hij voor vandaag of moet hij worden opgevolgd. */
  urgent: boolean;
  sorteer: number;
}

export type ProspectActieBron = Pick<
  ProspectRegel,
  'archief' | 'status' | 'afgemeldOp' | 'volgendeActieOp' | 'laatsteContactOp' | 'createdAt'
>;

/**
 * Wat moet er vandaag gebeuren: acties die vandaag of eerder moesten, plus
 * prospects die al OPVOLGEN_NA_DAGEN op Benaderd staan zonder reactie. De
 * langst openstaande bovenaan. Eén regel voor Acquisitie en het startscherm.
 */
export function actiesVoorVandaag<P extends ProspectActieBron>(prospects: P[]): ActieItem<P>[] {
  const items: ActieItem<P>[] = [];
  for (const p of prospects) {
    if (p.archief || p.status === 'KLANT' || p.status === 'AFGEWEZEN') continue;
    if (p.afgemeldOp) continue; // afgemeld, dus niet meer benaderen

    const dagenTeLaat = dagenGeleden(p.volgendeActieOp);
    if (p.volgendeActieOp && dagenTeLaat !== null && dagenTeLaat >= 0) {
      items.push({
        prospect: p,
        reden: dagenTeLaat === 0 ? 'Staat voor vandaag' : `${dagenTeLaat} ${dagenTeLaat === 1 ? 'dag' : 'dagen'} te laat`,
        urgent: dagenTeLaat > 0,
        sorteer: dagenTeLaat,
      });
      continue;
    }

    if (p.status === 'BENADERD') {
      const sinds = dagenGeleden(p.laatsteContactOp ?? p.createdAt);
      if (sinds !== null && sinds >= OPVOLGEN_NA_DAGEN) {
        items.push({
          prospect: p,
          reden: `${sinds} dagen benaderd zonder reactie, tijd om op te volgen`,
          urgent: false,
          sorteer: sinds,
        });
      }
    }
  }
  return items.sort((a, b) => b.sorteer - a.sorteer);
}
