// Filteren en sorteren van de monsterlijst, los van React zodat het te testen is.

import { sampleStatus, type SampleStatus } from '@/lib/sampleStatus';
import type { OilSample, Sortering } from './types';

export interface LijstFilter {
  status: 'all' | SampleStatus;
  /** 'all', 'geen' (zonder object) of het id van een object als tekst */
  object: string;
  sortBy: Sortering;
  sortOrder: 'asc' | 'desc';
}

export function filterMonsters(samples: OilSample[], filter: Pick<LijstFilter, 'status' | 'object'>): OilSample[] {
  let lijst = samples;
  if (filter.status !== 'all') lijst = lijst.filter((s) => sampleStatus(s) === filter.status);
  if (filter.object === 'geen') lijst = lijst.filter((s) => !s.objectId);
  else if (filter.object !== 'all') lijst = lijst.filter((s) => String(s.objectId ?? '') === filter.object);
  return lijst;
}

export function sorteerMonsters(samples: OilSample[], sortBy: Sortering, sortOrder: 'asc' | 'desc'): OilSample[] {
  const sorted = [...samples];

  // Laatst toegevoegd: hoogste id eerst.
  if (sortBy === 'newest') return sorted.sort((a, b) => b.id - a.id);

  sorted.sort((a, b) => {
    let compareA: string | number;
    let compareB: string | number;

    if (sortBy === 'sampleDate') {
      // Zonder datum achteraan
      if (!a.sampleDate && !b.sampleDate) return 0;
      if (!a.sampleDate) return 1;
      if (!b.sampleDate) return -1;
      compareA = new Date(a.sampleDate).getTime();
      compareB = new Date(b.sampleDate).getTime();
    } else if (sortBy === 'oNumber') {
      compareA = a.oNumber.toLowerCase();
      compareB = b.oNumber.toLowerCase();
    } else {
      compareA = a.location.toLowerCase();
      compareB = b.location.toLowerCase();
    }

    if (sortOrder === 'asc') return compareA < compareB ? -1 : compareA > compareB ? 1 : 0;
    return compareA > compareB ? -1 : compareA < compareB ? 1 : 0;
  });

  return sorted;
}

/** Wat er echt in de tabel staat: gefilterd en gesorteerd. */
export function zichtbareMonsters(samples: OilSample[], filter: LijstFilter): OilSample[] {
  return sorteerMonsters(filterMonsters(samples, filter), filter.sortBy, filter.sortOrder);
}
