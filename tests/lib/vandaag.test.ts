// Het startscherm Vandaag: welke dag, wat staat open, voortgang per opdracht.
import { describe, expect, it } from 'vitest';
import { bouwVandaag, kaartenLink, kmTekst, korteDatum, type VandaagDag } from '@/lib/vandaag';

function dag(id: number, datum: string, stops: { objectId: number; samples: { id: number; isTaken: boolean }[] }[]): VandaagDag {
  return {
    id,
    // Zoals de planning hem opslaat: middernacht in de eigen tijdzone
    date: new Date(`${datum}T00:00:00`).toISOString(),
    analysisYear: 2026,
    notes: null,
    routeDistance: 168000,
    werkMinuten: 300,
    rijMinuten: 120,
    totaalMinuten: 420,
    stops: stops.map((s, i) => ({
      id: id * 10 + i,
      objectId: s.objectId,
      object: { name: `Object ${s.objectId}`, lat: null, lng: null, address: null },
      samples: s.samples,
      aantalMonsters: s.samples.length,
      aantalGenomen: s.samples.filter((m) => m.isTaken).length,
      werkMinuten: 60,
      isDone: false,
    })),
  };
}

const monsters = [
  { id: 1, isTaken: true, object: { id: 1 } },
  { id: 2, isTaken: false, object: { id: 1 } },
  { id: 3, isTaken: false, object: { id: 2 } },
  { id: 4, isTaken: false, isUnreachable: true, object: { id: 2 } },
  { id: 5, isTaken: false, object: { id: 3 } },
  { id: 6, isTaken: false, isDisabled: true, object: { id: 3 } },
  { id: 7, isTaken: false, object: null },
  { id: 8, isTaken: false, object: { id: 3 } },
];
const objecten = [
  { id: 1, klantNaam: 'Mourik' },
  { id: 2, klantNaam: 'Mourik' },
  { id: 3, klantNaam: null },
];

describe('bouwVandaag', () => {
  const dagen = [
    dag(3, '2026-10-20', [{ objectId: 3, samples: [{ id: 8, isTaken: false }] }]),
    dag(1, '2026-10-06', [{ objectId: 1, samples: [{ id: 1, isTaken: true }, { id: 2, isTaken: false }] }]),
    dag(2, '2026-10-08', [{ objectId: 2, samples: [{ id: 3, isTaken: false }, { id: 4, isTaken: false }] }]),
    dag(0, '2026-10-01', [{ objectId: 3, samples: [{ id: 5, isTaken: false }] }]),
  ];

  it('vindt de dag van vandaag en de dagen deze week', () => {
    const o = bouwVandaag(dagen, monsters, objecten, 2026, '2026-10-06');
    expect(o.dag?.id).toBe(1);
    expect(o.dezeWeek.map((d) => d.id)).toEqual([2]);
    expect(o.eerstvolgende?.id).toBe(2);
  });

  it('telt elk open monster één keer, geannuleerde niet', () => {
    const o = bouwVandaag(dagen, monsters, objecten, 2026, '2026-10-06');
    // 2 vandaag; 3, 4 en 8 later (4 is niet bereikbaar maar staat op een dag);
    // 5 stond op een dag in het verleden en 7 nergens: niet ingepland.
    expect(o.open).toEqual({ vandaag: 1, later: 3, nietIngepland: 2, nietBereikbaar: 0, totaal: 6 });
  });

  it('niet bereikbaar zonder dag telt apart', () => {
    const o = bouwVandaag([], monsters, objecten, 2026, '2026-10-06');
    expect(o.dag).toBeNull();
    expect(o.open).toEqual({ vandaag: 0, later: 0, nietIngepland: 5, nietBereikbaar: 1, totaal: 6 });
  });

  it('voortgang per opdracht: per klant, de rest zonder klant', () => {
    const o = bouwVandaag(dagen, monsters, objecten, 2026, '2026-10-06');
    expect(o.opdrachten).toEqual([
      { naam: 'Mourik, oliemonsters 2026', totaal: 4, genomen: 1, vandaag: 1, later: 2, open: 0 },
      { naam: 'Oliemonsters 2026', totaal: 3, genomen: 0, vandaag: 0, later: 1, open: 2 },
    ]);
  });

  it('niets gepland vandaag: geen dag, wel de eerstvolgende', () => {
    const o = bouwVandaag(dagen, monsters, objecten, 2026, '2026-10-15');
    expect(o.dag).toBeNull();
    expect(o.dezeWeek.map((d) => d.id)).toEqual([3]);
    expect(bouwVandaag(dagen, monsters, objecten, 2026, '2026-09-01').dezeWeek).toEqual([]);
    expect(bouwVandaag(dagen, monsters, objecten, 2026, '2026-09-01').eerstvolgende?.id).toBe(0);
  });
});

describe('kleine hulpjes', () => {
  it('kaartenlink met coordinaten of adres', () => {
    expect(kaartenLink({ lat: 51.7, lng: 5.7 })).toBe('https://maps.apple.com/?daddr=51.7,5.7');
    expect(kaartenLink({ lat: null, lng: null, address: 'Trambaan 15, Echt' })).toBe(
      'https://maps.apple.com/?daddr=Trambaan%2015%2C%20Echt'
    );
    expect(kaartenLink({ lat: null, lng: null, address: ' ' })).toBeNull();
  });

  it('kilometers en korte datum zonder punt', () => {
    expect(kmTekst(168400)).toBe('168 km');
    expect(kmTekst(1234567)).toBe('1.235 km');
    expect(kmTekst(0)).toBeNull();
    expect(korteDatum(new Date(2026, 9, 7))).toBe('wo 7 okt');
  });
});
