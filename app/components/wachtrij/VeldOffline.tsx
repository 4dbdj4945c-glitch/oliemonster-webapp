'use client';

/*
  Zorgt dat dit veldscherm ook zonder bereik opent als het eerder geladen was:
  registreert de service worker (public/sw.js) en vraagt hem deze pagina, de
  gegevens van de dag (api) en de scripts en stijlen die de pagina nu gebruikt
  te bewaren. Rendert niets. Alleen in het veldscherm (beheerder en
  gebruiker); de kijker krijgt hem nooit.
*/

import { useEffect } from 'react';

export default function VeldOffline({ api }: { api?: string }) {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    // Alleen via https of op localhost; anders weigert de browser het toch.
    if (!window.isSecureContext) return;
    let actueel = true;
    navigator.serviceWorker
      // Per build een eigen adres: de browser ziet dan een nieuwe worker, die de
      // cache van de vorige build opruimt.
      .register(`/sw.js?v=${encodeURIComponent(process.env.NEXT_PUBLIC_BOUW ?? 'v1')}`, { scope: '/' })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        if (!actueel || !reg.active) return;
        const bronnen = performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((u) => {
            try {
              const url = new URL(u);
              return url.origin === location.origin && url.pathname.startsWith('/_next/static/');
            } catch {
              return false;
            }
          });
        reg.active.postMessage({ soort: 'bewaar', paginas: [location.pathname], api: api ? [api] : [], bronnen });
      })
      .catch(() => {
        // Geen service worker: het veldscherm werkt gewoon, alleen niet zonder bereik openen.
      });
    return () => {
      actueel = false;
    };
  }, [api]);
  return null;
}

/** Bij uitloggen: de bewaarde veldschermen weg, zodat de volgende gebruiker ze niet ziet. */
export async function wisVeldCache(): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    for (const naam of await caches.keys()) if (naam.startsWith('ids-veld-')) await caches.delete(naam);
  } catch {
    // niets te wissen
  }
}
