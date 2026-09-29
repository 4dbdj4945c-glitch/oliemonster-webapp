// De inspectie-engine zonder database: sjablonen, rekenen en de waarschuwing
// bij een grote luchtketel.
import { describe, expect, it } from 'vitest';
import {
  SJABLONEN,
  leesInstellingen,
  leesWaarden,
  luchtketelWaarschuwing,
  plusMaanden,
  sjabloonVan,
  verklaringArbeidsmiddelen,
  oordeelFout,
  WaardeFout,
} from '@/lib/inspecties/sjablonen';
import { berekenLek, energiePerM3, lekInstellingen, lekTotalen, uitkomstTekst, volgendeInspectie } from '@/lib/inspecties/rekenen';

describe('sjablonen', () => {
  it('elk sjabloon heeft oordelen met een standaard, en unieke veldnamen', () => {
    for (const s of Object.values(SJABLONEN)) {
      if (s.oordeel.standaard !== null) expect(s.oordeel.keuzes.map((k) => k.waarde)).toContain(s.oordeel.standaard);
      const namen = [...s.meetwaarden.map((v) => v.sleutel), ...s.instellingen.map((v) => v.sleutel)];
      expect(new Set(namen).size).toBe(namen.length);
    }
  });

  it('instellingen krijgen standaardwaarden en weigeren onzin', () => {
    const s = sjabloonVan('persluchtlekken');
    expect(leesInstellingen(s, {})).toMatchObject({ drukBar: 7, draaiuren: 2000, prijsmodel: 'kwh', prijsKwh: 0.25, kwhPerM3: null, co2PerKwh: 0.268 });
    expect(leesInstellingen(s, { drukBar: '6,5' }).drukBar).toBe(6.5);
    expect(() => leesInstellingen(s, { draaiuren: 9000 })).toThrow(WaardeFout);
    expect(() => leesInstellingen(s, { prijsmodel: 'gratis' })).toThrow(WaardeFout);
  });

  it('waarden: getallen met komma, checklist alleen goed, niet goed of n.v.t.', () => {
    const s = sjabloonVan('arbeidsmiddelen');
    expect(leesWaarden(s, { werkdrukBar: '210', onbekend: 3, checklist: { slangen: 'goed', raar: 'x' } })).toEqual({
      werkdrukBar: 210,
      ketelLiter: null,
      ketelBar: null,
      checklist: { slangen: 'goed' },
    });
    expect(() => leesWaarden(s, { checklist: { slangen: 'misschien' } })).toThrow(WaardeFout);
    expect(() => leesWaarden(sjabloonVan('persluchtlekken'), { verliesLpm: -3 })).toThrow(WaardeFout);
  });

  it('arbeidsmiddelen: geen standaarduitslag, In orde alleen met een volledige checklist zonder niet goed', () => {
    const s = sjabloonVan('arbeidsmiddelen');
    expect(s.oordeel.standaard).toBeNull();
    const alles = Object.fromEntries(s.checklist.map((p) => [p.sleutel, 'goed']));
    expect(oordeelFout(s, 'in-orde', {})).toMatch(/Nog 10 punten open/);
    expect(oordeelFout(s, 'in-orde', { checklist: { ...alles, olie: undefined } })).toMatch(/Nog 1 punt open/);
    expect(oordeelFout(s, 'in-orde', { checklist: { ...alles, filters: 'nvt' } })).toBeNull();
    expect(oordeelFout(s, 'in-orde', { checklist: { ...alles, lekkage: 'niet-goed' } })).toMatch(/niet goed/);
    expect(oordeelFout(s, 'actie-nodig', {})).toBeNull();
    expect(oordeelFout(sjabloonVan('persluchtlekken'), 'hoog', {})).toBeNull();
  });

  it('alle foute velden tegelijk, niet één per keer', () => {
    try {
      leesWaarden(sjabloonVan('persluchtlekken'), { db: -5, verliesLpm: 'abc' });
      throw new Error('geen fout');
    } catch (e) {
      expect(e).toBeInstanceOf(WaardeFout);
      expect(Object.keys((e as WaardeFout).velden).sort()).toEqual(['db', 'verliesLpm']);
    }
  });

  it('luchtketel: boven 2.500 liter of vanaf 30 bar een doorverwijzing', () => {
    expect(luchtketelWaarschuwing({ ketelLiter: 500, ketelBar: 11 })).toBeNull();
    expect(luchtketelWaarschuwing({ ketelLiter: 2500, ketelBar: 29.9 })).toBeNull();
    expect(luchtketelWaarschuwing({ ketelLiter: 2501 })).toMatch(/2\.501 liter.*NL-CBI/);
    expect(luchtketelWaarschuwing({ ketelBar: 30 })).toMatch(/30 bar/);
    expect(luchtketelWaarschuwing({})).toBeNull();
  });

  it('de verklaring staat letterlijk zoals in het juridisch onderzoek, zonder certificaatclaim', () => {
    const tekst = verklaringArbeidsmiddelen('NEN-EN-ISO 4413');
    expect(tekst).toBe(
      'Inspectierapport technische staat, uitgevoerd door een vakbekwaam monteur hydrauliek/pneumatiek volgens NEN-EN-ISO 4413. ' +
        'Dit rapport kan dienen als schriftelijk bewijsstuk van een keuring door een deskundige zoals bedoeld in art. 7.4a Arbobesluit. ' +
        'Het is geen keuring door een aangewezen instelling (NL-CBI) en geen gecertificeerde keuring (SCIOS).'
    );
    // Buiten die ene verklaring nergens "gecertificeerd" of "keuringscertificaat".
    const rest = JSON.stringify(SJABLONEN, (_k, w) => (typeof w === 'function' ? undefined : w));
    expect(rest).not.toMatch(/gecertificeerd|certificaat/i);
  });

  it('plus maanden', () => {
    expect(plusMaanden('2026-09-29', 12)).toBe('2027-09-29');
    expect(plusMaanden('2026-01-31', 1)).toBe('2026-03-03');
  });
});

