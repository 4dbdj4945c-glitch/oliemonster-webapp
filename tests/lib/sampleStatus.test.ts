import { describe, expect, it } from 'vitest';
import { sampleStatus, staatNogOpen, telStatussen } from '@/lib/sampleStatus';

describe('sampleStatus', () => {
  it('geannuleerd gaat voor alles', () => {
    expect(sampleStatus({ isTaken: true, isDisabled: true, isUnreachable: true })).toBe('geannuleerd');
  });
  it('genomen gaat voor niet bereikbaar', () => {
    expect(sampleStatus({ isTaken: true, isUnreachable: true })).toBe('genomen');
  });
  it('niet bereikbaar als het nog open staat', () => {
    expect(sampleStatus({ isTaken: false, isUnreachable: true })).toBe('niet-bereikbaar');
  });
  it('anders niet genomen', () => {
    expect(sampleStatus({ isTaken: false })).toBe('niet-genomen');
    expect(sampleStatus({ isTaken: false, isDisabled: null, isUnreachable: null })).toBe('niet-genomen');
  });
});

describe('staatNogOpen', () => {
  it('open en niet bereikbaar tellen mee in de planning, genomen en geannuleerd niet', () => {
    expect(staatNogOpen({ isTaken: false })).toBe(true);
    expect(staatNogOpen({ isTaken: false, isUnreachable: true })).toBe(true);
    expect(staatNogOpen({ isTaken: true })).toBe(false);
    expect(staatNogOpen({ isTaken: false, isDisabled: true })).toBe(false);
  });
});

describe('telStatussen', () => {
  it('telt elke status', () => {
    const totalen = telStatussen([
      { isTaken: true },
      { isTaken: true },
      { isTaken: false },
      { isTaken: false, isUnreachable: true },
      { isTaken: false, isDisabled: true },
    ]);
    expect(totalen).toEqual({ genomen: 2, 'niet-genomen': 1, 'niet-bereikbaar': 1, geannuleerd: 1 });
  });
  it('lege lijst geeft nullen', () => {
    expect(telStatussen([])).toEqual({ genomen: 0, 'niet-genomen': 0, 'niet-bereikbaar': 0, geannuleerd: 0 });
  });
});
