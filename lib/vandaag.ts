// Het startscherm Vandaag: wat staat er vandaag, deze week en hoe ver is elke
// opdracht. Rekent alleen met wat de schermen al ophalen (de planning, de
// monsters en de prospects), zonder eigen API, zodat de getallen precies gelijk
// zijn aan die op de planning en de monsterlijst.
//
// Datums: een dag van de planning staat als middernacht in de database. We
// vergelijken altijd de kalenderdag in de tijdzone van de browser (jjjj-mm-dd),
// zoals de planning zelf doet (datumAlsInvoer).
//
// Geen server-imports hier: dit bestand draait in de browser.

import { datumAlsInvoer } from './planningInstellingen';

export interface VandaagMonster {
  id: number;
  isTaken: boolean;
  isDisabled?: boolean;
  isUnreachable?: boolean;
  object?: { id: number } | null;
}

export interface VandaagStop {
  id: number;
  objectId: number;
  object: { name: string; lat: number | null; lng: number | null; address: string | null };
  samples: { id: number; isTaken: boolean }[];
  aantalMonsters: number;
  aantalGenomen: number;
  werkMinuten: number;
  isDone: boolean;
}

export interface VandaagDag {
  id: number;
  date: string;
  analysisYear: number;
  notes: string | null;
  routeDistance: number | null;
  stops: VandaagStop[];
  werkMinuten: number;
  rijMinuten: number;
  totaalMinuten: number;
}

export interface VandaagObject {
  id: number;
  klantNaam?: string | null;
}

export interface OpenTelling {
  vandaag: number;
  later: number;
  nietIngepland: number;
  nietBereikbaar: number;
  totaal: number;
}

export interface Opdracht {
  naam: string;
  totaal: number;
  genomen: number;
  vandaag: number;
  later: number;
  /** Open en nog niet op vandaag of een latere dag */
  open: number;
}

export interface VandaagOverzicht {
  /** De monsterdag van vandaag, of null */
  dag: VandaagDag | null;
  /** De volgende dagen deze week (tot en met zeven dagen vooruit), hoogstens vier */
  dezeWeek: VandaagDag[];
  /** De eerstvolgende dag na vandaag, ook als die verder weg ligt */
  eerstvolgende: VandaagDag | null;
  open: OpenTelling;
  opdrachten: Opdracht[];
}

/** Vandaag als jjjj-mm-dd in de eigen tijdzone. */
export function vandaagSleutel(nu = new Date()): string {
  return datumAlsInvoer(nu);
}

/** Een dag van de planning als jjjj-mm-dd in de eigen tijdzone. */
export function dagSleutel(datum: string | Date): string {
  return datumAlsInvoer(datum);
}

function plusDagen(sleutel: string, n: number): string {
  const [j, m, d] = sleutel.split('-').map(Number);
  return datumAlsInvoer(new Date(j, m - 1, d + n));
}

/** De monster-ids die op een dag staan en nog open zijn, over alle stops. */
function openOpDag(dag: VandaagDag): number[] {
  return dag.stops.flatMap((s) => s.samples.filter((m) => !m.isTaken).map((m) => m.id));
}

export function bouwVandaag(
  dagen: VandaagDag[],
  monsters: VandaagMonster[],
  objecten: VandaagObject[],
  jaar: number,
  vandaag: string = vandaagSleutel()
): VandaagOverzicht {
  const gesorteerd = [...dagen].sort((a, b) => dagSleutel(a.date).localeCompare(dagSleutel(b.date)));
  const dag = gesorteerd.find((d) => dagSleutel(d.date) === vandaag) ?? null;
  const toekomst = gesorteerd.filter((d) => dagSleutel(d.date) > vandaag);
  const grens = plusDagen(vandaag, 7);
  const dezeWeek = toekomst.filter((d) => dagSleutel(d.date) <= grens).slice(0, 4);

  const opVandaag = new Set(dag ? openOpDag(dag) : []);
  const opLater = new Set(toekomst.flatMap(openOpDag));

  // Elk open monster telt precies één keer: vandaag gaat voor later, later voor
  // niet bereikbaar, en de rest is nog niet ingepland (ook een monster dat op
  // een dag in het verleden stond en niet genomen is).
  const soort = (m: VandaagMonster): keyof Omit<OpenTelling, 'totaal'> => {
    if (opVandaag.has(m.id)) return 'vandaag';
    if (opLater.has(m.id)) return 'later';
    if (m.isUnreachable) return 'nietBereikbaar';
    return 'nietIngepland';
  };

  const open: OpenTelling = { vandaag: 0, later: 0, nietIngepland: 0, nietBereikbaar: 0, totaal: 0 };
  const klantVan = new Map(objecten.map((o) => [o.id, o.klantNaam ?? null]));
  const perOpdracht = new Map<string, Opdracht>();

  for (const m of monsters) {
    if (m.isDisabled) continue;
    const klant = (m.object && klantVan.get(m.object.id)) || null;
    const naam = klant ? `${klant}, oliemonsters ${jaar}` : `Oliemonsters ${jaar}`;
    const o = perOpdracht.get(naam) ?? { naam, totaal: 0, genomen: 0, vandaag: 0, later: 0, open: 0 };
    o.totaal += 1;
    if (m.isTaken) {
      o.genomen += 1;
    } else {
      const s = soort(m);
      open[s] += 1;
      open.totaal += 1;
      if (s === 'vandaag') o.vandaag += 1;
      else if (s === 'later') o.later += 1;
      else o.open += 1;
    }
    perOpdracht.set(naam, o);
  }

  const opdrachten = [...perOpdracht.values()].sort((a, b) => b.totaal - a.totaal || a.naam.localeCompare(b.naam, 'nl'));

  return { dag, dezeWeek, eerstvolgende: toekomst[0] ?? null, open, opdrachten };
}

/**
 * Link naar de route in Kaarten (Apple Kaarten op de iPhone, in een andere
 * browser de webversie). Met coordinaten als die er zijn, anders het adres.
 */
export function kaartenLink(object: { lat: number | null; lng: number | null; address?: string | null; name?: string }): string | null {
  if (object.lat !== null && object.lng !== null) {
    return `https://maps.apple.com/?daddr=${object.lat},${object.lng}`;
  }
  const adres = object.address?.trim();
  return adres ? `https://maps.apple.com/?daddr=${encodeURIComponent(adres)}` : null;
}

/** "Goedemorgen", "Goedemiddag" of "Goedenavond". */
export function begroeting(nu = new Date()): string {
  const uur = nu.getHours();
  if (uur < 12) return 'Goedemorgen';
  if (uur < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

/** "Dinsdag 29 september" */
export function datumTitel(nu = new Date()): string {
  const t = nu.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "wo 7 okt" */
export function korteDatum(datum: string | Date): string {
  const d = typeof datum === 'string' ? new Date(datum) : datum;
  return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
}

/** Kilometers zoals de portal ze schrijft: "168 km", nooit met een punt. */
export function kmTekst(meters: number | null | undefined): string | null {
  if (!meters || meters <= 0) return null;
  return `${Math.round(meters / 1000).toLocaleString('nl-NL')} km`;
}
