'use client';

import { useEffect } from 'react';

/**
 * Component die fetch() patcht om automatisch credentials: 'include' toe te voegen
 * Dit zorgt ervoor dat alle API calls cookies meesturen, ook in iframe context.
 *
 * BELANGRIJK: alleen voor same-origin (eigen) verzoeken. Externe API's (zoals
 * PDOK en OpenStreetMap) laten we ongemoeid — een cross-origin verzoek mét
 * credentials wordt door de browser geblokkeerd zodra de server met
 * "Access-Control-Allow-Origin: *" antwoordt, en dat brak de plaats-/straat-
 * zoekfunctie van de controlerondes.
 */
export default function FetchPatcher() {
  useEffect(() => {
    // Bewaar originele fetch
    const originalFetch = window.fetch;

    // Patch fetch om credentials toe te voegen (alleen same-origin)
    window.fetch = function(...args) {
      const [resource, config] = args;

      // Bepaal de doel-URL uit de diverse mogelijke resource-typen
      let url = '';
      if (typeof resource === 'string') url = resource;
      else if (resource instanceof URL) url = resource.href;
      else if (resource instanceof Request) url = resource.url;

      let sameOrigin = true;
      try {
        sameOrigin = new URL(url, window.location.origin).origin === window.location.origin;
      } catch {
        sameOrigin = true; // relatieve URL's zijn per definitie same-origin
      }

      // Externe verzoeken ongewijzigd doorlaten
      if (!sameOrigin) {
        return originalFetch(resource, config);
      }

      // Eigen API-calls: credentials meesturen voor cookies in iframe-context
      const newConfig = {
        ...config,
        credentials: 'include' as RequestCredentials,
      };
      return originalFetch(resource, newConfig);
    };

    // Cleanup: herstel originele fetch bij unmount
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null; // Deze component rendert niets
}
