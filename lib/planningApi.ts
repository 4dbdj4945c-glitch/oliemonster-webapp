// Kleine helpers die de API-routes van de planningsmodule delen: selects en
// een nette melding zolang de tabellen nog niet in de database
// staan. Zelfde patroon als lib/prospectApi.ts (module Acquisitie).

import { NextResponse } from 'next/server';
import { maakFoutAntwoord } from './kolommen';

export { tabelOntbreekt } from './kolommen';

export const TABEL_ONTBREEKT_PLANNING =
  'De tabellen van de planningsmodule staan nog niet in de database. Draai ./db-push-planning.sh in de projectmap en ververs deze pagina.';

/** Standaard foutantwoord: 503 met uitleg als de tabel ontbreekt, anders 500. */
export function foutAntwoord(error: unknown, melding: string): NextResponse {
  return maakFoutAntwoord(error, melding, TABEL_ONTBREEKT_PLANNING);
}

/**
 * De velden die OilSample had vóór de planningsmodule. Zolang `prisma db push`
 * nog niet gedraaid is, bestaan objectId en de annuleervelden niet in de
 * database; een gewone findMany (die alle kolommen opvraagt) loopt dan stuk.
 * Met deze select blijven de monsterlijsten gewoon werken.
 */
export const SAMPLE_BASIS_SELECT = {
  id: true,
  oNumber: true,
  analysisYear: true,
  sampleDate: true,
  location: true,
  description: true,
  oilType: true,
  remarks: true,
  isTaken: true,
  isDisabled: true,
  photoUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * De velden die OilSample had ná de planningsmodule, maar vóór wensenronde 2.
 * Zolang ./db-push-wensen2.sh nog niet gedraaid is, bestaan partPhotoUrl en de
 * velden van Niet bereikbaar niet; met deze select blijven het object en de
 * annuleervelden wel zichtbaar, in plaats van dat de hele kolom Object wegvalt.
 */
export const SAMPLE_PLANNING_SELECT = {
  ...SAMPLE_BASIS_SELECT,
  objectId: true,
  cancelReason: true,
  cancelledAt: true,
  cancelledBy: true,
  cancelReasonInPdf: true,
} as const;

/**
 * Alle velden van OilSample, inclusief die van wensenronde 2: de tweede foto en
 * de status Niet bereikbaar. Bewust een select en geen include zonder select:
 * een gewone findMany vraagt alle kolommen op en loopt stuk zodra er één nog
 * niet in de database staat.
 */
export const SAMPLE_VOL_SELECT = {
  ...SAMPLE_PLANNING_SELECT,
  installatieId: true,
  partPhotoUrl: true,
  isUnreachable: true,
  unreachableReason: true,
  unreachableNote: true,
  unreachablePhotoUrl: true,
  unreachableAt: true,
  unreachableBy: true,
} as const;

/** De standaardwaarden van de velden uit de planningsmodule, voor de terugval. */
export const SAMPLE_PLANNING_LEEG = {
  objectId: null,
  object: null,
  cancelReason: null,
  cancelledAt: null,
  cancelledBy: null,
  cancelReasonInPdf: true,
} as const;

/** De standaardwaarden van de velden uit wensenronde 2, voor de terugval. */
export const SAMPLE_WENSEN2_LEEG = {
  installatieId: null,
  partPhotoUrl: null,
  isUnreachable: false,
  unreachableReason: null,
  unreachableNote: null,
  unreachablePhotoUrl: null,
  unreachableAt: null,
  unreachableBy: null,
} as const;
