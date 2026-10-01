'use client';

// Welke kolommen de tabel toont (Beheer > Kolommen aanpassen).

import { useCallback, useEffect, useRef, useState } from 'react';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';

export const STANDAARD_KOLOMMEN = ['status', 'oNumber', 'sampleDate', 'location', 'description', 'oilType'];

/** `begin`: meegekregen van de server (undefined: zelf ophalen; null: niets ingesteld). */
export function useKolommen(onFout: (melding: string) => void, begin?: string[] | null) {
  const [visibleColumns, setVisibleColumns] = useState<string[]>(begin ?? STANDAARD_KOLOMMEN);
  const alGeladen = useRef(begin !== undefined);

  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings');
      if (!response.ok) {
        onFout(await foutTekst(response, 'De kolominstellingen konden niet worden opgehaald, je ziet de standaardkolommen.'));
        return;
      }
      const data = await response.json();
      if (data.columns) setVisibleColumns(data.columns);
    } catch {
      onFout(GEEN_VERBINDING);
    }
  }, [onFout]);

  useEffect(() => {
    if (alGeladen.current) {
      alGeladen.current = false;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSettings();
  }, [loadSettings]);

  return { visibleColumns, loadSettings };
}
