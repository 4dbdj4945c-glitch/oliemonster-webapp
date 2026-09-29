// Gedeelde types van de oliemonsterpagina (app/dashboard/oliemonsters/[jaar]).

export interface OilSample {
  id: number;
  oNumber: string;
  analysisYear?: number;
  sampleDate: string | null;
  location: string;
  description: string;
  oilType?: string;
  remarks?: string;
  isTaken: boolean;
  isDisabled?: boolean;
  photoUrl?: string;
  attemptsCount?: number;
  objectId?: number | null;
  object?: { id: number; name: string; objectType?: string | null } | null;
  installatieId?: number | null;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  cancelReasonInPdf?: boolean;
  /** Foto van het onderdeel waar het monster vandaan komt; photoUrl is het potje */
  partPhotoUrl?: string | null;
  /** Niet bereikbaar: blijft openstaan en telt mee in de planning */
  isUnreachable?: boolean;
  unreachableReason?: string | null;
  unreachableNote?: string | null;
  unreachablePhotoUrl?: string | null;
  unreachableAt?: string | null;
  unreachableBy?: string | null;
}

export interface SampleObject {
  id: number;
  name: string;
  objectType: string | null;
}

export type Sortering = 'oNumber' | 'sampleDate' | 'location' | 'newest';
