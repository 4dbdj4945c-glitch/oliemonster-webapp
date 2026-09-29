// Intervallogica van de contracttaken (lib/contracten.ts): volgende datum,
// maandeinde, status verlopen/binnenkort/gepland en de teksten.
import { describe, expect, it } from 'vitest';
import {
  BINNENKORT_DAGEN,
  dagenTot,
  intervalTekst,
  plusMaandenVast,
  soortVanSjabloon,
  taakStatus,
  taakTitel,
  termijnTekst,
  volgendeNaUitvoering,
} from '@/lib/contracten';

describe('plusMaandenVast', () => {
  it('telt maanden op, ook over de jaargrens', () => {
    expect(plusMaandenVast('2026-10-01', 6)).toBe('2027-04-01');
    expect(plusMaandenVast('2026-03-15', 12)).toBe('2027-03-15');
    expect(plusMaandenVast('2026-11-30', 3)).toBe('2027-02-28');
    expect(plusMaandenVast('2026-05-10', 0)).toBe('2026-05-10');
    expect(plusMaandenVast('2026-05-10', -2)).toBe('2026-03-10');
  });

  it('valt terug op de laatste dag van de maand in plaats van door te schuiven', () => {
    expect(plusMaandenVast('2026-01-31', 1)).toBe('2026-02-28');
    expect(plusMaandenVast('2028-01-31', 1)).toBe('2028-02-29'); // schrikkeljaar
    expect(plusMaandenVast('2026-08-31', 6)).toBe('2027-02-28');
    expect(plusMaandenVast('2026-03-31', 1)).toBe('2026-04-30');
    // Een maandelijkse taak op de 31e blijft niet hangen op de 28e: elke keer vanaf de uitvoering.
    expect(plusMaandenVast('2026-02-28', 1)).toBe('2026-03-28');
  });

  it('weigert een ongeldige dag', () => {
    expect(() => plusMaandenVast('2026-02-30', 1)).toThrow();
    expect(() => plusMaandenVast('30-02-2026', 1)).toThrow();
    expect(() => plusMaandenVast('2026-02-10', 1.5)).toThrow();
  });
});

describe('volgendeNaUitvoering', () => {
  it('telt vanaf de dag van de uitvoering, ook als die te laat of te vroeg was', () => {
    // Gepland 1 oktober, twee weken te laat gedaan: de volgende keer schuift mee.
    expect(volgendeNaUitvoering('2026-10-15', 6)).toBe('2027-04-15');
    // Te vroeg gedaan: ook vanaf die dag, zodat er een vol interval tussen zit.
    expect(volgendeNaUitvoering('2026-09-20', 12)).toBe('2027-09-20');
  });

  it('weigert een interval buiten 1 tot 120 maanden', () => {
    expect(() => volgendeNaUitvoering('2026-10-01', 0)).toThrow();
    expect(() => volgendeNaUitvoering('2026-10-01', 121)).toThrow();
    expect(volgendeNaUitvoering('2026-10-01', 120)).toBe('2036-10-01');
  });
});

describe('taakStatus', () => {
  const vandaag = '2026-09-29';
  it('verlopen, binnenkort (tot en met 30 dagen) en later', () => {
    expect(taakStatus('2026-09-28', vandaag)).toBe('verlopen');
    expect(taakStatus('2026-09-29', vandaag)).toBe('binnenkort');
    expect(taakStatus('2026-10-29', vandaag)).toBe('binnenkort');
    expect(dagenTot('2026-10-29', vandaag)).toBe(BINNENKORT_DAGEN);
    expect(taakStatus('2026-10-30', vandaag)).toBe('later');
  });

  it('een taak op een komende planningsdag is gepland, ook als hij verlopen is', () => {
    expect(taakStatus('2026-09-01', vandaag, '2026-10-02')).toBe('gepland');
    expect(taakStatus('2026-09-01', vandaag, vandaag)).toBe('gepland');
    // Een dag in het verleden telt niet meer als gepland.
    expect(taakStatus('2026-09-01', vandaag, '2026-09-20')).toBe('verlopen');
  });

  it('dagenTot over de zomertijd heen blijft een heel getal', () => {
    expect(dagenTot('2026-10-26', '2026-10-24')).toBe(2);
    expect(dagenTot('2027-03-29', '2027-03-27')).toBe(2);
  });
});

describe('teksten', () => {
  it('interval', () => {
    expect(intervalTekst(1)).toBe('elke maand');
    expect(intervalTekst(6)).toBe('elke 6 maanden');
    expect(intervalTekst(12)).toBe('elk jaar');
    expect(intervalTekst(24)).toBe('elke 2 jaar');
    expect(intervalTekst(18)).toBe('elke 18 maanden');
  });

  it('termijn', () => {
    const vandaag = '2026-09-29';
    expect(termijnTekst('2026-09-29', vandaag)).toBe('vandaag');
    expect(termijnTekst('2026-09-30', vandaag)).toBe('morgen');
    expect(termijnTekst('2026-10-09', vandaag)).toBe('over 10 dagen');
    expect(termijnTekst('2026-09-28', vandaag)).toBe('1 dag te laat');
    expect(termijnTekst('2026-09-26', vandaag)).toBe('3 dagen te laat');
  });

  it('titel en sjabloon', () => {
    expect(taakTitel({ soort: 'persluchtlekken', omschrijving: null })).toBe('Persluchtlekinspectie');
    expect(taakTitel({ soort: 'onderhoud', omschrijving: '  Aggregaat  ' })).toBe('Aggregaat');
    expect(soortVanSjabloon('persluchtlekken')).toBe('persluchtlekken');
    expect(soortVanSjabloon('arbeidsmiddelen')).toBe('arbeidsmiddelen');
    expect(soortVanSjabloon('iets')).toBeNull();
  });
});
