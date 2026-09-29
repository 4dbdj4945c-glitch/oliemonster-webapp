// De agendafeed (ICS, RFC 5545) voor Apple Agenda: de tekst van de feed en de
// geheime link. Alleen op de server (gebruikt node:crypto en SESSION_SECRET).
//
// De link: /api/agenda/feed/<token>.ics, met token = sleutel (32 hex, staat in
// AgendaFeed) + de eerste 32 hex van een HMAC-SHA256 van die sleutel met
// SESSION_SECRET. Een nieuwe omgevingsvariabele is dus niet nodig, de link kan
// in de app opnieuw getoond worden, en wie alleen de database heeft kan geen
// geldige link maken. Intrekken = de regel in AgendaFeed weghalen; wijzigt
// SESSION_SECRET, dan werken alle links niet meer (en moet je opnieuw abonneren).

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { sessieSleutel } from './session';

// ------------------------------------------------------------------
// De geheime link
// ------------------------------------------------------------------

export function nieuweSleutel(): string {
  return randomBytes(16).toString('hex');
}

function handtekening(sleutel: string): string {
  return createHmac('sha256', sessieSleutel()).update(`agenda:${sleutel}`).digest('hex').slice(0, 32);
}

/** Het token in de link bij een sleutel. */
export function tokenVoor(sleutel: string): string {
  return `${sleutel}${handtekening(sleutel)}`;
}

/** De sleutel uit een token, of null als het token niet klopt (ook met .ics erachter). */
export function sleutelUitToken(token: string): string | null {
  const schoon = token.replace(/\.ics$/i, '');
  if (!/^[0-9a-f]{64}$/.test(schoon)) return null;
  const sleutel = schoon.slice(0, 32);
  const verwacht = Buffer.from(handtekening(sleutel), 'hex');
  const gekregen = Buffer.from(schoon.slice(32), 'hex');
  if (verwacht.length !== gekregen.length || !timingSafeEqual(verwacht, gekregen)) return null;
  return sleutel;
}

/** De links: https voor kopiëren en webcal om direct in Agenda te openen. */
export function feedLinks(origin: string, sleutel: string): { https: string; webcal: string } {
  const https = `${origin.replace(/\/+$/, '')}/api/agenda/feed/${tokenVoor(sleutel)}.ics`;
  return { https, webcal: https.replace(/^https?:\/\//, 'webcal://') };
}

// ------------------------------------------------------------------
// De feed zelf
// ------------------------------------------------------------------

export interface AgendaAfspraak {
  uid: string;
  titel: string;
  beschrijving?: string | null;
  locatie?: string | null;
  url?: string | null;
  /** Een afspraak met tijd: start in Nederlandse tijd (jjjj-mm-dd en minuten na middernacht) en duur. */
  tijd?: { dag: string; startMinuut: number; duurMinuten: number };
  /** Of een hele dag (jjjj-mm-dd). */
  heleDag?: string;
  /** Herinnering: hoeveel minuten vóór de start. Bij een hele dag telt het vanaf middernacht. */
  herinneringMinutenVooraf?: number;
  herinnering?: string;
}

/** Tekst veilig in een ICS-veld: backslash, puntkomma, komma en nieuwe regels. */
export function icsTekst(tekst: string): string {
  return tekst
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Regels langer dan 75 bytes vouwen (RFC 5545, 3.1): afbreken en verder op een
 * nieuwe regel die met een spatie begint. Nooit midden in een UTF-8-teken.
 */
export function vouw(regel: string): string {
  const delen: string[] = [];
  let huidig = '';
  let bytes = 0;
  for (const teken of regel) {
    const lengte = Buffer.byteLength(teken, 'utf8');
    const max = delen.length === 0 ? 75 : 74; // vervolgregels beginnen met een spatie
    if (bytes + lengte > max) {
      delen.push(huidig);
      huidig = '';
      bytes = 0;
    }
    huidig += teken;
    bytes += lengte;
  }
  delen.push(huidig);
  return delen.join('\r\n ');
}

function dagCompact(dag: string): string {
  return dag.replace(/-/g, '');
}

function volgendeDag(dag: string): string {
  const [j, m, d] = dag.split('-').map(Number);
  return new Date(Date.UTC(j, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** 20261001T083000 uit een dag en minuten na middernacht (mag over middernacht heen). */
function lokaleTijd(dag: string, minuut: number): string {
  const [j, m, d] = dag.split('-').map(Number);
  const t = new Date(Date.UTC(j, m - 1, d, 0, minuut));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}T${p(t.getUTCHours())}${p(t.getUTCMinutes())}00`;
}

function utcStempel(nu: Date): string {
  return nu.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Europe/Amsterdam: zomertijd van de laatste zondag van maart tot de laatste zondag van oktober.
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Amsterdam',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** Minuten als ICS-duur: 1440 = P1D, 540 = PT9H, 90 = PT1H30M. */
function duur(minuten: number): string {
  const d = Math.floor(minuten / 1440);
  const rest = minuten % 1440;
  const u = Math.floor(rest / 60);
  const m = rest % 60;
  if (rest === 0) return `P${d}D`;
  return `P${d ? `${d}D` : ''}T${u ? `${u}H` : ''}${m ? `${m}M` : ''}`;
}

/** De hele feed als tekst, met CRLF zoals de norm het wil. */
export function bouwIcs(naam: string, afspraken: AgendaAfspraak[], nu = new Date()): string {
  const r: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    "PRODID:-//It's Done Services//IDS Portal//NL",
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsTekst(naam)}`,
    'X-WR-TIMEZONE:Europe/Amsterdam',
    // Apple Agenda vernieuwt op zijn eigen schema; dit is de wens.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...VTIMEZONE,
  ];
  const stempel = utcStempel(nu);
  for (const a of afspraken) {
    r.push('BEGIN:VEVENT', `UID:${a.uid}`, `DTSTAMP:${stempel}`);
    if (a.tijd) {
      r.push(`DTSTART;TZID=Europe/Amsterdam:${lokaleTijd(a.tijd.dag, a.tijd.startMinuut)}`);
      r.push(`DTEND;TZID=Europe/Amsterdam:${lokaleTijd(a.tijd.dag, a.tijd.startMinuut + Math.max(15, a.tijd.duurMinuten))}`);
    } else if (a.heleDag) {
      r.push(`DTSTART;VALUE=DATE:${dagCompact(a.heleDag)}`, `DTEND;VALUE=DATE:${dagCompact(volgendeDag(a.heleDag))}`);
      r.push('TRANSP:TRANSPARENT');
    }
    r.push(`SUMMARY:${icsTekst(a.titel)}`);
    if (a.locatie) r.push(`LOCATION:${icsTekst(a.locatie)}`);
    if (a.beschrijving) r.push(`DESCRIPTION:${icsTekst(a.beschrijving)}`);
    if (a.url) r.push(`URL:${a.url}`);
    if (a.herinneringMinutenVooraf !== undefined) {
      r.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsTekst(a.herinnering ?? a.titel)}`,
        `TRIGGER;RELATED=START:-${duur(a.herinneringMinutenVooraf)}`,
        'END:VALARM'
      );
    }
    r.push('END:VEVENT');
  }
  r.push('END:VCALENDAR');
  return r.map(vouw).join('\r\n') + '\r\n';
}
