// De ICS-uitvoer van de agendafeed (lib/agenda.ts): opbouw, tijdzone, hele
// dagen, herinneringen, escapen, vouwen en de geheime link.
import { describe, expect, it } from 'vitest';
import { bouwIcs, feedLinks, icsTekst, nieuweSleutel, sleutelUitToken, tokenVoor, vouw } from '@/lib/agenda';

const NU = new Date(Date.UTC(2026, 8, 29, 10, 0, 0));

function regels(ics: string): string[] {
  // Gevouwen regels weer aan elkaar (CRLF + spatie).
  return ics.replace(/\r\n /g, '').split('\r\n');
}

describe('bouwIcs', () => {
  const ics = bouwIcs("It's Done planning", [
    {
      uid: 'plandag-7@test',
      titel: 'Monsterdag: Sluis Grave, Sluis Lith en Werkplaats',
      beschrijving: '1. Sluis Grave: 2 monsters\n2. Sluis Lith; hefdeur',
      locatie: 'Sluis Grave, Nederland',
      url: 'https://portal.test/dashboard/planning/dag/7',
      tijd: { dag: '2026-10-01', startMinuut: 480, duurMinuten: 330 },
      herinneringMinutenVooraf: 1440,
      herinnering: 'Morgen: monsterdag',
    },
    { uid: 'taak-3@test', titel: 'Onderhoud compressor, Kempen', heleDag: '2026-12-31', herinneringMinutenVooraf: 540 },
  ], NU);
  const r = regels(ics);

  it('is een geldige kalender met CRLF en een tijdzone', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every((l) => !l.includes('\n'))).toBe(true);
    expect(r).toContain('BEGIN:VTIMEZONE');
    expect(r).toContain('TZID:Europe/Amsterdam');
    expect(r).toContain("X-WR-CALNAME:It's Done planning");
    expect(r.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(2);
    expect(r.filter((l) => l === 'END:VEVENT')).toHaveLength(2);
  });

  it('een planningsdag: tijd in Nederlandse tijd, eind na de geplande duur, herinnering een dag vooraf', () => {
    expect(r).toContain('DTSTART;TZID=Europe/Amsterdam:20261001T080000');
    expect(r).toContain('DTEND;TZID=Europe/Amsterdam:20261001T133000');
    expect(r).toContain('UID:plandag-7@test');
    expect(r).toContain('DTSTAMP:20260929T100000Z');
    expect(r).toContain('SUMMARY:Monsterdag: Sluis Grave\\, Sluis Lith en Werkplaats');
    expect(r).toContain('LOCATION:Sluis Grave\\, Nederland');
    expect(r).toContain('DESCRIPTION:1. Sluis Grave: 2 monsters\\n2. Sluis Lith\\; hefdeur');
    expect(r).toContain('URL:https://portal.test/dashboard/planning/dag/7');
    expect(r).toContain('TRIGGER;RELATED=START:-P1D');
    expect(r).toContain('ACTION:DISPLAY');
  });

  it('een taak: hele dag, eind de dag erna (ook over de jaargrens), herinnering 15:00 de dag ervoor', () => {
    expect(r).toContain('DTSTART;VALUE=DATE:20261231');
    expect(r).toContain('DTEND;VALUE=DATE:20270101');
    expect(r).toContain('TRIGGER;RELATED=START:-PT9H');
    expect(r).toContain('TRANSP:TRANSPARENT');
  });

  it('een dag die over middernacht loopt, eindigt de volgende dag', () => {
    const laat = regels(bouwIcs('x', [{ uid: 'a', titel: 'Lang', tijd: { dag: '2026-10-01', startMinuut: 480, duurMinuten: 1000 } }], NU));
    expect(laat).toContain('DTEND;TZID=Europe/Amsterdam:20261002T004000');
  });
});

describe('icsTekst en vouw', () => {
  it('escapet backslash, puntkomma, komma en nieuwe regels', () => {
    expect(icsTekst('a\\b; c, d\ne\r\nf')).toBe('a\\\\b\\; c\\, d\\ne\\nf');
  });

  it('vouwt op 75 bytes, ook met tekens van meer bytes', () => {
    const lang = 'DESCRIPTION:' + 'é'.repeat(100);
    const gevouwen = vouw(lang);
    for (const deel of gevouwen.split('\r\n')) expect(Buffer.byteLength(deel, 'utf8')).toBeLessThanOrEqual(75);
    expect(gevouwen.replace(/\r\n /g, '')).toBe(lang);
    expect(vouw('kort')).toBe('kort');
  });
});

describe('de geheime link', () => {
  it('token = sleutel + handtekening; een veranderd teken geeft null', () => {
    const sleutel = nieuweSleutel();
    expect(sleutel).toMatch(/^[0-9a-f]{32}$/);
    const token = tokenVoor(sleutel);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(sleutelUitToken(token)).toBe(sleutel);
    expect(sleutelUitToken(`${token}.ics`)).toBe(sleutel);
    const fout = token.slice(0, 63) + (token[63] === '0' ? '1' : '0');
    expect(sleutelUitToken(fout)).toBeNull();
    // Een sleutel uit de database alleen (zonder handtekening) is niet genoeg.
    expect(sleutelUitToken(sleutel + '0'.repeat(32))).toBeNull();
    expect(sleutelUitToken('../../etc/passwd')).toBeNull();
  });

  it('links: https en webcal', () => {
    const l = feedLinks('https://portal.test/', 'a'.repeat(32));
    expect(l.https).toMatch(/^https:\/\/portal\.test\/api\/agenda\/feed\/[0-9a-f]{64}\.ics$/);
    expect(l.webcal).toBe(l.https.replace('https://', 'webcal://'));
  });
});
