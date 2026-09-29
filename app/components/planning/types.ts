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

export interface PlanStop {
  id: number;
  objectId: number;
  object: {
    id: number;
    name: string;
    objectType: string | null;
    lat: number | null;
    lng: number | null;
    address: string | null;
    estimatedMinutes: number | null;
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
  routeGeometry: string | null;
  routeDistance: number | null;
  routeDuration: number | null;
  manualOrder: boolean;
  stops: PlanStop[];
  werkMinuten: number;
  rijMinuten: number;
  totaalMinuten: number;
  teVol: boolean;
}
