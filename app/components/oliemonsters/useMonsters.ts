'use client';

// De monsters van één analysejaar ophalen, met de foutmelding erbij. Zonder die
// melding is "kon niet laden" niet te onderscheiden van "er zijn geen monsters".

import { useCallback, useEffect, useState } from 'react';
import { foutTekst, GEEN_VERBINDING } from '@/lib/foutmelding';
import type { OilSample } from './types';

export function useMonsters(jaar: number, search: string) {
  const [samples, setSamples] = useState<OilSample[]>([]);
  const [loading, setLoading] = useState(true);
  // Pas true als de lijst echt geladen is. Zolang dat niet zo is (fout,
  // offline) toont de pagina alleen de foutmelding: geen tegels met 0, geen lege
  // tabel en geen knoppen die iets aanmaken of overnemen.
  const [lijstGeladen, setLijstGeladen] = useState(false);
  const [foutmelding, setFoutmelding] = useState('');

  /** Haalt de lijst opnieuw op en geeft hem terug (null als dat mislukte). */
  const loadSamples = useCallback(async (): Promise<OilSample[] | null> => {
    try {
      const params = new URLSearchParams({ year: String(jaar) });
      if (search) params.set('search', search);
      const response = await fetch(`/api/samples?${params.toString()}`);
      if (!response.ok) {
        setFoutmelding(await foutTekst(response, 'De monsters konden niet worden opgehaald.'));
        return null;
      }
      const lijst: OilSample[] = await response.json();
      setSamples(lijst);
      setLijstGeladen(true);
      setFoutmelding('');
      return lijst;
    } catch {
      setFoutmelding(GEEN_VERBINDING);
      return null;
    } finally {
      setLoading(false);
    }
  }, [jaar, search]);

  useEffect(() => {
    // Ophalen bij het openen en bij elke zoekopdracht; de state verandert pas na de fetch.
    loadSamples();
  }, [loadSamples]);

  return { samples, setSamples, loading, lijstGeladen, foutmelding, setFoutmelding, loadSamples };
}
