'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

/**
 * Component die session persistentie verbetert door te checken of sessie nog geldig is
 * en gebruiker terug te sturen naar login als sessie verlopen is
 */
export default function SessionPersistence() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Skip check op login en set-password pagina's
    if (pathname === '/login' || pathname === '/set-password' || pathname === '/') {
      return;
    }

    // Check session bij mount en elke 30 seconden
    const checkSession = async () => {
      try {
        const response = await fetch('/api/auth/session', {
          credentials: 'include',
        });

        if (!response.ok) {
          // Session ongeldig, redirect naar login
          router.push('/login');
          return;
        }

        const data = await response.json();
        
        if (!data.isLoggedIn) {
          // Niet ingelogd, redirect naar login
          router.push('/login');
        }
      } catch (error) {
        console.error('Session check failed:', error);
        // Bij netwerk errors niet redirecten
      }
    };

    // Check direct bij mount
    checkSession();

    // Periodieke check elke 30 seconden (optioneel, kan worden uitgeschakeld)
    // const interval = setInterval(checkSession, 30000);

    // Cleanup
    // return () => clearInterval(interval);
  }, [pathname, router]);

  return null;
}
