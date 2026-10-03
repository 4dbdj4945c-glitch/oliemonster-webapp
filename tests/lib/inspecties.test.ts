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
  checklistVolledig,
  WaardeFout,
} from '@/lib/inspecties/sjablonen';
import { verklaringGeldtVoor } from '@/lib/rapport/inspectieRapportPdf';
import { berekenLek, energiePerM3, lekInstellingen, lekTotalen, markeringTelling, uitkomstTekst, volgendeInspectie } from '@/lib/inspecties/rekenen';
import { verklaringMarkering } from '@/lib/inspecties/sjablonen';
import { leesPlakLijst, MAX_PLAK_REGELS } from '@/lib/inspecties/plakken';
import { afrondFout } from '@/lib/inspecties/server';

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

  it('de verklaring (art. 7.4a) geldt alleen voor middelen met een uitslag en een volledig ingevulde checklist', () => {
    const s = sjabloonVan('arbeidsmiddelen');
    const alles = Object.fromEntries(s.checklist.map((p) => [p.sleutel, 'goed']));
    const items = [
      { titel: 'Volledig, in orde', oordeel: 'in-orde', waarden: { checklist: alles } },
      { titel: 'Volledig, actie nodig', oordeel: 'actie-nodig', waarden: { checklist: { ...alles, lekkage: 'niet-goed' } } },
      { titel: 'Leeg, actie nodig', oordeel: 'actie-nodig', waarden: {} },
      { titel: 'Half, buiten gebruik', oordeel: 'buiten-gebruik', waarden: { checklist: { slangen: 'niet-goed' } } },
      { titel: 'Volledig, niet gecontroleerd', oordeel: 'niet-gecontroleerd', waarden: { checklist: alles } },
      { titel: 'Zonder uitslag', oordeel: null, waarden: { checklist: alles } },
    ];
    expect(verklaringGeldtVoor({ sjabloon: 'arbeidsmiddelen', items }).map((i) => i.titel)).toEqual(['Volledig, in orde', 'Volledig, actie nodig']);
    expect(checklistVolledig(s, { checklist: { ...alles, filters: 'nvt' } })).toBe(true);
    expect(checklistVolledig(s, { checklist: { slangen: 'goed' } })).toBe(false);
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

describe('sjabloon markering', () => {
  const s = sjabloonVan('markering');

  it('locaties met een uitslag die je zelf kiest, stickers als getal, geen volgende inspectie', () => {
    expect(s.item).toMatchObject({ enkel: 'locatie', meervoud: 'locaties', nieuw: 'Locatie toevoegen', titel: 'Bron of omschrijving', kiesInstallatie: false });
    expect(s.oordeel.standaard).toBeNull();
    expect(s.oordeel.keuzes.map((k) => k.waarde)).toEqual(['gemarkeerd', 'niet-bereikbaar', 'niet-aangetroffen']);
    expect(s.oordeelVerplicht).toBe(true);
    expect(s.heeftVolgende).toBe(false);
    expect(leesWaarden(s, { stickers: '6' })).toEqual({ stickers: 6 });
    expect(() => leesWaarden(s, { stickers: 1001 })).toThrow(WaardeFout);
    expect(volgendeInspectie('markering', '2027-09-01', [])).toBeNull();
  });

  it('instellingen: een lege standaard blijft leeg, de soort markering krijgt zijn standaard', () => {
    expect(leesInstellingen(s, {})).toEqual({ opdracht: '', markering: 'Waarschuwingssticker', tav: '' });
    expect(leesInstellingen(s, { opdracht: '  Rapport 2024-17 ', tav: 'J. Jansen' })).toEqual({ opdracht: 'Rapport 2024-17', markering: 'Waarschuwingssticker', tav: 'J. Jansen' });
  });

  it('verklaring met en zonder opdracht, zonder em-dash', () => {
    const met = verklaringMarkering({ opdracht: 'het inventarisatierapport', markering: 'Waarschuwingssticker', tav: '' });
    expect(met).toBe(
      "Op de locaties in dit rapport is een waarschuwingssticker aangebracht zoals gevraagd in het inventarisatierapport. Per locatie staan de uitslag en de foto's die ter plekke zijn gemaakt."
    );
    const zonder = verklaringMarkering({ opdracht: '', markering: 'Bord', tav: '' });
    expect(zonder).toBe("Op de locaties in dit rapport is een bord aangebracht. Per locatie staan de uitslag en de foto's die ter plekke zijn gemaakt.");
    expect(s.rapport.verklaring!(leesInstellingen(s, {}))).not.toMatch(/\u2014/);
  });

  it('telling en uitkomst per uitslag, stickers opgeteld', () => {
    const items = [
      ...Array.from({ length: 10 }, () => ({ oordeel: 'gemarkeerd', waarden: { stickers: 2 }, gerepareerd: false })),
      { oordeel: 'niet-bereikbaar', waarden: {}, gerepareerd: false },
    ];
    expect(markeringTelling(items)).toMatchObject({ aantal: 11, gemarkeerd: 10, 'niet-bereikbaar': 1, stickers: 20, zonderUitslag: 0 });
    expect(uitkomstTekst('markering', items, {})).toBe('11 locaties, 10 gemarkeerd, 1 niet bereikbaar');
    expect(uitkomstTekst('markering', [], {})).toBe('Nog geen locaties');
  });

  it('afronden kan pas als elke locatie een uitslag heeft; lekken hebben dat niet nodig', () => {
    const items = [
      { titel: 'Bron 6', oordeel: 'gemarkeerd', waarden: {} },
      { titel: 'Bron 9', oordeel: null, waarden: {} },
    ];
    expect(afrondFout({ sjabloon: 'markering', items } as never)).toBe('Kies eerst een uitslag voor Bron 9 (of Niet bereikbaar).');
    expect(afrondFout({ sjabloon: 'markering', items: [items[0]] } as never)).toBeNull();
    expect(afrondFout({ sjabloon: 'persluchtlekken', items: [{ titel: '1', oordeel: null, waarden: {} }] } as never)).toBeNull();
  });
});

describe('lijst plakken', () => {
  it('kolommen met | of tab, locatie en opmerking mogen weg', () => {
    const { regels, fouten } = leesPlakLijst(
      [
        'Bron 6: pakkingen | Technische kast in voorlichtingsruimte, dienstengebouw | Volgens rapport 13 stuks (p. 14)',
        '',
        'Bron 9: textiel (kabelmantel)\tKast in NSA-ruimte, dienstengebouw',
        '  Bron 15: aandrijvingen van stuw  ',
      ].join('\n')
    );
    expect(fouten).toEqual([]);
    expect(regels).toEqual([
      { nr: 1, titel: 'Bron 6: pakkingen', locatie: 'Technische kast in voorlichtingsruimte, dienstengebouw', notitie: 'Volgens rapport 13 stuks (p. 14)' },
      { nr: 3, titel: 'Bron 9: textiel (kabelmantel)', locatie: 'Kast in NSA-ruimte, dienstengebouw', notitie: null },
      { nr: 4, titel: 'Bron 15: aandrijvingen van stuw', locatie: null, notitie: null },
    ]);
  });

  it('een Markdown-tabel en opsommingstekens mogen; foute regels komen met hun nummer terug', () => {
    const { regels, fouten } = leesPlakLijst(['| Bron 1 | Kast |', '|---|---|', '- Bron 2 | Hal', '| | Kast zonder titel |', 'a | b | c | d'].join('\n'));
    expect(regels.map((r) => r.titel)).toEqual(['Bron 1', 'Bron 2']);
    expect(fouten.map((f) => f.nr)).toEqual([4, 5]);
    expect(fouten[0].melding).toMatch(/titel/);
    expect(fouten[1].melding).toMatch(/Te veel kolommen/);
  });

  it('meer dan het maximum aan regels is een fout', () => {
    const { fouten } = leesPlakLijst(Array.from({ length: MAX_PLAK_REGELS + 1 }, (_, i) => `Bron ${i}`).join('\n'));
    expect(fouten.at(-1)?.melding).toMatch(/Hoogstens/);
  });
});
