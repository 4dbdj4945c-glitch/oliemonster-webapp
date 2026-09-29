'use client';

// De offline wachtrij in React: de lijst van deze gebruiker (useWachtrij) en het
// vanzelf versturen (useWachtrijVerzender, één keer in de schil). Logica en
// opslag: lib/wachtrij.ts.

import { useCallback, useEffect, useState } from 'react';
import { browserOpslag, verwerkInBrowser, WACHTRIJ_EVENT, type Invoer } from '@/lib/wachtrij';

/** Elke zoveel tijd opnieuw proberen zolang er iets wacht en de telefoon denkt dat er bereik is. */
const OPNIEUW_MS = 30_000;

export function useWachtrij(gebruiker: string): Invoer[] {
  const [lijst, setLijst] = useState<Invoer[]>([]);
  useEffect(() => {
    let actueel = true;
    const lees = () => {
      browserOpslag
        .alle()
        .then((alle) => {
          if (actueel) setLijst(alle.filter((i) => i.gebruiker === gebruiker).sort((a, b) => a.aangemaakt - b.aangemaakt));
        })
        .catch(() => {});
    };
    lees();
    window.addEventListener(WACHTRIJ_EVENT, lees);
    let kanaal: BroadcastChannel | null = null;
    try {
      kanaal = new BroadcastChannel(WACHTRIJ_EVENT);
      kanaal.onmessage = lees;
    } catch {
      kanaal = null;
    }
    return () => {
      actueel = false;
      window.removeEventListener(WACHTRIJ_EVENT, lees);
      kanaal?.close();
    };
  }, [gebruiker]);
  return lijst;
}

/**
 * Verstuurt de wachtrij vanzelf: bij het openen, zodra de telefoon weer bereik
 * meldt (online) en daarna elke halve minuut zolang er iets wacht.
 */
export function useWachtrijVerzender(gebruiker: string, actief: boolean): { verstuurNu: (ookMislukt?: boolean) => Promise<void>; bezig: boolean } {
  const lijst = useWachtrij(actief ? gebruiker : '');
  const [bezig, setBezig] = useState(false);
  const wacht = lijst.some((i) => i.status === 'wacht');

  const verstuurNu = useCallback(
    async (ookMislukt = false) => {
      if (!actief) return;
      setBezig(true);
      try {
        await verwerkInBrowser(gebruiker, ookMislukt);
      } catch {
        // de fout staat per invoer in de wachtrij
      } finally {
        setBezig(false);
      }
    },
    [actief, gebruiker]
  );

  useEffect(() => {
    if (!actief || !wacht) return;
    const probeer = () => {
      if (navigator.onLine) verwerkInBrowser(gebruiker).catch(() => {});
    };
    probeer();
    window.addEventListener('online', probeer);
    const klok = window.setInterval(probeer, OPNIEUW_MS);
    return () => {
      window.removeEventListener('online', probeer);
      window.clearInterval(klok);
    };
  }, [actief, wacht, gebruiker]);

  return { verstuurNu, bezig };
}
