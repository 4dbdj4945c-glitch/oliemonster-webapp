'use client';

// Welke kolommen de tabel toont (Beheer > Kolommen aanpassen).

import { useCallback, useEffect, useState } from 'react';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';

export const STANDAARD_KOLOMMEN = ['status', 'oNumber', 'sampleDate', 'location', 'description', 'oilType'];

export function useKolommen(onFout: (melding: string) => void) {
  const [visibleColumns, setVisibleColumns] = useState<string[]>(STANDAARD_KOLOMMEN);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSettings();
  }, [loadSettings]);

  return { visibleColumns, loadSettings };
}
