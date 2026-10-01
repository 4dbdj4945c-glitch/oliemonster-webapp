// De planning zoals /api/sample-plans hem teruggeeft (lib/samplePlans.ts, haalPlanning).

export interface PlanMonster {
  id: number;
  oNumber: string;
  description: string;
  location: string;
  isTaken: boolean;
  sampleDate: string | null;
  oilType?: string | null;
  remarks?: string | null;
  photoUrl?: string | null;
  partPhotoUrl?: string | null;
  isUnreachable?: boolean;
  unreachableReason?: string | null;
}

export interface PlanObject {
  id: number;
  name: string;
  objectType: string | null;
  region: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  estimatedMinutes: number | null;
  klantNaam?: string | null;
  aantalMonsters: number;
  aantalGenomen: number;
  aantalOngepland: number;
  ongeplandeMonsters: PlanMonster[];
  werkMinuten: number;
}

/** Een contracttaak op een dag (fase 5). */
export interface PlanTaak {
  id: number;
  soort: string;
  soortLabel: string;
  titel: string;
  intervalMaanden: number;
  installatie: { id: number; naam: string } | null;
  contract: { id: number; naam: string };
  klant: { id: number; naam: string };
}

/** Een inspectiebezoek op een dag (fase 5). */
export interface PlanInspectie {
  id: number;
  nummer: string;
  sjabloon: string;
  naam: string;
  status: string;
  klant: { id: number; naam: string };
}

export interface PlanStop {
  id: number;
  /** monsters (oliemonsters, zoals altijd), taak (contracttaak) of inspectie */
  soort?: 'monsters' | 'taak' | 'inspectie';
  taak?: PlanTaak | null;
  inspectie?: PlanInspectie | null;
  objectId: number;
  object: {
    id: number;
    name: string;
    objectType: string | null;
    lat: number | null;
    lng: number | null;
    address: string | null;
    estimatedMinutes: number | null;
    klantId?: number | null;
    klantNaam?: string | null;
  };
  sampleIds: number[] | null;
  orderIndex: number;
  plannedMinutes: number | null;
  isDone: boolean;
  doneAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  samples: PlanMonster[];
  aantalMonsters: number;
  aantalGenomen: number;
  werkMinuten: number;
  werkelijkeMinuten: number | null;
}

export interface PlanDag {
  id: number;
  date: string;
  analysisYear: number;
  notes: string | null;
  /** Het traject; alleen in het antwoord voor één dag (het dagscherm), niet in de lijst. */
  routeGeometry?: string | null;
  /** Is de route van deze dag al berekend (er is een traject bewaard)? */
  routeBerekend: boolean;
  routeDistance: number | null;
  routeDuration: number | null;
  manualOrder: boolean;
  stops: PlanStop[];
  werkMinuten: number;
  rijMinuten: number;
  totaalMinuten: number;
  teVol: boolean;
}

/** Wat er naast de oliemonsters nog op een dag kan (GET /api/sample-plans, tePlannen). */
export interface TePlannenTaak {
  id: number;
  titel: string;
  soort: string;
  soortLabel: string;
  klant: { id: number; naam: string };
  contract: { id: number; naam: string };
  object: { id: number; name: string; address: string | null };
  installatie: { id: number; naam: string; code: string } | null;
  intervalMaanden: number;
  volgendeOp: string;
  minuten: number;
  status: 'verlopen' | 'binnenkort' | 'gepland' | 'later';
}

export interface TePlannenInspectie {
  id: number;
  sjabloon: string;
  datum: string;
  klant: { id: number; naam: string };
  object: { id: number; name: string };
}

export interface TePlannen {
  taken: TePlannenTaak[];
  inspecties: TePlannenInspectie[];
}

/** De naam van een stop: het object, of bij een taak of inspectie wat je er gaat doen. */
export function stopNaam(stop: Pick<PlanStop, 'soort' | 'taak' | 'inspectie' | 'object'>): string {
  if (stop.soort === 'taak' && stop.taak) return stop.taak.titel;
  if (stop.soort === 'inspectie' && stop.inspectie) return `${stop.inspectie.naam}, ${stop.inspectie.nummer}`;
  return stop.object.name;
}

/** Is dit een gewone oliemonsterstop? */
export function isMonsterStop(stop: Pick<PlanStop, 'soort'>): boolean {
  return !stop.soort || stop.soort === 'monsters';
}

/** "1 monster" of "3 monsters" */
export function monsters(aantal: number): string {
  return `${aantal} ${aantal === 1 ? 'monster' : 'monsters'}`;
}

/** "1 object" of "3 objecten" */
export function objectenWoord(aantal: number): string {
  return `${aantal} ${aantal === 1 ? 'object' : 'objecten'}`;
}

/** "3 objecten, 1 taak, 4 monsters" */
export function dagInhoud(d: Pick<PlanDag, 'stops'>): string {
  const olie = d.stops.filter(isMonsterStop);
  const taken = d.stops.filter((s) => s.soort === 'taak').length;
  const inspecties = d.stops.filter((s) => s.soort === 'inspectie').length;
  const delen = [objectenWoord(olie.length)];
  if (taken > 0) delen.push(`${taken} ${taken === 1 ? 'taak' : 'taken'}`);
  if (inspecties > 0) delen.push(`${inspecties} ${inspecties === 1 ? 'inspectie' : 'inspecties'}`);
  delen.push(monsters(olie.reduce((n, s) => n + s.aantalMonsters, 0)));
  return delen.join(', ');
}
