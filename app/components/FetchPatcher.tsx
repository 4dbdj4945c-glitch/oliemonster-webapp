'use client';

import { useEffect } from 'react';

/**
 * Component die fetch() patcht om automatisch credentials: 'include' toe te voegen
 * Dit zorgt ervoor dat alle API calls cookies meesturen, ook in iframe context
 */
export default function FetchPatcher() {
  useEffect(() => {
    // Bewaar originele fetch
    const originalFetch = window.fetch;

    // Patch fetch om credentials toe te voegen
    window.fetch = function(...args) {
      const [resource, config] = args;
      
      // Voeg credentials toe aan de config
      const newConfig = {
        ...config,
        credentials: 'include' as RequestCredentials,
      };

      // Roep originele fetch aan met nieuwe config
      return originalFetch(resource, newConfig);
    };

    // Cleanup: herstel originele fetch bij unmount
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null; // Deze component rendert niets
}