describe('rekenen persluchtlekken', () => {
  it('energie per m3 bij 7 bar ligt rond de vuistregel van 0,11 kWh', () => {
    expect(energiePerM3(7)).toBeGreaterThan(0.1);
    expect(energiePerM3(7)).toBeLessThan(0.12);
    expect(energiePerM3(10)).toBeGreaterThan(energiePerM3(7));
  });

  it('kosten en CO2 per lek, met kWh-prijs en met m3-prijs', () => {
    const kwh = lekInstellingen({ drukBar: 7, draaiuren: 2000, prijsKwh: 0.25, kwhPerM3: 0.1, co2PerKwh: 0.3 });
    const b = berekenLek(100, kwh);
    expect(b.m3PerJaar).toBe(12000); // 100 l/min * 60 * 2000 / 1000
    expect(b.kwhPerJaar).toBeCloseTo(1200);
    expect(b.kostenPerJaar).toBeCloseTo(300);
    expect(b.co2KgPerJaar).toBeCloseTo(360);
    const m3 = lekInstellingen({ prijsmodel: 'm3', prijsM3: 0.02, draaiuren: 2000, kwhPerM3: 0.1 });
    expect(berekenLek(100, m3).kostenPerJaar).toBeCloseTo(240);
  });

  it('totalen en besparing na reparatie', () => {
    const inst = lekInstellingen({ draaiuren: 1000, prijsKwh: 1, kwhPerM3: 1, co2PerKwh: 1 });
    const t = lekTotalen(
      [
        { waarden: { verliesLpm: 10 }, gerepareerd: true },
        { waarden: { verliesLpm: 30 }, gerepareerd: false },
        { waarden: {}, gerepareerd: false },
      ],
      inst
    );
    expect(t).toMatchObject({ aantal: 3, gerepareerd: 1, verliesLpm: 40, kostenPerJaar: 2400, besparingKosten: 600, openKosten: 1800, besparingCo2Kg: 600 });
    expect(uitkomstTekst('persluchtlekken', [{ oordeel: 'hoog', waarden: { verliesLpm: 10 }, gerepareerd: true }], { draaiuren: 1000, kwhPerM3: 1, prijsKwh: 1 })).toBe(
      '1 lek, €\u00a0600 per jaar, 161 kg CO2 per jaar, 1 gerepareerd'
    );
  });

  it('volgende inspectie: bij arbeidsmiddelen de vroegste, anders die van de inspectie', () => {
    expect(volgendeInspectie('arbeidsmiddelen', '2027-09-01', [{ volgendeOp: '2027-03-01' }, { volgendeOp: '2027-06-01' }])).toBe('2027-03-01');
    expect(volgendeInspectie('arbeidsmiddelen', '2027-09-01', [])).toBe('2027-09-01');
    expect(volgendeInspectie('persluchtlekken', '2027-09-01', [{ volgendeOp: '2026-01-01' }])).toBe('2027-09-01');
  });
});
