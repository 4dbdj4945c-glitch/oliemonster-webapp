// De offline wachtrij in de browser (lib/wachtrij.ts), zonder browser: een
// opslag in het geheugen en een nep-fetch. Wat blijft staan, wat gaat weg, en
// dat elke poging dezelfde idempotentiesleutel meestuurt.
import { describe, expect, it } from 'vitest';
import { GEEN_VERBINDING, IDEMPOTENTIE_HEADER, MAX_POGINGEN, verstuur, verwerk, type Invoer, type Opslag } from '@/lib/wachtrij';

function geheugen(begin: Invoer[] = []): Opslag & { lijst: Map<string, Invoer> } {
  const lijst = new Map(begin.map((i) => [i.sleutel, i]));
  return {
    lijst,
    async alle() {
      return [...lijst.values()];
    },
    async zet(i) {
      lijst.set(i.sleutel, i);
    },
    async weg(s) {
      lijst.delete(s);
    },
  };
}

const monster = (sleutel: string, extra: Partial<Invoer> = {}): Invoer => ({
  sleutel,
  soort: 'monster-nemen',
  gebruiker: 'admin',
  titel: `${sleutel} nemen`,
  aangemaakt: Number(sleutel.replace(/\D/g, '')) || 1,
  monsterId: 12,
  velden: { sampleDate: '2026-09-29', oilType: 'HLP 46', remarks: '' },
  bestanden: [{ veld: 'photoPotje', naam: 'potje.jpg', blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }) }],
  status: 'wacht',
  pogingen: 0,
  ...extra,
});

type Oproep = { url: string; sleutel: string | null; body: BodyInit | null | undefined };

function nepFetch(antwoorden: (Response | Error)[]) {
  const oproepen: Oproep[] = [];
  const fn = async (url: string, init: RequestInit) => {
    const kop = new Headers(init.headers);
    oproepen.push({ url, sleutel: kop.get(IDEMPOTENTIE_HEADER), body: init.body });
    const a = antwoorden.shift();
    if (!a) throw new Error('geen antwoord meer');
    if (a instanceof Error) throw a;
    return a;
  };
  return { fn, oproepen };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('verstuur', () => {
  it('Monster nemen: multipart met velden en foto, en de sleutel als header', async () => {
    const { fn, oproepen } = nepFetch([json(200, { id: 12 })]);
    const { uitkomst } = await verstuur(monster('a1'), fn);
    expect(uitkomst).toEqual({ soort: 'klaar' });
    expect(oproepen[0].url).toBe('/api/samples/12/nemen');
    expect(oproepen[0].sleutel).toBe('a1');
    const form = oproepen[0].body as FormData;
    expect(form.get('sampleDate')).toBe('2026-09-29');
    expect((form.get('photoPotje') as File).name).toBe('potje.jpg');
  });

  it('geen verbinding blijft wachten; serverfout later; 400 is definitief; 409 bezig later', async () => {
    expect((await verstuur(monster('a1'), nepFetch([new TypeError('Failed to fetch')]).fn)).uitkomst).toEqual({ soort: 'later', melding: GEEN_VERBINDING });
    expect((await verstuur(monster('a1'), nepFetch([json(503, { error: 'Database niet bij' })]).fn)).uitkomst).toEqual({ soort: 'later', melding: 'Database niet bij' });
    expect((await verstuur(monster('a1', { pogingen: MAX_POGINGEN - 1 }), nepFetch([json(500, { error: 'Stuk' })]).fn)).uitkomst.soort).toBe('mislukt');
    expect((await verstuur(monster('a1'), nepFetch([json(400, { error: 'Dit monster is geannuleerd.' })]).fn)).uitkomst).toEqual({ soort: 'mislukt', melding: 'Dit monster is geannuleerd.' });
    expect((await verstuur(monster('a1'), nepFetch([json(409, { error: 'bezig', bezig: true })]).fn)).uitkomst.soort).toBe('later');
    // Afgeronde inspectie (409 zonder bezig): definitief, met de melding van de server.
    expect((await verstuur(monster('a1'), nepFetch([json(409, { error: 'Deze inspectie is afgerond', afgerond: true })]).fn)).uitkomst).toEqual({ soort: 'mislukt', melding: 'Deze inspectie is afgerond' });
    expect((await verstuur(monster('a1'), nepFetch([json(401, { error: 'Niet geautoriseerd' })]).fn)).uitkomst.soort).toBe('later');
  });

  it('bevinding: eerst de gegevens, dan de foto; valt de verbinding weg na de gegevens, dan de volgende keer alleen de foto', async () => {
    const bevinding: Invoer = {
      sleutel: 'b1',
      soort: 'inspectie-item',
      gebruiker: 'admin',
      titel: 'Lek 204, INS-5',
      aangemaakt: 1,
      inspectieId: 5,
      json: { titel: '204' },
      foto: { veld: 'photo', naam: 'lek.jpg', blob: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }) },
      status: 'wacht',
      pogingen: 0,
    };
    const eerst = nepFetch([json(201, { itemId: 77 }), new TypeError('Failed to fetch')]);
    const r1 = await verstuur(bevinding, eerst.fn);
    expect(r1.uitkomst.soort).toBe('later');
    expect(r1.invoer.itemId).toBe(77);
    expect(eerst.oproepen.map((o) => o.url)).toEqual(['/api/inspecties/5/items', '/api/inspectie-items/77/fotos']);
    expect(eerst.oproepen[0].sleutel).toBe('b1');

    const daarna = nepFetch([json(200, {})]);
    const r2 = await verstuur(r1.invoer, daarna.fn);
    expect(r2.uitkomst).toEqual({ soort: 'klaar' });
    expect(daarna.oproepen.map((o) => o.url)).toEqual(['/api/inspectie-items/77/fotos']);
  });

  it("meerdere foto's: één voor één met een eigen sleutel; na een onderbreking alleen de rest", async () => {
    const blob = () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' });
    const bevinding: Invoer = {
      sleutel: 'b2',
      soort: 'inspectie-item',
      gebruiker: 'admin',
      titel: 'Bron 6, INS-5',
      aangemaakt: 1,
      inspectieId: 5,
      json: { titel: 'Bron 6' },
      fotos: [1, 2, 3].map((n) => ({ veld: 'photo', naam: `f${n}.jpg`, blob: blob() })),
      status: 'wacht',
      pogingen: 0,
    };
    const eerst = nepFetch([json(201, { itemId: 9 }), json(200, {}), new TypeError('Failed to fetch')]);
    const r1 = await verstuur(bevinding, eerst.fn);
    expect(r1.uitkomst.soort).toBe('later');
    expect(r1.invoer.fotosKlaar).toBe(1);
    expect(eerst.oproepen.map((o) => o.sleutel)).toEqual(['b2', 'b2-f0', 'b2-f1']);
    const daarna = nepFetch([json(200, {}), json(200, {})]);
    const r2 = await verstuur(r1.invoer, daarna.fn);
    expect(r2.uitkomst).toEqual({ soort: 'klaar' });
    expect(daarna.oproepen.map((o) => o.sleutel)).toEqual(['b2-f1', 'b2-f2']);
  });

  it("foto's bij een bevinding die al op de server staat: alleen de foto's, met de sleutel van het scherm", async () => {
    const blob = new Blob([new Uint8Array([1])], { type: 'image/jpeg' });
    const alleenFotos: Invoer = {
      sleutel: 'b3', soort: 'inspectie-item', gebruiker: 'admin', titel: "2 foto's", aangemaakt: 1, inspectieId: 5, itemId: 12,
      fotos: [{ veld: 'photo', naam: 'a.jpg', blob, sleutel: 'scherm-sleutel-a' }, { veld: 'photo', naam: 'b.jpg', blob, sleutel: 'scherm-sleutel-b', bijschrift: 'Flens 3' }],
      status: 'wacht', pogingen: 0,
    };
    const f = nepFetch([json(200, {}), json(200, {})]);
    expect((await verstuur(alleenFotos, f.fn)).uitkomst).toEqual({ soort: 'klaar' });
    expect(f.oproepen.map((o) => [o.url, o.sleutel])).toEqual([['/api/inspectie-items/12/fotos', 'scherm-sleutel-a'], ['/api/inspectie-items/12/fotos', 'scherm-sleutel-b']]);
    expect((f.oproepen[1].body as FormData).get('bijschrift')).toBe('Flens 3');
  });
});

