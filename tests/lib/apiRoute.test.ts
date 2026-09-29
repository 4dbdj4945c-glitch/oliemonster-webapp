// De API-helper: invoer lezen met zod en fouten in één vorm.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  ApiFout,
  antwoordBijFout,
  leesId,
  leesJson,
  leesQuery,
  optioneelGetal,
  optioneelId,
  optioneleDatum,
  optioneleTekst,
  tekst,
} from '@/lib/apiRoute';

const verzoekMet = (body: string) =>
  new Request('http://localhost/api/x', { method: 'POST', body, headers: { 'content-type': 'application/json' } });

const Schema = z.object({
  naam: tekst('Vul een naam in'),
  notities: optioneleTekst(),
  objectId: optioneelId('Onbekend object'),
  datum: optioneleDatum(),
  minuten: optioneelGetal('Tussen 0 en 10', 0, 10),
});

describe('leesJson', () => {
  it('leest en schoont de invoer op', async () => {
    const r = await leesJson(verzoekMet(JSON.stringify({ naam: '  Sluis  ', notities: '   ', objectId: '12', datum: '2026-09-29', minuten: '7' })), Schema);
    expect(r).toEqual({ naam: 'Sluis', notities: null, objectId: 12, datum: new Date('2026-09-29'), minuten: 7 });
  });

  it('laat niet meegestuurde velden weg en maakt lege velden null', async () => {
    const r = await leesJson(verzoekMet(JSON.stringify({ naam: 'x', objectId: '', datum: null })), Schema);
    expect(r.notities).toBeUndefined();
    expect(r.objectId).toBeNull();
    expect(r.datum).toBeNull();
  });

  it('geeft een 400 met de melding van het veld', async () => {
    const fout = await leesJson(verzoekMet(JSON.stringify({ naam: ' ', objectId: 'abc' })), Schema).catch((e) => e);
    const res = antwoordBijFout(fout, { fout: 'mis' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Vul een naam in');
    expect(body.velden).toMatchObject({ naam: 'Vul een naam in', objectId: 'Onbekend object' });
  });

  it('weigert kapotte JSON met een 400, en een lege body telt als {}', async () => {
    const fout = await leesJson(verzoekMet('{kapot'), Schema).catch((e) => e);
    expect(fout).toBeInstanceOf(ApiFout);
    expect(antwoordBijFout(fout, { fout: 'mis' }).status).toBe(400);
    const leeg = await leesJson(verzoekMet(''), z.object({ a: optioneleTekst() }));
    expect(leeg).toEqual({});
  });
});

describe('leesId en leesQuery', () => {
  it('leest een id uit de routeparameters', async () => {
    expect(await leesId({ params: Promise.resolve({ id: '42' }) })).toBe(42);
    expect(await leesId({ params: Promise.resolve({ attemptId: '7' }) }, 'x', 'attemptId')).toBe(7);
    for (const slecht of ['abc', '-1', '0', '1.5', '']) {
      await expect(leesId({ params: Promise.resolve({ id: slecht }) }, 'Onbekend monster')).rejects.toMatchObject({ status: 400, message: 'Onbekend monster' });
    }
  });

  it('leest de query met een schema', () => {
    const r = leesQuery(new Request('http://localhost/api/x?year=2026'), z.object({ year: z.coerce.number() }));
    expect(r.year).toBe(2026);
  });
});

describe('antwoordBijFout', () => {
  it('ApiFout houdt status, melding en extra velden', async () => {
    const res = antwoordBijFout(new ApiFout(409, 'Staat in de prullenbak', { inPrullenbak: 3 }), { fout: 'mis' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Staat in de prullenbak', inPrullenbak: 3 });
  });

  it('een ontbrekende tabel wordt een 503, iets anders een 500 met de eigen melding', async () => {
    const ontbreekt = antwoordBijFout({ code: 'P2021' }, { fout: 'mis', ontbreekt: 'Draai het script' });
    expect(ontbreekt.status).toBe(503);
    expect((await ontbreekt.json()).error).toBe('Draai het script');
    const orig = console.error;
    console.error = () => {};
    const anders = antwoordBijFout(new Error('stuk'), { fout: 'Fout bij opslaan' });
    console.error = orig;
    expect(anders.status).toBe(500);
    expect(await anders.json()).toEqual({ error: 'Fout bij opslaan' });
  });
});
