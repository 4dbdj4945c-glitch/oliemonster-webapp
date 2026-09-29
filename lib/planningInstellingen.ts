// Alle rekenwaarden van de planning op één plek. Wil je er iets aan veranderen,
// dan doe je dat hier: de schermen en de routeberekening lezen deze waarden.
// (Later kan dit blok naar Settings in de database, dan is het via de app te
// wijzigen zonder nieuwe versie.)

export const PLANNING = {
  /** Vaste tijd per monster als een object geen eigen inschatting heeft */
  minutenPerMonster: 15,
  /** Opstarten per object: aankomen, spullen klaarzetten, opruimen */
  opstartMinuten: 30,
  /** Lengte van een werkdag in minuten, inclusief reizen (offerte: 8 uur) */
  werkdagMinuten: 8 * 60,
  /**
   * Tot hoe vol een dag bij het verdelen gevuld wordt. Het verdelen schat de
   * reistijd hemelsbreed; de echte route (OSRM) valt hier bijna altijd hoger
   * uit. Zonder marge komt elke net gevulde dag daarna terug als "te vol".
   */
  vulMarge: 0.9,
  /** Dagen waarop gewerkt wordt: 1 = maandag, 5 = vrijdag (zondag = 0) */
  werkdagen: [1, 2, 3, 4, 5],
  /** Vertrek- en eindpunt van elke dag: de werkplek in Heeze */
  thuis: {
    lat: 51.38150896,
    lng: 5.568305,
    adres: 'Warande 11, Heeze',
  },
  /** Gemiddelde snelheid (km/u) voor de schatting als OSRM geen rijtijd geeft */
  gemiddeldeSnelheidKmU: 60,
  /**
   * Geschatte tijd voor een inspectiebezoek op de planning, als de stop zelf
   * geen tijd heeft. Een contracttaak heeft een eigen standaard per soort
   * (lib/contracten.ts, TAAK_SOORT_INFO).
   */
  inspectieMinuten: 180,
} as const;

/** Is deze datum een werkdag volgens de instellingen hierboven? */
export function isWerkdag(datum: Date): boolean {
  return (PLANNING.werkdagen as readonly number[]).includes(datum.getDay());
}

/**
 * Geschatte werktijd op een object, in minuten. Heeft het object een eigen
 * inschatting, dan telt die. Anders: opstarten plus de vaste tijd per monster.
 * Geannuleerde monsters tellen niet mee, die worden hier al niet meegegeven.
 */
export function geschatteMinuten(
  geschatOpObject: number | null | undefined,
  aantalMonsters: number
): number {
  // Geen monsters meer (alles genomen of geannuleerd) is geen werk, ook niet als
  // er een inschatting op het object staat.
  if (aantalMonsters <= 0) return 0;
  if (geschatOpObject && geschatOpObject > 0) return geschatOpObject;
  return PLANNING.opstartMinuten + aantalMonsters * PLANNING.minutenPerMonster;
}

/** "5 uur 30", "45 min" of "0 min" */
export function minutenAlsTekst(minuten: number): string {
  const afgerond = Math.round(minuten);
  if (afgerond <= 0) return '0 min';
  const uren = Math.floor(afgerond / 60);
  const rest = afgerond % 60;
  if (uren === 0) return `${rest} min`;
  if (rest === 0) return `${uren} uur`;
  return `${uren} uur ${rest}`;
}

/** Datum als "ma 6 april 2026" */
export function datumAlsTekst(datum: string | Date): string {
  const d = typeof datum === 'string' ? new Date(datum) : datum;
  return d.toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Datum als yyyy-mm-dd, in de lokale tijdzone (niet via toISOString) */
export function datumAlsInvoer(datum: string | Date): string {
  const d = typeof datum === 'string' ? new Date(datum) : datum;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
