import { describe, expect, it } from 'vitest';
import { PLANNING, datumAlsInvoer, geschatteMinuten, isWerkdag, minutenAlsTekst } from '@/lib/planningInstellingen';
import { leesSampleIds, rijMinuten, schrijfSampleIds } from '@/lib/samplePlans';

describe('geschatteMinuten', () => {
  it('opstarten plus een vaste tijd per monster', () => {
    expect(geschatteMinuten(null, 3)).toBe(PLANNING.opstartMinuten + 3 * PLANNING.minutenPerMonster);
  });
  it('een eigen inschatting op het object gaat voor', () => {
    expect(geschatteMinuten(90, 3)).toBe(90);
  });
  it('geen monsters is geen werk, ook met een inschatting', () => {
    expect(geschatteMinuten(90, 0)).toBe(0);
  });
});

describe('rijMinuten', () => {
  it('de rijtijd van OSRM als die er is', () => {
    expect(rijMinuten(1800, 30000)).toBe(30);
  });
  it('anders geschat uit de afstand', () => {
    expect(rijMinuten(null, 60000)).toBe(Math.round((60 / PLANNING.gemiddeldeSnelheidKmU) * 60));
  });
  it('niets bekend: 0', () => {
    expect(rijMinuten(null, null)).toBe(0);
  });
});

describe('sampleIds van een stop', () => {
  it('lezen', () => {
    expect(leesSampleIds('[12, 13]')).toEqual([12, 13]);
    expect(leesSampleIds('[]')).toBeNull();
    expect(leesSampleIds(null)).toBeNull();
    expect(leesSampleIds('kapot')).toBeNull();
  });
  it('schrijven', () => {
    expect(schrijfSampleIds([1, '2', 'x'])).toBe('[1,2]');
    expect(schrijfSampleIds([])).toBeNull();
    expect(schrijfSampleIds('geen lijst')).toBeNull();
  });
});

describe('datums en tijden', () => {
  it('werkdagen ma-vr', () => {
    expect(isWerkdag(new Date(2026, 9, 5))).toBe(true); // maandag
    expect(isWerkdag(new Date(2026, 9, 10))).toBe(false); // zaterdag
  });
  it('minutenAlsTekst', () => {
    expect(minutenAlsTekst(0)).toBe('0 min');
    expect(minutenAlsTekst(45)).toBe('45 min');
    expect(minutenAlsTekst(120)).toBe('2 uur');
    expect(minutenAlsTekst(330)).toBe('5 uur 30');
  });
  it('datumAlsInvoer in de lokale tijdzone', () => {
    expect(datumAlsInvoer(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