describe('verwerk', () => {
  it('oudste eerst, verstuurd gaat weg, stopt bij de eerste netwerkfout, pogingen tellen alleen bij een serverfout', async () => {
    const opslag = geheugen([monster('a3'), monster('a1'), monster('a2')]);
    const { fn, oproepen } = nepFetch([json(200, {}), new TypeError('Failed to fetch')]);
    const uit = await verwerk(opslag, 'admin', { doeFetch: fn });
    expect(oproepen.map((o) => o.sleutel)).toEqual(['a1', 'a2']);
    expect(uit).toEqual({ verstuurd: 1, wacht: 2, mislukt: 0 });
    expect(opslag.lijst.get('a2')).toMatchObject({ status: 'wacht', pogingen: 0, laatsteFout: GEEN_VERBINDING });

    // Weer bereik: dezelfde sleutels opnieuw, dus de server doet niets dubbel.
    const weer = nepFetch([json(200, {}), json(200, {})]);
    expect(await verwerk(opslag, 'admin', { doeFetch: weer.fn })).toEqual({ verstuurd: 2, wacht: 0, mislukt: 0 });
    expect(weer.oproepen.map((o) => o.sleutel)).toEqual(['a2', 'a3']);
    expect(opslag.lijst.size).toBe(0);
  });

  it('een definitief mislukte invoer blijft staan tot Opnieuw proberen; een andere gebruiker blijft buiten', async () => {
    const opslag = geheugen([monster('a1'), monster('a2', { gebruiker: 'gebruiker' })]);
    await verwerk(opslag, 'admin', { doeFetch: nepFetch([json(400, { error: 'Onbekend monster' })]).fn });
    expect(opslag.lijst.get('a1')).toMatchObject({ status: 'mislukt', laatsteFout: 'Onbekend monster' });
    // Vanzelf: niet opnieuw.
    const stil = nepFetch([]);
    await verwerk(opslag, 'admin', { doeFetch: stil.fn });
    expect(stil.oproepen).toHaveLength(0);
    // Opnieuw proberen: wel, met dezelfde sleutel.
    const handmatig = nepFetch([json(200, {})]);
    expect(await verwerk(opslag, 'admin', { doeFetch: handmatig.fn, ookMislukt: true })).toEqual({ verstuurd: 1, wacht: 0, mislukt: 0 });
    expect(handmatig.oproepen[0].sleutel).toBe('a1');
    expect(opslag.lijst.has('a2')).toBe(true);
  });

  it('na te veel serverfouten stopt het vanzelf opnieuw proberen', async () => {
    const opslag = geheugen([monster('a1')]);
    for (let i = 0; i < MAX_POGINGEN; i++) await verwerk(opslag, 'admin', { doeFetch: nepFetch([json(500, { error: 'Stuk' })]).fn });
    expect(opslag.lijst.get('a1')).toMatchObject({ status: 'mislukt', pogingen: MAX_POGINGEN });
  });
});
