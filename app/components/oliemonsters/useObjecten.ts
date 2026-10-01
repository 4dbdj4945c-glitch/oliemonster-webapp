'use client';

// De objecten voor de kolom Object, het filter en het formulier. Een kijker
// (rol alleen lezen) mag /api/sample-objects niet ophalen; die aanroep slaan we
// dan over, anders krijgt hij een 403 en een rode balk. Hij ziet de kolom en het
// filter ook niet.

import { useCallback, useEffect, useRef, useState } from 'react';
import { foutTekst } from '@/lib/foutmelding';
import type { SampleObject } from './types';

/** `begin`: de objecten zoals de pagina ze van de server meekreeg. */
export function useObjecten(overslaan: boolean, onFout: (melding: string) => void, begin?: SampleObject[] | null) {
  const [objecten, setObjecten] = useState<SampleObject[]>(begin ?? []);
  const [objectenBeschikbaar, setObjectenBeschikbaar] = useState(!!begin);
  const alGeladen = useRef(!!begin);
  // De planning bestaat, tenzij de server zegt dat de tabellen ontbreken (503).
  // Een storing of geen verbinding laat het tabblad staan; de planning toont
  // dan zelf zijn foutmelding.
  const [planningBestaat, setPlanningBestaat] = useState(true);

  const loadObjecten = useCallback(async () => {
    if (overslaan) return;
    try {
      // Alleen id, naam en soort: meer gebruikt de monsterlijst niet.
      const response = await fetch('/api/sample-objects?kort=1');
      if (!response.ok) {
        // 503 betekent: de tabellen staan er nog niet. Dan laten we de kolom en
        // het filter weg in plaats van een melding te tonen.
        setObjectenBeschikbaar(false);
        if (response.status === 503) setPlanningBestaat(false);
        else onFout(await foutTekst(response, 'De objecten konden niet worden opgehaald.'));
        return;
      }
      setObjecten(await response.json());
      setObjectenBeschikbaar(true);
    } catch {
      setObjectenBeschikbaar(false);
    }
  }, [overslaan, onFout]);

  useEffect(() => {
    if (alGeladen.current) {
      alGeladen.current = false;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadObjecten();
  }, [loadObjecten]);

  return { objecten, objectenBeschikbaar, planningBestaat, loadObjecten };
}
